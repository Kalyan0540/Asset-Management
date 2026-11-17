import { resolve } from 'node:path';
import { createLibraryServer } from './http.ts';
const root = resolve(process.env.ATLAS_LIBRARY ?? '.library');
const port = Number(process.env.PORT ?? 3210);
const app = createLibraryServer({ root });
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.setFrontend(vite.middlewares);
  app.server.on('close', () => void vite.close());
}
app.server.listen(port, '127.0.0.1', () =>
  console.log(
    `Atlas is ready at http://127.0.0.1:${port}\nLibrary: ${root}\nAgent token: ${root}/agent-token (keep private)`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => app.server.close(() => process.exit(0)));
