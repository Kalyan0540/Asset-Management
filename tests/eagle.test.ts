import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { importEagleLibrary } from '../server/eagle.ts';
import { Library } from '../server/library.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-eagle-'));
  const source = join(dir, 'Design.library');
  await mkdir(join(source, 'images'), { recursive: true });
  await writeFile(
    join(source, 'metadata.json'),
    JSON.stringify({
      folders: [{ id: 'parent', name: 'Design', children: [{ id: 'child', name: 'Inspiration' }] }],
      smartFolders: [{ id: 'smart' }],
    }),
  );
  const add = async (id: string, data: Record<string, unknown>, content?: Buffer) => {
    const path = join(source, 'images', id + '.info');
    await mkdir(path);
    await writeFile(join(path, 'metadata.json'), JSON.stringify({ id, ...data }));
    if (content) await writeFile(join(path, `${data.name}.${data.ext}`), content);
  };
  return { dir, source, add };
}
test('Eagle import preserves bytes, dates, tags, folder paths, raw metadata and survives backup', async () => {
  const f = await fixture();
  const bytes = Buffer.from('original design file');
  try {
    await f.add(
      'one',
      {
        name: 'Design',
        ext: 'psd',
        tags: ['work', 'work'],
        folders: ['child'],
        annotation: 'A reference',
        url: 'https://example.com',
        star: 4,
        btime: 1700000000000,
        modificationTime: 1700000001000,
        palettes: [{ color: [1, 2, 3] }],
      },
      bytes,
    );
    await f.add(
      'two',
      { name: 'Duplicate', ext: 'psd', tags: [], folders: ['parent'], isDeleted: true },
      bytes,
    );
    await f.add('link', { name: 'Website', ext: 'url', url: 'https://example.com', folders: [] });
    const before = await readFile(join(f.source, 'images', 'one.info', 'metadata.json'));
    const result = await importEagleLibrary(f.source, join(f.dir, 'Atlas'));
    assert.equal(result.report.imported, 3);
    assert.equal(result.report.skipped, 0);
    const lib = new Library(result.path);
    try {
      const item = lib.list().find((i) => i.source?.id === 'one')!;
      assert.equal(item.hash, createHash('sha256').update(bytes).digest('hex'));
      assert.deepEqual(await readFile(join(lib.root, 'blobs', item.hash!)), bytes);
      assert.equal((await readdir(join(lib.root, 'blobs'))).length, 1);
      assert.deepEqual(item.tags, ['work']);
      assert.equal(item.description, 'A reference');
      assert.equal(item.createdAt, new Date(1700000000000).toISOString());
      assert.equal(item.source?.metadata.star, 4);
      assert.equal(item.favorite, true);
      assert.equal(
        lib.collections().find((c) => c.id === item.collections[0])?.name,
        'Design / Inspiration',
      );
      const child = lib.collections().find((c) => c.id === item.collections[0])!;
      assert.equal(child.title, 'Inspiration');
      assert.equal(lib.collections().find((c) => c.id === child.parentId)?.title, 'Design');
      assert.equal(lib.list().find((i) => i.source?.id === 'two')?.trashed, true);
      assert.equal(lib.list().find((i) => i.source?.id === 'link')?.body, 'https://example.com');
      await createBackup(lib, join(f.dir, 'Backup'));
    } finally {
      lib.close();
    }
    await restoreBackup(join(f.dir, 'Backup'), join(f.dir, 'Restored'));
    const restored = new Library(join(f.dir, 'Restored'));
    assert.equal(restored.list().length, 3);
    assert.ok(restored.db.prepare('SELECT data FROM import_reports').get());
    restored.close();
    assert.deepEqual(await readFile(join(f.source, 'images', 'one.info', 'metadata.json')), before);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test('Eagle import reports damaged originals and rejects traversal, ambiguous thumbnails and links', async () => {
  const f = await fixture();
  try {
    await f.add('missing', { name: 'Missing', ext: 'png' });
    await writeFile(join(f.source, 'images', 'missing.info', 'Missing_thumbnail.png'), 'thumbnail');
    await f.add('unsafe', { name: '../escape', ext: 'txt' });
    await f.add('good', { name: 'Good', ext: 'txt' }, Buffer.from('safe'));
    // Directory junctions are supported without elevated Windows symlink privileges.
    await symlink(
      join(f.source, 'images', 'good.info'),
      join(f.source, 'images', 'link.info'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const result = await importEagleLibrary(f.source, join(f.dir, 'Atlas'));
    assert.equal(result.report.imported, 1);
    assert.equal(result.report.skipped, 3);
    assert.match(JSON.stringify(result.report.issues), /missing|Unsafe|Links/);
    await assert.rejects(importEagleLibrary(f.source, join(f.source, 'Nested')), /outside/);
    await assert.rejects(importEagleLibrary(f.source, result.path), /new destination/);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
test('cancelled Eagle import removes partial output and leaves the source unchanged', async () => {
  const f = await fixture();
  try {
    await f.add('one', { name: 'One', ext: 'txt' }, Buffer.from('original'));
    const signal = new AbortController();
    signal.abort();
    await assert.rejects(
      importEagleLibrary(f.source, join(f.dir, 'Atlas'), { signal: signal.signal }),
    );
    assert.deepEqual((await readdir(f.dir)).sort(), ['Design.library']);
    assert.equal(
      await readFile(join(f.source, 'images', 'one.info', 'One.txt'), 'utf8'),
      'original',
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('legacy Eagle folder repair previews changes, rejects a stale review and keeps membership IDs', async () => {
  const f = await fixture();
  const library = new Library(join(f.dir, 'Legacy Atlas'));
  try {
    const parent = library.createCollection('Design');
    const child = library.createCollection('Design / Inspiration');
    const userFolder = library.createCollection('Design / My own folder');
    const note = library.createNote({ title: 'Existing linked note', body: 'Draft' });
    library.patch(note.id, { expectedRevision: 1, collections: [child.id] });
    const metadata = JSON.parse(await readFile(join(f.source, 'metadata.json'), 'utf8'));
    library.db.exec('CREATE TABLE import_reports(id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    library.db
      .prepare('INSERT INTO import_reports VALUES(?,?)')
      .run('legacy', JSON.stringify({ format: 'atlas-eagle-import', libraryMetadata: metadata }));
    const preview = library.eagleFolderRepair();
    assert.deepEqual(preview.changes, [
      { id: child.id, parentId: parent.id, title: 'Inspiration', from: child.name },
    ]);
    assert.equal(library.collections().find((c) => c.id === child.id)?.parentId, null);
    library.createCollection('Changed after preview');
    assert.throws(() => library.repairEagleFolders(preview.key), /changed/);
    library.repairEagleFolders(library.eagleFolderRepair().key);
    assert.deepEqual(library.get(note.id).collections, [child.id]);
    assert.equal(library.collections().find((c) => c.id === child.id)?.parentId, parent.id);
    assert.equal(library.collections().find((c) => c.id === userFolder.id)?.parentId, null);
    assert.equal(library.eagleFolderRepair().changes.length, 0);
  } finally {
    library.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});

test('saved import rule assigns tags and a nested folder while preserving the original revision', async () => {
  const f = await fixture();
  const library = new Library(join(f.dir, 'Rule Atlas'));
  try {
    const parent = library.createCollection('References');
    const child = library.createCollection('Screens', parent.id);
    library.saveSmartFolder({
      name: 'Screenshots',
      match: 'all',
      rules: [{ field: 'type', operator: 'is', value: 'png' }],
      addTag: 'screen',
      addFolder: child.id,
    });
    const image = library.importAsset({
      filename: 'a.png',
      mime: 'image/png',
      size: 1,
      hash: 'a'.repeat(64),
    });
    assert.deepEqual(image.collections, [child.id]);
    assert.deepEqual(image.tags, ['screen']);
    assert.equal(image.revision, 2);
    const restored = library.restore(image.id, 1, 2);
    assert.deepEqual(restored.tags, []);
    assert.deepEqual(restored.collections, []);
    const plain = library.importAsset({
      filename: 'a.txt',
      mime: 'text/plain',
      size: 1,
      hash: 'b'.repeat(64),
    });
    assert.equal(plain.revision, 1);
  } finally {
    library.close();
    await rm(f.dir, { recursive: true, force: true });
  }
});
