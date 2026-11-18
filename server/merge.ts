import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { createBackup, fileDigest, findFileEntry, mustNotExist } from './backup.ts';
import { Library } from './library.ts';
import type { Collection, HistoryEntry, Item } from '../shared/model.ts';
import type { SmartFolder } from '../shared/filters.ts';

type ItemRow = { id: string; data: string };
type HistoryRow = HistoryEntry & { item_id: string; data: string };
export type MergePreview = {
  source: string;
  current: string;
  assets: number;
  notes: number;
  trashed: number;
  folders: number;
  smartFolders: number;
  groups: number;
  revisions: number;
};

function readSource(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    const tables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
      ).map((row) => row.name),
    );
    if (
      !tables.has('schema_info') ||
      db.prepare('SELECT version FROM schema_info').get()?.version !== 1
    )
      throw new Error('Choose an Atlas library made with a compatible version.');
    const folders = db
      .prepare(
        tables.has('collection_tree')
          ? 'SELECT c.id,c.name,coalesce(t.title,c.name) AS title,t.parent_id AS parentId FROM collections c LEFT JOIN collection_tree t ON t.id=c.id'
          : 'SELECT id,name,name AS title,NULL AS parentId FROM collections',
      )
      .all() as Collection[];
    const items = (db.prepare('SELECT id,data FROM items ORDER BY rowid').all() as ItemRow[]).map(
      (row) => parseItem(row.id, row.data),
    );
    const history = (
      db.prepare('SELECT item_id,revision,data,action,actor,at FROM history').all() as HistoryRow[]
    ).map(({ data, ...row }) => {
      const item = parseItem(row.item_id, data);
      if (row.revision !== item.revision) throw new Error('An item has invalid version history.');
      return { ...row, item };
    });
    const smartFolders = tables.has('smart_folders')
      ? (
          db.prepare('SELECT data FROM smart_folders ORDER BY rowid').all() as { data: string }[]
        ).map((row) => JSON.parse(row.data) as SmartFolder)
      : [];
    const groups = tables.has('tag_groups')
      ? (
          db.prepare('SELECT name,data FROM tag_groups ORDER BY name').all() as {
            name: string;
            data: string;
          }[]
        ).map((row) => ({ name: row.name, tags: JSON.parse(row.data) as string[] }))
      : [];
    return { folders, items, history, smartFolders, groups };
  } finally {
    db.close();
  }
}

function parseItem(id: string, data: string): Item {
  const item = JSON.parse(data) as Item;
  if (
    item.id !== id ||
    !['asset', 'note'].includes(item.kind) ||
    typeof item.body !== 'string' ||
    !Array.isArray(item.collections) ||
    !Array.isArray(item.relations)
  )
    throw new Error('The source library contains an unreadable item.');
  if (item.kind === 'asset' && (!item.hash || !/^[a-f0-9]{64}$/.test(item.hash)))
    throw new Error('An original in the source library has an invalid file reference.');
  return item;
}

function outside(parent: string, path: string) {
  const location = relative(parent, path);
  return isAbsolute(location) || location === '..' || location.startsWith('..' + sep);
}

function uniqueName(base: string, names: Set<string>, limit = 80) {
  let name = base.slice(0, limit);
  for (let index = 2; names.has(name); index++) {
    const suffix = ` (${index})`;
    name = base.slice(0, limit - suffix.length) + suffix;
  }
  names.add(name);
  return name;
}

function remapMarkdown(body: string, collisions: Map<string, string>) {
  if (!collisions.size || !body.includes('atlas:')) return body;
  const edits: { start: number; end: number; text: string }[] = [];
  const nodes: ReturnType<typeof fromMarkdown>['children'][number][] = [
    ...fromMarkdown(body).children,
  ];
  while (nodes.length) {
    const node = nodes.pop()!;
    if ('children' in node) nodes.push(...(node.children as typeof nodes));
    if (!('url' in node) || !node.url.startsWith('atlas:')) continue;
    const mapped = collisions.get(node.url.slice(6));
    if (!mapped || !node.position) continue;
    const start = node.position.start.offset!;
    const end = node.position.end.offset!;
    const original = body.slice(start, end);
    // The destination follows the link label. Leave any mention in its title or label intact.
    const delimiter = node.type === 'definition' ? /\]:\s*<?/ : /\]\(\s*<?/;
    const delimiters = [...original.matchAll(new RegExp(delimiter.source, 'g'))];
    const destination = delimiters.findLast((match) =>
      original.startsWith(node.url, match.index + match[0].length),
    );
    if (destination) {
      const offset = start + destination.index + destination[0].length;
      edits.push({ start: offset, end: offset + node.url.length, text: `atlas:${mapped}` });
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return body;
}

function mergeCatalog(target: Library, data: ReturnType<typeof readSource>, sourceName: string) {
  const currentIds = new Set(
    (target.db.prepare('SELECT id FROM items').all() as { id: string }[]).map((row) => row.id),
  );
  const reserved = new Set([...currentIds, ...data.items.map((item) => item.id)]);
  const items = new Map<string, string>();
  for (const item of data.items) {
    if (!currentIds.has(item.id)) continue;
    let id = randomUUID();
    while (reserved.has(id)) id = randomUUID();
    reserved.add(id);
    items.set(item.id, id);
  }
  const currentFolders = target.collections();
  const folders = new Map<string, Collection>();
  const usedNames = new Set(currentFolders.map((folder) => folder.name));
  const topNames = new Set(
    currentFolders
      .filter((folder) => !folder.parentId)
      .map((folder) => folder.title ?? folder.name),
  );
  const groupNames = new Set(target.tagGroups().map((group) => group.name));
  const smartNames = new Set(target.smartFolders().map((folder) => folder.name));
  const insertFolder = target.db.prepare('INSERT INTO collections VALUES(?,?)');
  const insertTree = target.db.prepare('INSERT INTO collection_tree VALUES(?,?,?)');
  const addFolder = (title: string, parent?: Collection) => {
    const id = randomUUID();
    const name = uniqueName(parent ? `${parent.name} / ${title}` : title, usedNames, Infinity);
    insertFolder.run(id, name);
    insertTree.run(id, parent?.id ?? null, title);
    return { id, name, title, parentId: parent?.id ?? null };
  };
  const sourceFolders = new Map(data.folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  const addBranch = (id: string, root: Collection): Collection => {
    const mapped = folders.get(id);
    if (mapped) return mapped;
    const folder = sourceFolders.get(id);
    if (!folder || visited.has(id))
      throw new Error('The source library has an invalid folder tree.');
    visited.add(id);
    const result = addFolder(
      folder.title ?? folder.name,
      folder.parentId ? addBranch(folder.parentId, root) : root,
    );
    folders.set(id, result);
    return result;
  };
  const folderId = (id: string) => {
    const mapped = folders.get(id);
    if (!mapped) throw new Error('The source library references a missing folder.');
    return mapped.id;
  };
  const remap = (item: Item) => {
    const body = item.kind === 'note' ? remapMarkdown(item.body, items) : item.body;
    return {
      ...item,
      id: items.get(item.id) ?? item.id,
      collections: item.collections.map(folderId),
      relations: item.relations.map((relation) => ({
        ...relation,
        target: items.get(relation.target) ?? relation.target,
      })),
      body,
      size: item.kind === 'note' ? Buffer.byteLength(body) : item.size,
    };
  };
  target.db.exec('BEGIN IMMEDIATE');
  try {
    if (data.folders.length) {
      const root = addFolder(uniqueName(`From ${sourceName}`, topNames));
      for (const folder of data.folders) addBranch(folder.id, root);
    }
    const insertItem = target.db.prepare('INSERT INTO items VALUES(?,?)');
    for (const entry of data.items) {
      const item = remap(entry);
      insertItem.run(item.id, JSON.stringify(item));
    }
    const insertHistory = target.db.prepare('INSERT INTO history VALUES(?,?,?,?,?,?)');
    for (const entry of data.history) {
      const item = remap(entry.item);
      insertHistory.run(
        item.id,
        entry.revision,
        JSON.stringify(item),
        entry.action,
        entry.actor,
        entry.at,
      );
    }
    for (const group of data.groups)
      target.setTagGroup(uniqueName(group.name, groupNames), group.tags);
    for (const folder of data.smartFolders) {
      const { id: _id, ...definition } = folder;
      target.saveSmartFolder({
        ...definition,
        name: uniqueName(folder.name, smartNames),
        rules: folder.rules.map((rule) =>
          rule.field === 'folder' && folders.has(rule.value)
            ? { ...rule, value: folderId(rule.value) }
            : rule,
        ),
        addFolder: folder.addFolder ? folderId(folder.addFolder) : undefined,
      });
    }
    target.db.exec('COMMIT');
    return items.size;
  } catch (error) {
    target.db.exec('ROLLBACK');
    throw error;
  }
}

export async function mergeLibraries(
  library: Library,
  source: string,
  destination: string,
  options: {
    review: (preview: MergePreview) => Promise<boolean>;
    progress?: () => void;
  },
) {
  const current = await realpath(library.root);
  source = await realpath(source);
  if (source === current) throw new Error('Choose a different Atlas library to merge.');
  const parent = await realpath(dirname(destination));
  destination = join(parent, basename(destination));
  if (!outside(current, destination) || !outside(source, destination))
    throw new Error('Choose a destination outside both libraries.');
  await mustNotExist(destination);
  const sourceCatalog = join(source, 'catalog.sqlite');
  if (!(await findFileEntry(sourceCatalog))?.isFile())
    throw new Error('Choose an Atlas library folder containing catalog.sqlite.');
  const data = readSource(sourceCatalog);
  const assets = data.items.filter((item) => item.kind === 'asset').length;
  const preview = {
    current,
    source,
    assets,
    notes: data.items.length - assets,
    trashed: data.items.filter((item) => item.trashed).length,
    folders: data.folders.length,
    smartFolders: data.smartFolders.length,
    groups: data.groups.length,
    revisions: data.history.length,
  };
  if (!(await options.review(preview))) return;
  options.progress?.();
  const scratch = await mkdtemp(join(parent, '.atlas-merge-'));
  const merged = join(scratch, 'library');
  try {
    await createBackup(library, merged);
    await rm(join(merged, 'atlas-backup.json'));
    const hashes = new Set(
      [...data.items, ...data.history.map((row) => row.item)]
        .filter((item) => item.kind === 'asset')
        .map((item) => item.hash!),
    );
    for (const hash of hashes) {
      const original = join(source, 'blobs', hash);
      if (!(await findFileEntry(original))?.isFile())
        throw new Error('An original file is missing in the source library.');
      const target = join(merged, 'blobs', hash);
      try {
        await copyFile(original, target, constants.COPYFILE_EXCL);
        if ((await fileDigest(target)) !== hash)
          throw new Error('A source original failed verification.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if ((await fileDigest(original)) !== hash)
          throw new Error('A source original failed verification.');
      }
    }
    const result = new Library(merged);
    let collisions: number;
    try {
      collisions = mergeCatalog(result, data, basename(source));
    } finally {
      result.close();
    }
    await mustNotExist(destination);
    await rename(merged, destination);
    return { ...preview, path: destination, collisions };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
