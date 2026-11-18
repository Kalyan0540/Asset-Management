import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, readFile, readdir, mkdir, rm, rename, realpath, open } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Library } from './library.ts';
import { previewTypes } from './media.ts';
import type { Item } from '../shared/model.ts';

type Metadata = Record<string, unknown>;
export type EagleReport = {
  format: 'atlas-eagle-import';
  version: 1;
  createdAt: string;
  sourceName: string;
  imported: number;
  skipped: number;
  originals: number;
  bookmarks: number;
  issues: { item: string; message: string }[];
  libraryMetadata: Metadata;
  mappings: { eagleId: string; atlasId: string; hash: string | null }[];
};
const object = (v: unknown): Metadata => {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Expected a metadata object.');
  return v as Metadata;
};
const string = (v: unknown) => (typeof v === 'string' ? v : '');
function date(v: unknown, fallback: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}
async function regular(path: string, directory = false) {
  const s = await lstat(path);
  if (directory ? !s.isDirectory() : !s.isFile())
    throw new Error('Links and special files are not imported.');
  return s;
}
async function metadata(path: string) {
  const s = await regular(path);
  if (s.size > 8_000_000) throw new Error('Metadata exceeds the 8 MB safety limit.');
  const raw = await readFile(path, 'utf8');
  return { raw, data: object(JSON.parse(raw)) };
}
const validName = (name: string) =>
  name.length > 0 && name !== '.' && name !== '..' && !/[\\/\x00-\x1f]/.test(name);
function outside(source: string, target: string) {
  const rel = relative(source, target);
  return isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep);
}
async function hashFile(path: string) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
}

/** Read Eagle only. Publish a new Atlas library after copying and verifying bytes. */
export async function importEagleLibrary(
  source: string,
  destination: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {},
) {
  source = resolve(source);
  destination = resolve(destination);
  await regular(source, true);
  const canonicalSource = await realpath(source);
  const parent = await realpath(resolve(destination, '..'));
  if (!outside(canonicalSource, join(parent, destination.split(sep).at(-1)!)))
    throw new Error('Choose a destination outside your Eagle library.');
  try {
    await lstat(destination);
    throw new Error('Choose a new destination folder.');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await regular(join(source, 'images'), true);
  const root = await metadata(join(source, 'metadata.json'));
  if (!Array.isArray(root.data.folders))
    throw new Error('Unsupported Eagle library: missing folder list.');
  const entries = (await readdir(join(source, 'images'), { withFileTypes: true }))
    .filter((e) => e.name.endsWith('.info'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const temp = destination + '.partial-' + randomUUID();
  await mkdir(temp, { mode: 0o700 });
  let library: Library | undefined;
  const report: EagleReport = {
    format: 'atlas-eagle-import',
    version: 1,
    createdAt: new Date().toISOString(),
    sourceName: source.split(sep).at(-1)!,
    imported: 0,
    skipped: 0,
    originals: 0,
    bookmarks: 0,
    issues: [],
    libraryMetadata: root.data,
    mappings: [],
  };
  const warn = (item: string, message: string) => report.issues.push({ item, message });
  try {
    library = new Library(temp);
    const folders = new Map<string, string>();
    const paths = new Set<string>();
    const walk = (values: unknown[], parents: string[] = [], depth = 0) => {
      if (depth > 100) throw new Error('Eagle folder nesting exceeds the supported limit.');
      for (const value of values) {
        const f = object(value),
          id = string(f.id),
          name = string(f.name) || 'Untitled';
        if (!id || folders.has(id)) throw new Error('Duplicate or missing Eagle folder ID.');
        const path = [...parents, name].join(' / ');
        const unique = paths.has(path) ? `${path} [${id}]` : path;
        paths.add(unique);
        folders.set(id, library!.createCollection(unique).id);
        if (Array.isArray(f.children)) walk(f.children, [...parents, name], depth + 1);
      }
    };
    walk(root.data.folders);
    warn(
      'Library',
      'Nested folders are represented as full-path collection names. Smart folders, tag groups, ratings, palettes and other Eagle-only properties are preserved in source metadata, not implemented as Atlas features.',
    );
    const seen = new Set<string>();
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      const directory = join(source, 'images', entry.name);
      try {
        await regular(directory, true);
        const meta = await metadata(join(directory, 'metadata.json'));
        const m = meta.data,
          id = string(m.id) || entry.name.slice(0, -5);
        if (seen.has(id)) throw new Error('Duplicate Eagle item ID.');
        seen.add(id);
        const name = string(m.name),
          ext = string(m.ext).replace(/^\./, '');
        const filename = ext ? `${name}.${ext}` : name;
        if (!validName(filename)) throw new Error('Unsafe or missing original filename.');
        const tags = Array.isArray(m.tags)
          ? [
              ...new Set(
                m.tags
                  .filter((v): v is string => typeof v === 'string')
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ]
          : [];
        if (tags.length > 100 || tags.some((t) => t.length > 80))
          throw new Error('Tags exceed Atlas limits; item was not truncated.');
        const memberships: string[] = [];
        for (const folder of Array.isArray(m.folders) ? m.folders : []) {
          if (typeof folder !== 'string') continue;
          if (!folders.has(folder)) {
            folders.set(folder, library.createCollection(`Unresolved Eagle folder / ${folder}`).id);
            warn(id, `Folder ${folder} was missing from the folder tree.`);
          }
          memberships.push(folders.get(folder)!);
        }
        if (memberships.length > 100)
          throw new Error('Collection memberships exceed Atlas limits.');
        const now = report.createdAt;
        let asset: {
          hash: string | null;
          size: number;
          mime: string;
          kind: 'asset' | 'note';
          body: string;
        };
        const original = join(directory, filename);
        let exists = true;
        try {
          await lstat(original);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
          exists = false;
        }
        if (
          !exists &&
          ['url', 'website', 'webloc'].includes(ext.toLowerCase()) &&
          /^https?:\/\//i.test(string(m.url))
        ) {
          asset = {
            hash: null,
            size: Buffer.byteLength(string(m.url)),
            mime: 'text/markdown',
            kind: 'note',
            body: string(m.url),
          };
          warn(id, 'Website bookmark imported as a note; Eagle preview is not an original asset.');
        } else {
          if (!exists)
            throw new Error('Original file is missing; thumbnails are never substituted.');
          const before = await regular(original);
          const staging = join(temp, 'staging', randomUUID());
          const hash = createHash('sha256');
          let size = 0;
          try {
            await pipeline(
              createReadStream(original),
              new Transform({
                transform(chunk, _encoding, cb) {
                  size += chunk.length;
                  hash.update(chunk);
                  cb(null, chunk);
                },
              }),
              createWriteStream(staging, { flags: 'wx', mode: 0o600 }),
              { signal: options.signal },
            );
            const after = await regular(original);
            if (
              before.size !== after.size ||
              before.mtimeMs !== after.mtimeMs ||
              size !== after.size
            )
              throw new Error('Original changed during import. Close Eagle and try again.');
            const digest = hash.digest('hex');
            if ((await hashFile(staging)) !== digest)
              throw new Error('Copied original failed hash verification.');
            const handle = await open(staging, 'r+');
            try {
              await handle.sync();
            } finally {
              await handle.close();
            }
            const blob = join(temp, 'blobs', digest);
            try {
              await lstat(blob);
              await rm(staging);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
              await rename(staging, blob);
            }
            asset = {
              hash: digest,
              size,
              mime: previewTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream',
              kind: 'asset',
              body: '',
            };
            if (typeof m.size === 'number' && m.size !== size)
              warn(id, 'Eagle reported a different file size; actual copied bytes were used.');
          } finally {
            await rm(staging, { force: true });
          }
        }
        if ((await readFile(join(directory, 'metadata.json'), 'utf8')) !== meta.raw)
          throw new Error('Metadata changed during import. Close Eagle and try again.');
        const title = (name || filename).slice(0, 250);
        const description = string(m.annotation).slice(0, 20000);
        if (title !== name || description !== string(m.annotation))
          warn(id, 'Display text was shortened; full values remain in preserved source metadata.');
        const item = library.importEagleItem({
          ...asset,
          title,
          description,
          tags,
          collections: [...new Set(memberships)],
          relations: [],
          favorite: typeof m.star === 'number' && m.star > 0,
          trashed: m.isDeleted === true,
          createdAt: date(m.btime, now),
          updatedAt: date(m.modificationTime ?? m.mtime, now),
          filename: asset.kind === 'asset' ? filename : '',
          source: { provider: 'eagle', id, metadata: m },
        });
        report.imported++;
        asset.kind === 'asset' ? report.originals++ : report.bookmarks++;
        report.mappings.push({ eagleId: id, atlasId: item.id, hash: item.hash });
      } catch (error) {
        options.signal?.throwIfAborted();
        if (
          (error as NodeJS.ErrnoException).code?.includes('SQLITE') ||
          ['ENOSPC', 'EIO', 'EROFS', 'EMFILE'].includes((error as NodeJS.ErrnoException).code ?? '')
        )
          throw error;
        report.skipped++;
        warn(entry.name, (error as Error).message);
      }
      options.onProgress?.(report.imported + report.skipped, entries.length);
    }
    options.signal?.throwIfAborted();
    if ((await readFile(join(source, 'metadata.json'), 'utf8')) !== root.raw)
      throw new Error('Eagle folder metadata changed during import. Close Eagle and retry.');
    library.db.exec(
      'CREATE TABLE IF NOT EXISTS import_reports(id TEXT PRIMARY KEY, data TEXT NOT NULL)',
    );
    library.db
      .prepare('INSERT INTO import_reports VALUES(?,?)')
      .run(randomUUID(), JSON.stringify(report));
    const file = await open(join(temp, 'eagle-import-report.json'), 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(report, null, 2));
      await file.sync();
    } finally {
      await file.close();
    }
    library.close();
    library = undefined;
    await rename(temp, destination);
    return { path: destination, report };
  } catch (error) {
    library?.close();
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
