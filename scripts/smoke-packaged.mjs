import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const candidates =
  process.platform === 'darwin'
    ? [
        'release/mac/Atlas.app/Contents/MacOS/Atlas',
        'release/mac-arm64/Atlas.app/Contents/MacOS/Atlas',
      ]
    : ['release/win-unpacked/Atlas.exe'];
const path = candidates.find((p) => existsSync(p));
if (!path) throw new Error('Packaged app not found');
const child = spawn(join(process.cwd(), path), ['--smoke-test'], {
  stdio: 'inherit',
  env: process.env,
});
const timeout = setTimeout(() => {
  child.kill();
  process.exitCode = 1;
}, 90000);
child.on('exit', (code) => {
  clearTimeout(timeout);
  process.exit(code ?? 1);
});
child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(error);
  process.exit(1);
});
