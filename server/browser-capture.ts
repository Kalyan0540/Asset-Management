import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { captureExtensionOrigin, captureMaxBytes } from '../shared/capture.ts';
import { Library, LibraryError } from './library.ts';
import { commitStagedBlob } from './blobs.ts';

const sourceUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
const metadata = z
  .object({
    title: z.string().trim().min(1).max(175),
    source: sourceUrl,
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  })
  .strict();
const note = metadata.extend({ text: z.string().trim().min(1).max(50_000).optional() });

function reply(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function read(req: IncomingMessage, limit: number) {
  const parts: Buffer[] = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) {
      req.resume();
      throw new LibraryError(413, 'This capture exceeds the size limit.');
    }
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

function imageFormat(data: Buffer) {
  const header = (from: number, to: number) => data.toString('ascii', from, to);
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return ['png', 'image/png'];
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return ['jpg', 'image/jpeg'];
  if (['GIF87a', 'GIF89a'].includes(header(0, 6))) return ['gif', 'image/gif'];
  if (header(0, 4) === 'RIFF' && header(8, 12) === 'WEBP') return ['webp', 'image/webp'];
  if (header(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header(8, 12)))
    return ['avif', 'image/avif'];
  throw new LibraryError(415, 'This capture needs a PNG, JPEG, WebP, GIF or AVIF image.');
}

function validateKey(expected: string | undefined, actual: string | undefined) {
  if (!expected || !actual || !/^Bearer [0-9a-f]{64}$/i.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual.slice(7), 'hex'));
}

export function createBrowserCaptureServer(
  activeLibrary: () => Library | undefined,
  pairingKey: () => string | undefined,
  onSaved: () => void = () => {},
) {
  const server = createServer(
    { requestTimeout: 30_000, maxHeaderSize: 20_000 },
    async (req, res) => {
      try {
        const address = server.address();
        if (
          !address ||
          typeof address === 'string' ||
          req.headers.host !== `127.0.0.1:${address.port}` ||
          req.headers.origin !== captureExtensionOrigin
        )
          return reply(res, 403, {
            error: 'Open the Atlas Capture extension to use this connection.',
          });
        res.setHeader('Access-Control-Allow-Origin', captureExtensionOrigin);
        res.setHeader('Vary', 'Origin');
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${address.port}`);
        if (
          url.origin !== `http://127.0.0.1:${address.port}` ||
          !['/status', '/note', '/image'].includes(url.pathname)
        )
          return reply(res, 404, { error: 'Capture action unavailable.' });
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'POST');
          res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
          res.writeHead(204).end();
          return;
        }
        if (req.method !== 'POST') return reply(res, 405, { error: 'Capture action unavailable.' });
        const key = pairingKey();
        if (!validateKey(key, req.headers.authorization))
          return reply(res, 401, {
            error: 'Pair Atlas Capture with a key from the Atlas desktop menu.',
          });
        const library = activeLibrary();
        if (!library) return reply(res, 503, { error: 'Open a library in Atlas first.' });
        if (url.pathname === '/status') return reply(res, 200, { library: basename(library.root) });
        const current = () => {
          if (activeLibrary() !== library || pairingKey() !== key)
            throw new LibraryError(
              409,
              'Atlas changed libraries or keys. Check the destination and retry.',
            );
        };
        if (url.pathname === '/note') {
          if (req.headers['content-type'] !== 'application/json')
            throw new LibraryError(415, 'This capture needs JSON.');
          const data = note.parse(JSON.parse((await read(req, 300_000)).toString('utf8')));
          current();
          const link = new URL(data.source).href.replace(/[<>]/g, (value) =>
            value === '<' ? '%3C' : '%3E',
          );
          const quote = data.text
            ?.split(/\r?\n/)
            .map((line) => `> ${line.replace(/[\\`*_[\]<>#!|~]/g, '\\$&')}`)
            .join('\n');
          const item = library.createCaptureNote({
            title: data.title,
            sourceUrl: data.source,
            tags: [...new Set(data.tags)],
            body: quote ? `${quote}\n\nSource: <${link}>` : `<${link}>`,
          });
          onSaved();
          return reply(res, 201, { id: item.id });
        }
        if (req.headers['content-type'] !== 'application/octet-stream')
          throw new LibraryError(415, 'This capture needs image bytes.');
        const data = metadata.parse({
          title: url.searchParams.get('title'),
          source: url.searchParams.get('source'),
          tags: url.searchParams.getAll('tag'),
        });
        const bytes = await read(req, captureMaxBytes);
        current();
        const [ext, mime] = imageFormat(bytes);
        const name =
          basename(data.title.replaceAll('\\', '/'))
            .replace(/[<>:"|?*\x00-\x1f]/g, '_')
            .replace(/\.[a-z0-9]{2,8}$/i, '')
            .replace(/[. ]+$/, '') || 'Browser capture';
        const filename = `${name}.${ext}`;
        const temp = join(library.root, 'staging', randomUUID());
        const hash = createHash('sha256').update(bytes).digest('hex');
        try {
          writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
          commitStagedBlob(library.root, temp, hash);
          const item = library.importAsset(
            {
              filename,
              mime,
              size: bytes.length,
              hash,
              sourceUrl: data.source,
              tags: [...new Set(data.tags)],
            },
            'chrome-capture',
          );
          onSaved();
          return reply(res, 201, { id: item.id });
        } finally {
          rmSync(temp, { force: true });
        }
      } catch (error) {
        if (error instanceof LibraryError)
          return reply(res, error.status, { error: error.message });
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          return reply(res, 400, { error: 'The browser capture has invalid details.' });
        return reply(res, 500, { error: 'Atlas could not store this capture.' });
      }
    },
  );
  server.maxConnections = 10;
  return server;
}
