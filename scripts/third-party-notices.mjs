import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Include every production dependency, including transitive packages used by
// the bundled MCP SDK. Keep notices alongside the distributed app's code.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let notices = 'Atlas — third-party software notices\n\n';
notices += 'The following notices apply to their respective third-party components.\n';
notices += 'Electron also distributes its Chromium notices with the runtime.\n\n';
for (const [directory, record] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!directory || (record.dev && directory !== 'node_modules/electron')) continue;
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory))
    .filter((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))
    .sort();
  if (!files.length) throw new Error(`Missing license notice for ${pkg.name}`);
  notices += `${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? record.license ?? 'See below'}\n\n`;
  for (const file of files) {
    const path = join(directory, file);
    if ((await stat(path)).isFile()) notices += `${file}\n${await readFile(path, 'utf8')}\n\n`;
  }
}
await writeFile('desktop-build/THIRD_PARTY_NOTICES.txt', notices);
