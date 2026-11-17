import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
if (process.argv.includes('--mcp')) {
  app.setName('Atlas');
  if (process.env.ATLAS_USER_DATA) app.setPath('userData', process.env.ATLAS_USER_DATA);
  try {
    const connection = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'connection.json'), 'utf8'),
    );
    process.env.ATLAS_URL = connection.url;
    process.env.ATLAS_LIBRARY = connection.library;
    const adapter = pathToFileURL(join(__dirname, 'mcp.mjs')).href;
    void import(adapter).catch((error) => {
      console.error('Atlas agent could not connect. Open the Atlas app first.', error);
      app.exit(1);
    });
    process.stdin.on('end', () => app.exit(0));
  } catch {
    console.error('Open the Atlas app once before connecting a local agent.');
    app.exit(1);
  }
} else {
  const main = join(__dirname, 'main.cjs');
  require(main);
}
