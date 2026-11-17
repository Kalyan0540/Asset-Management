import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { Library } from '../server/library.ts';
import { createLibraryServer } from '../server/http.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function temp() {
  return mkdtempSync(join(tmpdir(), 'atlas-test-'));
}
async function fixture() {
  const root = temp(),
    app = createLibraryServer({ root, maxUploadBytes: 1024 * 1024 });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const fetchAPI = (path: string, init: RequestInit = {}) =>
    fetch(url + path, {
      ...init,
      headers: { Authorization: `Bearer ${app.token}`, ...init.headers },
    });
  const send = async (path: string, data: unknown, method = 'POST') => {
    const r = await fetchAPI(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  const close = async () => {
    app.server.close();
    app.server.closeAllConnections();
    await once(app.server, 'close');
    rmSync(root, { recursive: true, force: true });
  };
  return { ...app, root, url, fetchAPI, send, close };
}

test('notes survive reopen; stale edits fail and history restoration creates a new revision', () => {
  const root = temp();
  let db = new Library(root);
  try {
    const note = db.createNote({ title: 'Research', body: '# Original\n\nこんにちは' });
    db.patch(note.id, { expectedRevision: 1, body: '# Revised', tags: ['red', 'red'] });
    assert.throws(
      () => db.patch(note.id, { expectedRevision: 1, body: 'Stale overwrite' }),
      /changed elsewhere/,
    );
    db.close();
    db = new Library(root);
    assert.equal(db.get(note.id).body, '# Revised');
    assert.deepEqual(db.get(note.id).tags, ['red']);
    const restored = db.restore(note.id, 1, 2);
    assert.equal(restored.body, '# Original\n\nこんにちは');
    assert.equal(restored.revision, 3);
    assert.equal(db.history(note.id).length, 3);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('collections and typed relations preserve identity; failed edits roll back without history', () => {
  const root = temp(),
    db = new Library(root);
  try {
    const a = db.createNote({ title: 'A' }),
      b = db.createNote({ title: 'B' }),
      c = db.createCollection('Research');
    db.patch(a.id, {
      expectedRevision: 1,
      collections: [c.id],
      relations: [{ target: b.id, label: 'supports' }],
    });
    db.patch(b.id, { expectedRevision: 1, title: 'Renamed' });
    assert.equal(db.get(a.id).relations[0].target, b.id);
    assert.throws(
      () =>
        db.patch(a.id, {
          expectedRevision: 2,
          collections: ['7a51615f-1c73-4615-9736-6de3a8f05fcf'],
        }),
      /Unknown collection/,
    );
    assert.equal(db.history(a.id).length, 2);
    assert.throws(
      () => db.patch(a.id, { expectedRevision: 2, relations: [{ target: a.id, label: 'self' }] }),
      /itself/,
    );
    assert.equal(db.get(a.id).revision, 2);
    db.patch(a.id, { expectedRevision: 2, trashed: true });
    assert.equal(db.get(a.id).trashed, true);
    db.patch(a.id, { expectedRevision: 3, trashed: false });
    assert.deepEqual(db.get(a.id).collections, [c.id]);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('binary import preserves hashes, deduplicates storage, supports ranges and does not trust unsafe extensions', async () => {
  const f = await fixture();
  try {
    const original = Buffer.from('A binary original\x00\xff\x01');
    const upload = async (name: string) => {
      const r = await f.fetchAPI(`/api/import?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: original,
      });
      assert.equal(r.status, 201);
      return r.json();
    };
    const a = await upload('../../sample.mp4'),
      b = await upload('another.mp4');
    assert.equal(a.filename, 'sample.mp4');
    assert.notEqual(a.id, b.id);
    assert.equal(a.hash, b.hash);
    assert.equal(a.hash, createHash('sha256').update(original).digest('hex'));
    assert.equal(readdirSync(join(f.root, 'blobs')).length, 1);
    assert.deepEqual(
      Buffer.from(await (await f.fetchAPI(`/api/items/${a.id}/content?download=1`)).arrayBuffer()),
      original,
    );
    const range = await f.fetchAPI(`/api/items/${a.id}/content`, {
      headers: { Range: 'bytes=2-6' },
    });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), original.subarray(2, 7));
    assert.equal(
      (await f.fetchAPI(`/api/items/${a.id}/content`, { headers: { Range: 'bytes=999-' } })).status,
      416,
    );
    const svg = await upload('attack.svg');
    assert.equal(svg.mime, 'application/octet-stream');
    const response = await f.fetchAPI(`/api/items/${svg.id}/content`);
    assert.match(response.headers.get('content-disposition')!, /^attachment/);
  } finally {
    await f.close();
  }
});

test('oversized and aborted imports leave no catalog record or staging file', async () => {
  const f = await fixture();
  try {
    const large = await f.fetchAPI('/api/import?name=large.bin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(1024 * 1024 + 1),
    });
    assert.equal(large.status, 413);
    await new Promise<void>((resolve) => {
      const req = request(f.url + '/api/import?name=partial.bin', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${f.token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': '10000',
        },
      });
      req.on('error', () => resolve());
      req.write(Buffer.alloc(10));
      setTimeout(() => req.destroy(new Error('interrupted')), 30);
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(f.library.list().length, 0);
    assert.deepEqual(readdirSync(join(f.root, 'staging')), []);
  } finally {
    await f.close();
  }
});

test('API rejects unauthenticated, cross-origin, hostile Host and invalid mutation requests', async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.url + '/api/library')).status, 401);
    assert.equal(
      (await f.fetchAPI('/api/library', { headers: { Origin: 'https://hostile.example' } })).status,
      403,
    );
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        f.url + '/api/library',
        { headers: { Host: 'hostile.example', Authorization: `Bearer ${f.token}` } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(f.url + '/api/session')).status, 403);
    const session = await fetch(f.url + '/api/session', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    assert.equal(session.status, 200);
    assert.match(session.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
    const note = await f.send('/api/notes', { title: 'A' });
    assert.equal(note.status, 201);
    assert.equal(
      (
        await f.send(
          `/api/items/${note.data.id}`,
          { expectedRevision: 1, hash: 'override' },
          'PATCH',
        )
      ).status,
      400,
    );
    assert.equal(
      (await f.send(`/api/items/${note.data.id}`, { expectedRevision: 1, title: 'B' }, 'PATCH'))
        .status,
      200,
    );
    assert.equal(
      (await f.send(`/api/items/${note.data.id}`, { expectedRevision: 1, title: 'C' }, 'PATCH'))
        .status,
      409,
    );
    assert.equal(f.library.get(note.data.id).title, 'B');
  } finally {
    await f.close();
  }
});

test('MCP protocol client can search/read and write tools are opt-in with revision conflicts', async () => {
  const f = await fixture();
  const clients: Client[] = [];
  try {
    const note = f.library.createNote({ title: 'MCP fixture', body: 'A local note' });
    for (const write of [false, true]) {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          '--import',
          join(process.cwd(), 'node_modules/tsx/dist/loader.mjs'),
          join(process.cwd(), 'server/mcp.ts'),
        ],
        cwd: tmpdir(),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
          ),
          ATLAS_URL: f.url,
          ATLAS_LIBRARY: f.root,
          ATLAS_MCP_WRITE: write ? '1' : '0',
        },
        stderr: 'pipe',
      });
      const client = new Client({ name: 'integration-test', version: '1.0.0' });
      clients.push(client);
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(
        tools.tools.some((t) => t.name === 'update_item'),
        write,
      );
      const search = await client.callTool({
        name: 'search_library',
        arguments: { query: 'MCP', limit: 10 },
      });
      assert.match(JSON.stringify(search), /MCP fixture/);
      const read = await client.callTool({ name: 'read_item', arguments: { id: note.id } });
      assert.match(JSON.stringify(read), /A local note/);
      if (write) {
        const result = await client.callTool({
          name: 'update_item',
          arguments: { id: note.id, patch: { expectedRevision: 1, tags: ['agent'] } },
        });
        assert.notEqual(result.isError, true);
        const stale = await client.callTool({
          name: 'update_item',
          arguments: { id: note.id, patch: { expectedRevision: 1, tags: ['stale'] } },
        });
        assert.equal(stale.isError, true);
        assert.deepEqual(f.library.get(note.id).tags, ['agent']);
      }
    }
    assert.equal(readFileSync(join(f.root, 'agent-token'), 'utf8'), f.token);
  } finally {
    for (const c of clients) await c.close();
    await f.close();
  }
});
