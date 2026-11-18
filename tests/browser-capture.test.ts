import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBrowserCaptureServer } from '../server/browser-capture.ts';
import { Library } from '../server/library.ts';
import { captureExtensionOrigin } from '../shared/capture.ts';

test('the packaged extension ID matches the local bridge and permissions start narrow', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'),
  );
  const id = createHash('sha256')
    .update(Buffer.from(manifest.key, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[a-f0-9]/g, (character) => String.fromCharCode(97 + parseInt(character, 16)));
  assert.equal(captureExtensionOrigin, `chrome-extension://${id}`);
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});

test('the bridge accepts chosen clips and images, preserves metadata, and refuses unrelated origins and reads', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'atlas-capture-'));
  const library = new Library(folder);
  let key = 'ab'.repeat(32);
  let saved = 0;
  const server = createBrowserCaptureServer(
    () => library,
    () => key,
    () => saved++,
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Origin: captureExtensionOrigin, Authorization: `Bearer ${key}` };
  const args = { method: 'POST', headers };
  try {
    assert.equal((await fetch(`${address}/status`, { method: 'POST' })).status, 403);
    assert.equal(
      (
        await fetch(`${address}/status`, {
          ...args,
          headers: { ...headers, Origin: 'https://example.com' },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${address}/status`, { headers })).status, 405);
    assert.equal((await fetch(`${address}/api/library`, args)).status, 404);
    assert.equal((await fetch(`${address}/status`, args)).status, 200);
    const preflight = await fetch(`${address}/note`, {
      method: 'OPTIONS',
      headers: { Origin: captureExtensionOrigin },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), captureExtensionOrigin);

    const source = 'https://example.com/work?name=A%20B';
    const note = (text: unknown, url = source) =>
      fetch(`${address}/note`, {
        ...args,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Design reference',
          source: url,
          text,
          tags: ['research', 'research'],
        }),
      });
    assert.equal((await note('Bad URL', 'javascript:alert(1)')).status, 400);
    assert.equal((await note('first\n**second**')).status, 201);
    const captured = library.list()[0];
    assert.equal(captured.sourceUrl, source);
    assert.deepEqual(captured.tags, ['research']);
    assert.equal(captured.body, `> first\n> \\*\\*second\\*\\*\n\nSource: <${source}>`);
    assert.equal(library.history(captured.id)[0].actor, 'chrome-capture');

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=',
      'base64',
    );
    const query = new URLSearchParams({ title: '../../Reference.txt', source, tag: 'screen' });
    const image = (body: Uint8Array) =>
      fetch(`${address}/image?${query}`, {
        ...args,
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(body),
      });
    assert.equal((await image(Buffer.from('<svg onload="alert(1)"/>'))).status, 415);
    assert.equal((await image(png)).status, 201);
    assert.equal((await image(png)).status, 201);
    const images = library.list().filter((item) => item.kind === 'asset');
    assert.deepEqual(
      images.map((item) => [item.filename, item.mime, item.sourceUrl, item.tags]),
      Array(2).fill(['Reference.png', 'image/png', source, ['screen']]),
    );
    assert.deepEqual(readdirSync(join(folder, 'blobs')), [images[0].hash]);
    assert.deepEqual(readFileSync(join(folder, 'blobs', images[0].hash!)), png);
    assert.equal(saved, 3);
    key = 'cd'.repeat(32);
    assert.equal((await fetch(`${address}/status`, args)).status, 401);
  } finally {
    server.close();
    server.closeAllConnections();
    library.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
