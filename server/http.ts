import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  renameSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute, extname, basename, sep } from 'node:path';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { z, ZodError } from 'zod';
import { Library, LibraryError } from './library.ts';
import { patchSchema } from '../shared/model.ts';
import { LocalAI } from './ai.ts';

const MAX_JSON = 2_000_000;
const previewTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.md': 'text/plain',
  '.txt': 'text/plain',
  '.csv': 'text/plain',
};
const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
    throw new LibraryError(415, 'Expected application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new LibraryError(413, 'Request is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new LibraryError(400, 'Invalid JSON');
  }
}
export function createLibraryServer(options: {
  root: string;
  dist?: string;
  maxUploadBytes?: number;
  token?: string;
  aiEndpoint?: string;
}) {
  const library = new Library(resolve(options.root));
  const ai = new LocalAI(library, options.aiEndpoint);
  const tokenPath = join(library.root, 'agent-token');
  const token =
    options.token ??
    (existsSync(tokenPath)
      ? readFileSync(tokenPath, 'utf8').trim()
      : randomBytes(32).toString('hex'));
  if (!options.token && !existsSync(tokenPath)) writeFileSync(tokenPath, token, { mode: 0o600 });
  let frontend: ((req: IncomingMessage, res: ServerResponse, next: () => void) => void) | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const port = (server.address() as { port: number }).port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host ?? ''))
        throw new LibraryError(403, 'Unrecognized host');
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin)
        throw new LibraryError(403, 'Cross-origin access is disabled');
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new LibraryError(403, 'Cross-site access is disabled');
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname === '/api/session' && req.method === 'GET') {
        if (req.headers['sec-fetch-site'] !== 'same-origin')
          throw new LibraryError(403, 'Open the application to establish a browser session');
        res.setHeader('Set-Cookie', `atlas_session=${token}; HttpOnly; SameSite=Strict; Path=/api`);
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith('/api/')) {
        const cookie = req.headers.cookie
          ?.split(';')
          .map((s) => s.trim())
          .find((s) => s.startsWith('atlas_session='))
          ?.slice(14);
        const supplied = req.headers.authorization?.replace(/^Bearer /, '') ?? cookie ?? '';
        const a = Buffer.from(supplied),
          b = Buffer.from(token);
        if (a.length !== b.length || !timingSafeEqual(a, b))
          throw new LibraryError(401, 'Authentication required');
        const actor = req.headers.authorization ? 'agent' : 'ui';
        if (url.pathname === '/api/ai/models' && req.method === 'GET')
          return json(res, 200, await ai.models());
        if (url.pathname === '/api/ai/jobs' && req.method === 'GET')
          return json(res, 200, ai.list());
        if (url.pathname === '/api/ai/jobs' && req.method === 'POST') {
          const input = z
            .object({ itemId: z.string().uuid(), model: z.string().min(1).max(200) })
            .strict()
            .parse(await body(req));
          return json(res, 202, ai.start(input.itemId, input.model));
        }
        const aiAction = url.pathname.match(/^\/api\/ai\/jobs\/([\w-]+)\/(apply|cancel)$/);
        if (aiAction && req.method === 'POST') {
          if (aiAction[2] === 'cancel') return json(res, 200, ai.cancel(aiAction[1]));
          const input = z
            .object({ includeDescription: z.boolean().default(false) })
            .strict()
            .parse(await body(req));
          return json(res, 200, ai.apply(aiAction[1], input.includeDescription));
        }
        if (url.pathname === '/api/library' && req.method === 'GET')
          return json(res, 200, { items: library.list(), collections: library.collections() });
        if (url.pathname === '/api/manifest' && req.method === 'GET') {
          res.setHeader('Content-Disposition', 'attachment; filename="atlas-manifest.json"');
          return json(res, 200, {
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            items: library.list(),
            collections: library.collections(),
          });
        }
        if (url.pathname === '/api/collections' && req.method === 'POST') {
          const input = z
            .object({ name: z.string().trim().min(1).max(80) })
            .strict()
            .parse(await body(req));
          return json(res, 201, library.createCollection(input.name));
        }
        if (url.pathname === '/api/notes' && req.method === 'POST')
          return json(res, 201, library.createNote(await body(req), actor));
        if (url.pathname === '/api/batch' && req.method === 'POST') {
          const changes = z
            .array(z.object({ id: z.string().uuid(), patch: patchSchema }).strict())
            .min(1)
            .max(500)
            .parse(await body(req));
          return json(res, 200, library.batch(changes, actor));
        }
        if (url.pathname === '/api/import' && req.method === 'POST') {
          if (req.headers['content-type'] !== 'application/octet-stream')
            throw new LibraryError(415, 'Expected a binary file upload');
          const rawName = url.searchParams.get('name') ?? '';
          const name = basename(rawName.replaceAll('\\', '/'))
            .replace(/[\x00-\x1f\x7f]/g, '')
            .slice(0, 250);
          if (!name || name === '.' || name === '..')
            throw new LibraryError(400, 'A valid filename is required');
          const limit = options.maxUploadBytes ?? 2 * 1024 * 1024 * 1024;
          if (Number(req.headers['content-length']) > limit)
            throw new LibraryError(413, 'File exceeds the upload limit');
          const temp = join(library.root, 'staging', randomUUID());
          let size = 0;
          const hash = createHash('sha256');
          try {
            await pipeline(
              req,
              new Transform({
                transform(chunk, _encoding, callback) {
                  size += chunk.length;
                  if (size > limit)
                    return callback(new LibraryError(413, 'File exceeds the upload limit'));
                  hash.update(chunk);
                  callback(null, chunk);
                },
              }),
              createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
            );
            const fd = openSync(temp, 'r+');
            try {
              fsyncSync(fd);
            } finally {
              closeSync(fd);
            }
            const digest = hash.digest('hex');
            const destination = join(library.root, 'blobs', digest);
            if (existsSync(destination)) unlinkSync(temp);
            else {
              renameSync(temp, destination);
              // Persist the new directory entry before committing its catalog reference on POSIX.
              // Windows durability still requires a native-platform acceptance run.
              if (process.platform !== 'win32') {
                const directory = openSync(join(library.root, 'blobs'), 'r');
                try {
                  fsyncSync(directory);
                } finally {
                  closeSync(directory);
                }
              }
            }
            // An interrupted operation may leave an unreferenced blob, never a catalog entry pointing at staging.
            const item = library.importAsset(
              {
                filename: name,
                mime: previewTypes[extname(name).toLowerCase()] ?? 'application/octet-stream',
                size,
                hash: digest,
              },
              actor,
            );
            return json(res, 201, item);
          } finally {
            if (existsSync(temp)) unlinkSync(temp);
          }
        }
        const match = url.pathname.match(
          /^\/api\/items\/([\w-]+)(?:\/(history|restore|content))?$/,
        );
        if (match) {
          const [, id, action] = match;
          if (!action && req.method === 'GET') return json(res, 200, library.get(id));
          if (!action && req.method === 'PATCH')
            return json(res, 200, library.patch(id, await body(req), actor));
          if (action === 'history' && req.method === 'GET')
            return json(res, 200, library.history(id));
          if (action === 'restore' && req.method === 'POST') {
            const input = z
              .object({
                revision: z.number().int().positive(),
                expectedRevision: z.number().int().positive(),
              })
              .strict()
              .parse(await body(req));
            return json(
              res,
              200,
              library.restore(id, input.revision, input.expectedRevision, actor),
            );
          }
          if (action === 'content' && req.method === 'GET') {
            const item = library.get(id),
              download = url.searchParams.has('download');
            const safeName = item.kind === 'note' ? `${item.title}.md` : item.filename;
            res.setHeader(
              'Content-Type',
              item.kind === 'note' ? 'text/plain; charset=utf-8' : item.mime,
            );
            res.setHeader(
              'Content-Disposition',
              `${download || item.mime === 'application/octet-stream' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(safeName).replace(/'/g, '%27')}`,
            );
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
            if (item.kind === 'note') {
              res.end(item.body);
              return;
            }
            const path = join(library.root, 'blobs', item.hash!);
            if (!existsSync(path))
              throw new LibraryError(410, 'Original file is missing from this library');
            const size = statSync(path).size;
            res.setHeader('Accept-Ranges', 'bytes');
            let start = 0,
              end = size - 1;
            if (req.headers.range) {
              const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
              if (!range || (!range[1] && !range[2])) {
                res.writeHead(416, { 'Content-Range': `bytes */${size}` });
                res.end();
                return;
              }
              start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
              end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
              if (start > end || start >= size) {
                res.writeHead(416, { 'Content-Range': `bytes */${size}` });
                res.end();
                return;
              }
              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            }
            res.setHeader('Content-Length', Math.max(0, end - start + 1));
            if (!size) {
              res.end();
              return;
            }
            await pipeline(createReadStream(path, { start, end }), res);
            return;
          }
        }
        throw new LibraryError(404, 'Endpoint not found');
      }
      if (req.method !== 'GET') throw new LibraryError(405, 'Method not allowed');
      if (frontend) {
        frontend(req, res, () => json(res, 404, { error: 'Not found' }));
        return;
      }
      const dist = resolve(options.dist ?? 'dist');
      const requested = resolve(dist, '.' + decodeURIComponent(url.pathname));
      const relativePath = relative(dist, requested);
      if (relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath))
        throw new LibraryError(403, 'Invalid path');
      const file =
        existsSync(requested) && statSync(requested).isFile()
          ? requested
          : join(dist, 'index.html');
      if (!existsSync(file))
        throw new LibraryError(503, 'Build the interface with npm run build first');
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) {
        if (!res.destroyed) res.end();
        return;
      }
      const status =
        error instanceof LibraryError ? error.status : error instanceof ZodError ? 400 : 500;
      json(res, status, {
        error:
          status === 500
            ? 'The operation failed. Your existing library has been preserved.'
            : error instanceof ZodError
              ? 'Invalid request fields'
              : (error as Error).message,
      });
      if (status === 500) console.error(error);
    }
  });
  server.on('close', () => {
    ai.stop();
    library.close();
  });
  return {
    server,
    library,
    token,
    setFrontend(fn: typeof frontend) {
      frontend = fn;
    },
  };
}
