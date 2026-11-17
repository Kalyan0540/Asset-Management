import { readFileSync } from 'node:fs';

// Run with Electron's bundled Node runtime so stdio works on Windows too.
try {
  const connection = JSON.parse(readFileSync(process.env.ATLAS_CONNECTION_FILE!, 'utf8'));
  process.env.ATLAS_URL = connection.url;
  process.env.ATLAS_LIBRARY = connection.library;
  await import(new URL('./mcp.mjs', import.meta.url).href);
} catch (error) {
  console.error('Atlas agent could not connect. Open the Atlas app first.', error);
  process.exitCode = 1;
}
