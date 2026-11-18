import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '../server/library.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
import { mergeLibraries } from '../server/merge.ts';

test('merge creates a separate library with original bytes, nested folders, internal links and history', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'atlas-merge-test-'));
  const current = new Library(join(temp, 'Current'));
  t.after(() => {
    current.close();
    rmSync(temp, { recursive: true, force: true });
  });
  const bytes = Buffer.from('original bytes');
  const hash = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(current.root, 'blobs', hash), bytes);
  const item = current.importAsset({
    filename: 'file.bin',
    hash,
    size: bytes.length,
    mime: 'application/octet-stream',
  });
  const parent = current.createCollection('Client work');
  const child = current.createCollection('Brand', parent.id);
  current.createCollection('Empty', child.id);
  current.setTagGroup('Projects', ['current']);
  await createBackup(current, join(temp, 'backup'));
  const source = new Library(await restoreBackup(join(temp, 'backup'), join(temp, 'Archive')));
  source.patch(item.id, { expectedRevision: 1, title: 'Archive asset', collections: [child.id] });
  const note = source.createNote({
    title: 'Reference',
    body: `[original](atlas:${item.id})\n\n\`atlas:${item.id}\``,
  });
  source.patch(note.id, {
    expectedRevision: 1,
    body: `![original](<atlas:${item.id}>)`,
    relations: [{ target: item.id, label: 'uses' }],
  });
  const trashed = source.createNote({ title: 'Trashed' });
  source.patch(trashed.id, { expectedRevision: 1, trashed: true });
  source.setTagGroup('Projects', ['archive']);
  source.saveSmartFolder({
    name: 'Brand assets',
    match: 'all',
    rules: [{ field: 'folder', operator: 'is', value: child.id }],
    addFolder: child.id,
  });
  writeFileSync(join(source.root, 'agent-token'), 'secret');
  const sourceItems = source.list();
  source.close();

  const destination = join(temp, 'Merged');
  assert.equal(
    await mergeLibraries(current, source.root, destination, { review: async () => false }),
    undefined,
  );
  assert.equal(existsSync(destination), false);
  const result = await mergeLibraries(current, source.root, destination, {
    review: async (preview) => {
      assert.deepEqual(
        [
          preview.assets,
          preview.notes,
          preview.trashed,
          preview.folders,
          preview.smartFolders,
          preview.groups,
          preview.revisions,
        ],
        [1, 2, 1, 3, 1, 1, 6],
      );
      return true;
    },
  });
  assert.equal(result?.collisions, 1);
  assert.equal(current.list().length, 1);
  assert.equal(current.get(item.id).title, item.title);
  const archive = new Library(source.root);
  try {
    assert.deepEqual(archive.list(), sourceItems);
  } finally {
    archive.close();
  }
  const merged = new Library(destination);
  try {
    const archiveItem = merged.list().find((item) => item.title === 'Archive asset')!;
    const folders = merged.collections();
    const mappedChild = folders.find((folder) => folder.id === archiveItem.collections[0])!;
    const mappedParent = folders.find((folder) => folder.id === mappedChild.parentId)!;
    assert.equal(mappedChild.title, 'Brand');
    assert.equal(mappedParent.title, 'Client work');
    assert.equal(
      folders.find((folder) => folder.id === mappedParent.parentId)?.title,
      'From Archive',
    );
    assert.ok(
      folders.some((folder) => folder.parentId === mappedChild.id && folder.title === 'Empty'),
    );
    assert.equal(merged.get(item.id).title, item.title);
    assert.equal(merged.get(trashed.id).trashed, true);
    assert.notEqual(archiveItem.id, item.id);
    assert.deepEqual(readdirSync(join(destination, 'blobs')), [hash]);
    assert.deepEqual(readFileSync(join(destination, 'blobs', hash)), bytes);
    assert.equal(existsSync(join(destination, 'agent-token')), false);
    assert.match(merged.get(note.id).body, new RegExp(`atlas:${archiveItem.id}`));
    assert.equal(merged.get(note.id).relations[0].target, archiveItem.id);
    assert.equal(merged.history(archiveItem.id).length, 2);
    const restored = merged.restore(note.id, 1, 2);
    assert.equal(restored.body, `[original](atlas:${archiveItem.id})\n\n\`atlas:${item.id}\``);
    assert.equal(merged.smartFolders()[0].rules[0].value, mappedChild.id);
    assert.equal(merged.smartFolders()[0].addFolder, mappedChild.id);
    assert.deepEqual(
      merged.tagGroups().map((group) => group.tags),
      [['current'], ['archive']],
    );
  } finally {
    merged.close();
  }

  writeFileSync(join(source.root, 'blobs', hash), 'damaged');
  const rejected = join(temp, 'Rejected');
  await assert.rejects(
    mergeLibraries(current, source.root, rejected, { review: async () => true }),
    /verification/,
  );
  assert.equal(existsSync(rejected), false);
  assert.equal(
    readdirSync(temp).some((name) => name.startsWith('.atlas-merge-')),
    false,
  );
  await assert.rejects(
    mergeLibraries(current, source.root, join(source.root, 'Merged'), { review: async () => true }),
    /outside both/,
  );
});
