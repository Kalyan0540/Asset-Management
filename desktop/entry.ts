// Run with Electron's bundled Node runtime so stdio works on Windows too.
await import(new URL('./mcp.mjs', import.meta.url).href).catch((error) => {
  console.error('Atlas could not start its agent adapter.', error);
  process.exitCode = 1;
});
