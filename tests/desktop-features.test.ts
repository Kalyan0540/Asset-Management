import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Library } from '../server/library.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
import { LocalAI } from '../server/ai.ts';

test('tag changes update library references atomically and keep past revisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-tag-'));
  const db = new Library(root);
  try {
    const a = db.createNote({ title: 'A' });
    const b = db.createNote({ title: 'B' });
    db.patch(a.id, { expectedRevision: 1, tags: ['old', 'keep'] });
    db.patch(b.id, { expectedRevision: 1, tags: ['old'], trashed: true });
    db.setTagGroup('First', ['old']);
    db.setTagGroup('Second', ['keep', 'other']);
    const folder = db.saveSmartFolder({
      name: 'Tag rules',
      match: 'any',
      addTag: 'old',
      rules: [
        { field: 'tag', operator: 'is', value: 'OLD' },
        { field: 'tag', operator: 'contains', value: 'old' },
      ],
    });
    const change = { from: 'old', to: 'keep' };
    const preview = db.previewTagChange(change);
    assert.deepEqual(
      [preview.items, preview.trashed, preview.groups, preview.smartFolders, preview.merge],
      [2, 1, 1, 1, true],
    );
    db.patch(a.id, { expectedRevision: 2, description: 'Made after review' });
    assert.throws(() => db.changeTag(change, preview.key, 'ui'), /changed/);
    assert.deepEqual(db.get(a.id).tags, ['old', 'keep']);
    db.changeTag(change, db.previewTagChange(change).key, 'ui');
    assert.deepEqual(db.get(a.id).tags, ['keep']);
    assert.deepEqual(db.get(b.id).tags, ['keep']);
    assert.equal(db.history(a.id)[0].action, 'merge tag');
    assert.deepEqual(db.tagGroups()[0].tags, ['keep']);
    assert.equal(db.smartFolders()[0].id, folder.id);
    assert.equal(db.smartFolders()[0].addTag, 'keep');
    assert.deepEqual(
      db.smartFolders()[0].rules.map((rule) => rule.value),
      ['keep', 'old'],
    );
    assert.throws(() => db.renameTagGroup('First', 'Second', ['keep']), /already/);
    db.renameTagGroup('First', 'Second', ['keep'], true);
    assert.deepEqual(db.tagGroups(), [{ name: 'Second', tags: ['keep', 'other'] }]);
    db.renameTagGroup('Second', 'Renamed', ['keep', 'other']);
    db.deleteTagGroup('Renamed');
    assert.deepEqual(db.tagGroups(), []);
    assert.deepEqual(db.restore(a.id, 3, 4).tags, ['old', 'keep']);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('batch edits commit together and a stale item rolls back every item', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-batch-')),
    db = new Library(root);
  try {
    const a = db.createNote({ title: 'A' }),
      b = db.createNote({ title: 'B' });
    db.patch(b.id, { expectedRevision: 1, tags: ['old'] });
    assert.throws(
      () =>
        db.batch([
          { id: a.id, patch: { expectedRevision: 1, tags: ['new'] } },
          { id: b.id, patch: { expectedRevision: 1, tags: ['new'] } },
        ]),
      /changed elsewhere/,
    );
    assert.deepEqual(db.get(a.id).tags, []);
    assert.equal(db.history(a.id).length, 1);
    db.batch([
      { id: a.id, patch: { expectedRevision: 1, tags: ['new'] } },
      { id: b.id, patch: { expectedRevision: 2, tags: ['new'] } },
    ]);
    assert.deepEqual(db.get(a.id).tags, ['new']);
    assert.deepEqual(db.get(b.id).tags, ['new']);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('backup restores notes, history and original bytes; damaged backups never replace a library', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'atlas-backup-')),
    db = new Library(join(temp, 'library'));
  try {
    const bytes = Buffer.from('original binary\x00\x01'),
      hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(db.root, 'blobs', hash), bytes);
    writeFileSync(join(db.root, 'agent-token'), 'private-credential');
    const asset = db.importAsset({
      filename: 'reference.bin',
      hash,
      size: bytes.length,
      mime: 'application/octet-stream',
    });
    const note = db.createNote({ title: 'Research', body: '# Keep this' });
    db.patch(note.id, {
      expectedRevision: 1,
      relations: [{ target: asset.id, label: 'uses' }],
      tags: ['reference'],
    });
    await createBackup(db, join(temp, 'backup'));
    assert.equal(existsSync(join(temp, 'backup', 'agent-token')), false);
    await restoreBackup(join(temp, 'backup'), join(temp, 'restored'));
    const restored = new Library(join(temp, 'restored'));
    try {
      assert.equal(restored.get(note.id).body, '# Keep this');
      assert.equal(restored.history(note.id).length, 2);
      assert.deepEqual(readFileSync(join(restored.root, 'blobs', hash)), bytes);
    } finally {
      restored.close();
    }
    writeFileSync(join(temp, 'backup', 'blobs', hash), 'damaged');
    await assert.rejects(restoreBackup(join(temp, 'backup'), join(temp, 'rejected')), /damaged/);
    assert.equal(existsSync(join(temp, 'rejected')), false);
    assert.equal(db.get(note.id).body, '# Keep this');
    await assert.rejects(createBackup(db, db.root), /outside/);
  } finally {
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
test('local AI proposals are persisted, require review, retain user tags and reject stale results', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-ai-')),
    db = new Library(root);
  let modelOutput = {
    tags: ['architecture', 'warm'],
    description: 'A warm architectural reference.',
  };
  const fake = createServer(async (req, res) => {
    for await (const _ of req) {
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/api/tags'
          ? { models: [{ name: 'fixture-vision' }] }
          : { message: { content: JSON.stringify(modelOutput) } },
      ),
    );
  });
  fake.listen(0, '127.0.0.1');
  await once(fake, 'listening');
  const ai = new LocalAI(db, `http://127.0.0.1:${(fake.address() as { port: number }).port}`);
  const settled = async (id: string) => {
    for (let n = 0; n < 100; n++) {
      const job = ai.get(id);
      if (job.status !== 'running') return job;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('AI job did not finish');
  };
  try {
    assert.deepEqual((await ai.models()).models, ['fixture-vision']);
    const note = db.createNote({ title: 'Reference', body: '# Room' });
    db.patch(note.id, { expectedRevision: 1, tags: ['mine'], description: 'My description' });
    const job = ai.start(note.id, 'fixture-vision');
    assert.equal((await settled(job.id)).status, 'review');
    assert.deepEqual(db.get(note.id).tags, ['mine']);
    ai.apply(job.id, false);
    assert.deepEqual(db.get(note.id).tags, ['mine', 'architecture', 'warm']);
    assert.equal(db.get(note.id).description, 'My description');
    assert.equal(ai.get(job.id).status, 'applied');
    assert.throws(() => ai.apply(job.id, false), /no longer/);
    const stale = ai.start(note.id, 'fixture-vision');
    await settled(stale.id);
    db.patch(note.id, { expectedRevision: 3, title: 'Edited' });
    assert.throws(() => ai.apply(stale.id, true), /changed/);
    assert.equal(ai.get(stale.id).status, 'stale');
    assert.equal(db.history(note.id).find((h) => h.actor === 'ai-reviewed')?.revision, 3);
  } finally {
    ai.stop();
    fake.close();
    fake.closeAllConnections();
    await once(fake, 'close');
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
