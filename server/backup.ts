import { backup, DatabaseSync } from 'node:sqlite';
import { mkdir, cp, readFile, writeFile, rm, rename, access, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Library } from './library.ts';
import type { Item } from '../shared/model.ts';

async function digest(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function mustNotExist(path: string) {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Choose a new folder; existing files will not be overwritten.');
}
function hashes(database: string) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const schema = db.prepare('SELECT version FROM schema_info').get() as
      { version: number } | undefined;
    if (schema?.version !== 1)
      throw new Error('This backup was made with an incompatible version of Atlas.');
    const items = (db.prepare('SELECT data FROM items').all() as { data: string }[]).map(
      (r) => JSON.parse(r.data) as Item,
    );
    const snapshots = (db.prepare('SELECT data FROM history').all() as { data: string }[]).map(
      (r) => JSON.parse(r.data) as Item,
    );
    const values = [
      ...new Set([...items, ...snapshots].filter((i) => i.kind === 'asset').map((i) => i.hash)),
    ];
    if (values.some((hash) => !hash || !/^[a-f0-9]{64}$/.test(hash)))
      throw new Error('The backup contains invalid file references.');
    return { hashes: values as string[], count: items.length };
  } finally {
    db.close();
  }
}
export async function createBackup(library: Library, destination: string) {
  destination = resolve(destination);
  const location = relative(resolve(library.root), destination);
  if (!location || (!location.startsWith('..' + sep) && location !== '..' && !isAbsolute(location)))
    throw new Error('Choose a backup location outside the library.');
  await mustNotExist(destination);
  await mkdir(dirname(destination), { recursive: true });
  const temp = destination + '.partial-' + randomUUID();
  await mkdir(join(temp, 'blobs'), { recursive: true });
  try {
    await backup(library.db, join(temp, 'catalog.sqlite'));
    const manifest = hashes(join(temp, 'catalog.sqlite'));
    for (const hash of manifest.hashes) {
      const target = join(temp, 'blobs', hash);
      await cp(join(library.root, 'blobs', hash), target);
      if ((await digest(target)) !== hash)
        throw new Error('An original file failed verification. Backup was not completed.');
    }
    await writeFile(
      join(temp, 'atlas-backup.json'),
      JSON.stringify(
        {
          format: 'atlas-backup',
          version: 1,
          createdAt: new Date().toISOString(),
          items: manifest.count,
          files: manifest.hashes.length,
        },
        null,
        2,
      ),
    );
    await rename(temp, destination);
    return { path: destination, items: manifest.count, files: manifest.hashes.length };
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
export async function restoreBackup(source: string, destination: string) {
  source = resolve(source);
  destination = resolve(destination);
  await mustNotExist(destination);
  for (const name of ['atlas-backup.json', 'catalog.sqlite']) {
    if (!(await lstat(join(source, name))).isFile())
      throw new Error('The backup contains a link or unsupported file.');
  }
  const meta = JSON.parse(await readFile(join(source, 'atlas-backup.json'), 'utf8'));
  if (meta.format !== 'atlas-backup' || meta.version !== 1)
    throw new Error('This is not a supported Atlas backup.');
  const manifest = hashes(join(source, 'catalog.sqlite'));
  const temp = destination + '.partial-' + randomUUID();
  await mkdir(join(temp, 'blobs'), { recursive: true });
  try {
    await cp(join(source, 'catalog.sqlite'), join(temp, 'catalog.sqlite'));
    for (const hash of manifest.hashes) {
      if (!(await lstat(join(source, 'blobs', hash))).isFile())
        throw new Error('The backup contains a link instead of an original file.');
      const target = join(temp, 'blobs', hash);
      await cp(join(source, 'blobs', hash), target);
      if ((await digest(target)) !== hash)
        throw new Error(
          'A file in this backup is missing or damaged. Your current library has not been changed.',
        );
    }
    await rename(temp, destination);
    return destination;
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
}
