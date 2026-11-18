import { matchesSmartFolder, smartFolderSchema, type SmartFolder } from '../shared/filters.ts';
import { eagleFolders } from './eagle-folders.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  noteSchema,
  patchSchema,
  type Item,
  type ItemPatch,
  type Collection,
  type HistoryEntry,
  type TagChange,
} from '../shared/model.ts';

export class LibraryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Library {
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'blobs'), { recursive: true, mode: 0o700 });
    mkdirSync(join(root, 'staging'), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(root, 'catalog.sqlite'));
    chmodSync(join(root, 'catalog.sqlite'), 0o600);
    const hasSchema = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_info'")
      .get();
    if (
      hasSchema &&
      (this.db.prepare('SELECT version FROM schema_info').get() as { version: number } | undefined)
        ?.version !== 1
    ) {
      this.db.close();
      throw new Error('Unsupported library schema. Open with a compatible application version.');
    }
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_info(version INTEGER NOT NULL);
      INSERT INTO schema_info SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_info);
      CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS collection_tree(
        id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES collections(id), title TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS smart_folders(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tag_groups(name TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(item_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
        action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(item_id, revision));`);
    if (
      (this.db.prepare('SELECT version FROM schema_info').get() as { version: number }).version !==
      1
    ) {
      this.db.close();
      throw new Error('Unsupported library schema. Open with a compatible application version.');
    }
  }
  close() {
    this.db.close();
  }
  list(): Item[] {
    return (
      this.db.prepare('SELECT data FROM items ORDER BY rowid DESC').all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  get(id: string): Item {
    const row = this.db.prepare('SELECT data FROM items WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new LibraryError(404, 'Item not found');
    return JSON.parse(row.data);
  }
  collections(): Collection[] {
    return this.db
      .prepare(
        'SELECT c.id,c.name,coalesce(t.title,c.name) AS title,t.parent_id AS parentId FROM collections c LEFT JOIN collection_tree t ON t.id=c.id ORDER BY title,c.id',
      )
      .all() as Collection[];
  }
  private addCollection(title: string, parentId: string | null, legacyName?: string, reuse = true) {
    const folders = this.collections();
    const parent = parentId ? folders.find((folder) => folder.id === parentId) : undefined;
    if (parentId && !parent) throw new LibraryError(400, 'Parent folder not found.');
    const existing = folders.find(
      (folder) => folder.title === title && folder.parentId === parentId,
    );
    if (existing && reuse) return existing;
    const id = randomUUID();
    let name = legacyName ?? (parent ? `${parent.name} / ${title}` : title);
    if (folders.some((folder) => folder.name === name)) name += ` [${id}]`;
    this.db.prepare('INSERT INTO collections(id,name) VALUES(?,?)').run(id, name);
    this.db.prepare('INSERT INTO collection_tree VALUES(?,?,?)').run(id, parentId, title);
    return { id, name, title, parentId };
  }
  createCollection(name: string, parentId: string | null = null) {
    return this.transaction(() => this.addCollection(name, parentId));
  }
  importEagleCollections(input: unknown) {
    return this.transaction(() => {
      const mapped = new Map<string, string>();
      for (const folder of eagleFolders(input)) {
        const parent = folder.parentId ? mapped.get(folder.parentId)! : null;
        mapped.set(folder.id, this.addCollection(folder.title, parent, folder.oldName, false).id);
      }
      return mapped;
    });
  }
  createUntitledCollection(parentId: string | null = null) {
    return this.transaction(() => {
      const names = new Set(
        this.collections()
          .filter((folder) => folder.parentId === parentId)
          .map((folder) => folder.title),
      );
      let title = 'Untitled folder';
      for (let n = 2; names.has(title); n++) title = `Untitled folder ${n}`;
      return this.addCollection(title, parentId);
    });
  }
  renameCollection(id: string, title: string) {
    return this.transaction(() => {
      const folders = this.collections();
      const folder = folders.find((candidate) => candidate.id === id);
      if (!folder) throw new LibraryError(404, 'Folder not found.');
      if (
        folders.some(
          (candidate) =>
            candidate.id !== id &&
            candidate.title === title &&
            candidate.parentId === folder.parentId,
        )
      )
        throw new LibraryError(409, 'A folder at this level already uses this name.');
      const parent = folders.find((candidate) => candidate.id === folder.parentId);
      let name = parent ? `${parent.name} / ${title}` : title;
      if (folders.some((candidate) => candidate.id !== id && candidate.name === name))
        name += ` [${id}]`;
      this.db.prepare('UPDATE collections SET name=? WHERE id=?').run(name, id);
      this.db
        .prepare(
          'INSERT INTO collection_tree VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title',
        )
        .run(id, folder.parentId ?? null, title);
      return { id, name, title, parentId: folder.parentId ?? null };
    });
  }
  eagleFolderRepair() {
    const exists = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='import_reports'")
      .get();
    const row = exists
      ? (this.db.prepare('SELECT data FROM import_reports ORDER BY rowid DESC LIMIT 1').get() as
          { data: string } | undefined)
      : undefined;
    const report = row ? JSON.parse(row.data) : null;
    const folders = this.collections();
    const parentMatches = new Map<string, Collection>();
    const changes: { id: string; parentId: string; title: string; from: string }[] = [];
    const skipped: string[] = [];
    if (report?.format === 'atlas-eagle-import' && !report.folderTreePreserved) {
      for (const source of eagleFolders(report.libraryMetadata.folders)) {
        const match = folders.find((folder) => folder.name === source.oldName);
        const parent = source.parentId ? parentMatches.get(source.parentId) : undefined;
        if (!match || (source.parentId && !parent)) {
          skipped.push(source.oldName);
          continue;
        }
        if (parent && match.parentId !== parent.id) {
          if (match.parentId || parent.id === match.id) {
            skipped.push(source.oldName);
            continue;
          }
          changes.push({
            id: match.id,
            parentId: parent.id,
            title: source.title,
            from: match.name,
          });
        }
        parentMatches.set(source.id, match);
      }
    }
    const key = createHash('sha256')
      .update(JSON.stringify({ folders, changes, skipped }))
      .digest('hex');
    return { changes, skipped, key };
  }
  repairEagleFolders(key: string) {
    return this.transaction(() => {
      const plan = this.eagleFolderRepair();
      if (key !== plan.key)
        throw new LibraryError(409, 'The folders changed. Review the repair again.');
      const set = this.db.prepare(
        'INSERT INTO collection_tree VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,title=excluded.title',
      );
      for (const folder of plan.changes) set.run(folder.id, folder.parentId, folder.title);
      return plan;
    });
  }
  smartFolders(): SmartFolder[] {
    return (
      this.db.prepare('SELECT data FROM smart_folders ORDER BY rowid').all() as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  saveSmartFolder(input: unknown, id = randomUUID() as string) {
    const data = smartFolderSchema.parse(input);
    if (data.addFolder && !this.collections().some((folder) => folder.id === data.addFolder))
      throw new LibraryError(400, 'The import rule folder does not exist.');
    if (
      (data.addFolder || data.addTag) &&
      data.rules.some((rule) => ['shape', 'color'].includes(rule.field))
    )
      throw new LibraryError(
        400,
        'Automatic import actions need rules that can be evaluated before previewing a file.',
      );
    const folder = { ...data, id };
    this.db
      .prepare(
        'INSERT INTO smart_folders VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(id, JSON.stringify(folder));
    return folder;
  }
  deleteSmartFolder(id: string) {
    this.db.prepare('DELETE FROM smart_folders WHERE id=?').run(id);
  }
  tagGroups(): { name: string; tags: string[] }[] {
    return (
      this.db.prepare('SELECT name,data FROM tag_groups ORDER BY name').all() as {
        name: string;
        data: string;
      }[]
    ).map((row) => ({ name: row.name, tags: JSON.parse(row.data) }));
  }
  setTagGroup(name: string, tags: string[]) {
    this.db
      .prepare(
        'INSERT INTO tag_groups VALUES(?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data',
      )
      .run(name, JSON.stringify(tags));
  }
  renameTagGroup(from: string, name: string, tags: string[], merge = false) {
    return this.transaction(() => {
      const groups = this.tagGroups();
      if (!groups.some((group) => group.name === from))
        throw new LibraryError(404, 'This tag group no longer exists.');
      const destination = groups.find((group) => group.name === name && name !== from);
      if (destination && !merge) throw new LibraryError(409, 'A tag group already uses this name.');
      if (merge && !destination)
        throw new LibraryError(409, 'The destination tag group no longer exists.');
      const combined = [...new Set([...(destination?.tags ?? []), ...tags])];
      if (combined.length > 100)
        throw new LibraryError(400, 'A tag group can have up to 100 tags.');
      this.deleteTagGroup(from);
      this.setTagGroup(name, combined);
    });
  }
  deleteTagGroup(name: string) {
    this.db.prepare('DELETE FROM tag_groups WHERE name=?').run(name);
  }
  private planTagChange({ from, to }: TagChange) {
    if (from === to) throw new LibraryError(400, 'Enter a different tag name.');
    const allItems = this.list();
    const allGroups = this.tagGroups();
    const allFolders = this.smartFolders();
    // Smart folder comparisons are case-insensitive, while tag names are case-sensitive.
    const sameRule = (value: string) => value.toLowerCase() === from.toLowerCase();
    const hasOtherSpelling =
      [...allItems, ...allGroups].some((entry) =>
        entry.tags.some((tag) => tag !== from && sameRule(tag)),
      ) ||
      allFolders.some(
        (folder) => folder.addTag && folder.addTag !== from && sameRule(folder.addTag),
      );
    const exactRule = (rule: SmartFolder['rules'][number]) =>
      !hasOtherSpelling &&
      rule.field === 'tag' &&
      rule.operator !== 'contains' &&
      sameRule(rule.value);
    const items = allItems.filter((item) => item.tags.includes(from));
    const groups = allGroups.filter((group) => group.tags.includes(from));
    const folders = allFolders.filter(
      (folder) => folder.addTag === from || folder.rules.some(exactRule),
    );
    const merge =
      [...allItems, ...allGroups].some((entry) => entry.tags.includes(to)) ||
      allFolders.some((folder) => folder.addTag === to);
    const preview = {
      from,
      to,
      key: createHash('sha256')
        .update(
          JSON.stringify({
            from,
            to,
            items: items.map(({ id, revision }) => [id, revision]),
            groups,
            folders,
            merge,
            hasOtherSpelling,
          }),
        )
        .digest('hex'),
      items: items.length,
      trashed: items.filter((item) => item.trashed).length,
      groups: groups.length,
      smartFolders: folders.length,
      merge,
    };
    return { preview, items, groups, folders, exactRule };
  }
  previewTagChange(change: TagChange) {
    return this.planTagChange(change).preview;
  }
  changeTag(change: TagChange, key: string, actor: string) {
    return this.transaction(() => {
      const { preview, items, groups, folders, exactRule } = this.planTagChange(change);
      if (preview.key !== key)
        throw new LibraryError(409, 'The library changed. Review the tag change again.');
      const replace = (tags: string[]) => [
        ...new Set(tags.map((tag) => (tag === change.from ? change.to : tag))),
      ];
      const updatedAt = new Date().toISOString();
      for (const item of items) {
        this.save(
          { ...item, tags: replace(item.tags), updatedAt, revision: item.revision + 1 },
          preview.merge ? 'merge tag' : 'rename tag',
          actor,
        );
      }
      for (const group of groups) this.setTagGroup(group.name, replace(group.tags));
      for (const folder of folders) {
        const { id, ...data } = folder;
        this.saveSmartFolder(
          {
            ...data,
            addTag: data.addTag === change.from ? change.to : data.addTag,
            rules: data.rules.map((rule) =>
              exactRule(rule) ? { ...rule, value: change.to } : rule,
            ),
          },
          id,
        );
      }
      return preview;
    });
  }
  private save(item: Item, action: string, actor: string) {
    this.db
      .prepare(
        'INSERT INTO items(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(item.id, JSON.stringify(item));
    this.db
      .prepare('INSERT INTO history VALUES(?,?,?,?,?,?)')
      .run(item.id, item.revision, JSON.stringify(item), action, actor, item.updatedAt);
    return item;
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  private base(title: string): Item {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      kind: 'note',
      title,
      description: '',
      tags: [],
      collections: [],
      relations: [],
      body: '',
      favorite: false,
      trashed: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      filename: '',
      mime: 'text/markdown',
      size: 0,
      hash: null,
    };
  }
  createNote(input: unknown, actor = 'ui') {
    const { title, body } = noteSchema.parse(input);
    return this.transaction(() =>
      this.save({ ...this.base(title), body, size: Buffer.byteLength(body) }, 'create note', actor),
    );
  }
  createCaptureNote({
    title,
    body,
    sourceUrl,
    tags,
  }: Pick<Item, 'title' | 'body' | 'sourceUrl' | 'tags'>) {
    return this.transaction(() =>
      this.save(
        { ...this.base(title), body, size: Buffer.byteLength(body), sourceUrl, tags },
        'capture note',
        'chrome-capture',
      ),
    );
  }
  importAsset(
    data: {
      filename: string;
      mime: string;
      size: number;
      hash: string;
      sourceUrl?: string;
      tags?: string[];
    },
    actor = 'ui',
    collection?: string,
  ) {
    return this.transaction(() => {
      const item: Item = {
        ...this.base(data.filename),
        ...data,
        kind: 'asset',
        importedAt: new Date().toISOString(),
      };
      if (collection) {
        if (!this.collections().some((folder) => folder.id === collection))
          throw new LibraryError(400, 'Import folder not found.');
        item.collections = [collection];
      }
      const rules = this.smartFolders().filter(
        (folder) => (folder.addTag || folder.addFolder) && matchesSmartFolder(item, folder),
      );
      this.save(item, 'import', actor);
      if (!rules.length) return item;
      const tags = [
        ...new Set([
          ...item.tags,
          ...rules.flatMap((folder) => (folder.addTag ? [folder.addTag] : [])),
        ]),
      ].slice(0, 100);
      const collections = [
        ...new Set([
          ...item.collections,
          ...rules.flatMap((folder) => (folder.addFolder ? [folder.addFolder] : [])),
        ]),
      ].slice(0, 100);
      return this.save({ ...item, tags, collections, revision: 2 }, 'import rules', actor);
    });
  }
  importEagleItem(data: Omit<Item, 'id' | 'revision'>) {
    return this.transaction(() =>
      this.save({ ...data, id: randomUUID(), revision: 1 }, 'import Eagle', 'eagle-import'),
    );
  }
  patch(id: string, input: ItemPatch, actor = 'ui') {
    return this.transaction(() => this.update(id, input, actor));
  }
  private update(id: string, input: ItemPatch, actor: string) {
    const { expectedRevision, ...changes } = patchSchema.parse(input);
    const current = this.get(id);
    if (current.revision !== expectedRevision)
      throw new LibraryError(
        409,
        'This item changed elsewhere. Reload it before saving; your draft has been kept.',
      );
    if (changes.body !== undefined && current.kind !== 'note')
      throw new LibraryError(400, 'Only notes have editable bodies');
    for (const collection of changes.collections ?? []) {
      if (!this.db.prepare('SELECT id FROM collections WHERE id=?').get(collection))
        throw new LibraryError(400, 'Unknown collection');
    }
    for (const relation of changes.relations ?? []) {
      if (relation.target === id) throw new LibraryError(400, 'An item cannot relate to itself');
      this.get(relation.target);
    }
    const next = {
      ...current,
      ...changes,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (next.kind === 'note') next.size = Buffer.byteLength(next.body);
    return this.save(
      next,
      changes.trashed === true ? 'trash' : changes.trashed === false ? 'restore' : 'edit',
      actor,
    );
  }
  batch(changes: { id: string; patch: ItemPatch }[], actor = 'ui') {
    if (new Set(changes.map((c) => c.id)).size !== changes.length)
      throw new LibraryError(400, 'An item can only appear once in a batch.');
    return this.transaction(() =>
      changes.map((change) => this.update(change.id, change.patch, actor)),
    );
  }
  applyAi(id: string, item: Item, patch: ItemPatch, job: unknown) {
    return this.transaction(() => {
      const updated = this.update(item.id, patch, 'ai-reviewed');
      this.db.prepare('UPDATE ai_jobs SET data=? WHERE id=?').run(JSON.stringify(job), id);
      return updated;
    });
  }
  history(id: string): HistoryEntry[] {
    this.get(id);
    return this.db
      .prepare(
        'SELECT revision,at,action,actor FROM history WHERE item_id=? ORDER BY revision DESC',
      )
      .all(id) as HistoryEntry[];
  }
  restore(id: string, revision: number, expectedRevision: number, actor = 'ui') {
    const row = this.db
      .prepare('SELECT data FROM history WHERE item_id=? AND revision=?')
      .get(id, revision) as { data: string } | undefined;
    if (!row) throw new LibraryError(404, 'Revision not found');
    const old: Item = JSON.parse(row.data);
    return this.patch(
      id,
      {
        expectedRevision,
        title: old.title,
        description: old.description,
        tags: old.tags,
        collections: old.collections,
        relations: old.relations,
        ...(old.kind === 'note' ? { body: old.body } : {}),
        favorite: old.favorite,
        rating: old.rating ?? 0,
        sourceUrl: old.sourceUrl ?? '',
        trashed: old.trashed,
      },
      actor,
    );
  }
}
