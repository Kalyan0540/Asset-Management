import { build } from 'esbuild';
await build({
  entryPoints: ['desktop/main.ts'],
  outfile: 'desktop-build/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: true,
});
await build({
  entryPoints: ['desktop/entry.ts'],
  outfile: 'desktop-build/entry.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['./mcp.mjs'],
});
await build({
  entryPoints: ['server/mcp.ts'],
  outfile: 'desktop-build/mcp.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

await import('./third-party-notices.mjs');

await build({
  entryPoints: ['desktop/preload.ts'],
  outfile: 'desktop-build/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
