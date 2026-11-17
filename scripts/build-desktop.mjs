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
