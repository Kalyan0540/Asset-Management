import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Library } from '../server/library.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
const work = await mkdtemp(join(tmpdir(), 'atlas-interop-'));
try {
  if (process.argv[2] === 'create') {
    const target = 'android/app/src/androidTest/assets/desktop-backup';
    await rm(target, { recursive: true, force: true });
    const library = new Library(join(work, 'Library'));
    try {
      const collection = library.createCollection('Design / References');
      const note = library.createNote({ title: 'Desktop note', body: '# From desktop' });
      library.patch(note.id, {
        expectedRevision: 1,
        tags: ['desktop'],
        collections: [collection.id],
      });
      const bytes = Buffer.from('Original from desktop — unchanged');
      const hash = createHash('sha256').update(bytes).digest('hex');
      await writeFile(join(library.root, 'blobs', hash), bytes);
      const item = library.importAsset({
        filename: 'reference.txt',
        mime: 'text/plain',
        size: bytes.length,
        hash,
      });
      library.patch(item.id, { expectedRevision: 1, tags: ['original'] });
      await createBackup(library, target);
    } finally {
      library.close();
    }
    console.log('DESKTOP_TRANSFER_FIXTURE_READY');
  } else if (process.argv[2] === 'verify') {
    const target = await restoreBackup('android/interop-backup', join(work, 'Restored'));
    const library = new Library(target);
    try {
      const items = library.list();
      assert.equal(items.length, 3);
      const desktop = items.find((i) => i.title === 'Desktop note')!;
      assert.equal(desktop.body, '# Edited on Android');
      assert.equal(desktop.revision, 3);
      assert.equal(library.history(desktop.id).length, 3);
      assert.equal(items.find((i) => i.title === 'Android note')?.body, '# From phone');
      const asset = items.find((i) => i.kind === 'asset')!;
      assert.equal(
        await readFile(join(target, 'blobs', asset.hash!), 'utf8'),
        'Original from desktop — unchanged',
      );
      assert.ok(library.collections().some((c) => c.name === 'Design / References'));
    } finally {
      library.close();
    }
    console.log('ANDROID_DESKTOP_ROUNDTRIP_OK');
  } else throw new Error('Use create or verify');
} finally {
  await rm(work, { recursive: true, force: true });
}
