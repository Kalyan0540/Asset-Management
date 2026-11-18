import { app, BrowserWindow, Menu, dialog, shell, session, clipboard } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { createLibraryServer } from '../server/http.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
import { importEagleLibrary } from '../server/eagle.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let window: BrowserWindow | null = null;
let service: ReturnType<typeof createLibraryServer> | undefined;
let root = '';
let origin = '';
let busy = false;
let eagleImport: AbortController | undefined;
const smoke = process.argv.includes('--smoke-test');
app.setName('Atlas');
if (process.env.ATLAS_USER_DATA) app.setPath('userData', process.env.ATLAS_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  window?.show();
  window?.focus();
});
const settings = () => join(app.getPath('userData'), 'preferences.json');
function savePath() {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settings(), JSON.stringify({ library: root }), { mode: 0o600 });
}
async function openLibrary(path: string) {
  const next = createLibraryServer({ root: path, dist: join(__dirname, '../dist') });
  next.server.listen(0, '127.0.0.1');
  await once(next.server, 'listening');
  const previous = service;
  service = next;
  root = path;
  origin = `http://127.0.0.1:${(next.server.address() as { port: number }).port}`;
  if (previous) {
    previous.server.close();
    previous.server.closeAllConnections();
  }
  savePath();
  writeFileSync(
    join(app.getPath('userData'), 'connection.json'),
    JSON.stringify({ url: origin, library: root }),
    { mode: 0o600 },
  );
  if (window) await window.loadURL(origin);
}
async function operation(fn: () => Promise<void>) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (error) {
    dialog.showErrorBox('Atlas could not complete this step', (error as Error).message);
  } finally {
    busy = false;
  }
}
async function confirmSwitch() {
  const { response } = await dialog.showMessageBox(window!, {
    type: 'question',
    buttons: ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    title: 'Switch library?',
    message: 'Save your open note or changes before continuing.',
    detail: 'Your existing library stays where it is. Atlas will open the selected library.',
  });
  return response === 1;
}
async function chooseLibrary(create: boolean) {
  if (!(await confirmSwitch())) return;
  const chosen = await dialog.showOpenDialog(window!, {
    title: create ? 'Choose a parent folder for a new library' : 'Open an Atlas library folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (chosen.canceled) return;
  const path = create
    ? join(chosen.filePaths[0], `Atlas Library ${Date.now()}`)
    : chosen.filePaths[0];
  if (!create && !existsSync(join(path, 'catalog.sqlite')))
    throw new Error(
      'Choose an Atlas library folder containing catalog.sqlite. For Eagle libraries, choose Library → Import Eagle Library instead.',
    );
  await openLibrary(path);
}
function agentConfiguration() {
  return {
    command: process.execPath,
    args: [join(app.isPackaged ? join(process.resourcesPath, 'agent') : __dirname, 'entry.mjs')],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      ATLAS_MCP_WRITE: '0',
      ATLAS_CONNECTION_FILE: join(app.getPath('userData'), 'connection.json'),
    },
  };
}
function menu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Library',
      submenu: [
        { label: 'New Library…', click: () => void operation(() => chooseLibrary(true)) },
        { label: 'Open Library…', click: () => void operation(() => chooseLibrary(false)) },
        { label: 'Show Library Folder', click: () => void shell.openPath(root) },
        {
          label: 'Import Eagle Library…',
          click: () =>
            void operation(async () => {
              if (!(await confirmSwitch())) return;
              const choice = await dialog.showMessageBox(window!, {
                type: 'info',
                buttons: ['Cancel', 'Choose Eagle Library'],
                defaultId: 1,
                cancelId: 0,
                message: 'Close Eagle before importing its library.',
                detail:
                  'Atlas copies originals into a new library. Your Eagle library stays unchanged. Folder paths, tags and annotations are retained; a report lists skipped files and unsupported features. You need enough free space for a separate copy.',
              });
              if (choice.response !== 1) return;
              const source = await dialog.showOpenDialog(window!, {
                title: 'Choose your Eagle .library folder',
                properties: ['openDirectory', 'treatPackageAsDirectory'],
              });
              if (source.canceled) return;
              const target = await dialog.showOpenDialog(window!, {
                title: 'Choose where to create the imported Atlas library',
                properties: ['openDirectory', 'createDirectory'],
              });
              if (target.canceled) return;
              eagleImport = new AbortController();
              menu();
              try {
                window!.setProgressBar(2);
                const result = await importEagleLibrary(
                  source.filePaths[0],
                  join(target.filePaths[0], `Imported Eagle ${Date.now()}`),
                  {
                    signal: eagleImport.signal,
                    onProgress: (done, total) => {
                      window?.setProgressBar(total ? done / total : 0);
                      window?.setTitle(`Atlas — Importing Eagle ${done}/${total}`);
                    },
                  },
                );
                await openLibrary(result.path);
                const answer = await dialog.showMessageBox(window!, {
                  type: result.report.skipped ? 'warning' : 'info',
                  buttons: ['Done', 'Open Import Report'],
                  message: `${result.report.imported} items imported; ${result.report.skipped} skipped.`,
                  detail:
                    'Your new Atlas library is open. Read the report for metadata mappings and any missing or unsupported files. Eagle has not been changed.',
                });
                if (answer.response === 1)
                  await shell.openPath(join(result.path, 'eagle-import-report.json'));
              } catch (error) {
                if (eagleImport.signal.aborted)
                  await dialog.showMessageBox(window!, {
                    message:
                      'Import cancelled. Your current library and Eagle source were not changed.',
                  });
                else throw error;
              } finally {
                eagleImport = undefined;
                window?.setProgressBar(-1);
                window?.setTitle('Atlas');
                menu();
              }
            }),
        },
        { label: 'Cancel Eagle Import', enabled: !!eagleImport, click: () => eagleImport?.abort() },

        { type: 'separator' },
        {
          label: 'Back Up Library…',
          click: () =>
            void operation(async () => {
              const chosen = await dialog.showOpenDialog(window!, {
                title: 'Choose where to save your backup',
                properties: ['openDirectory', 'createDirectory'],
              });
              if (chosen.canceled) return;
              const result = await createBackup(
                service!.library,
                join(
                  chosen.filePaths[0],
                  `Atlas Backup ${new Date().toISOString().replace(/[:.]/g, '-')}`,
                ),
              );
              await dialog.showMessageBox(window!, {
                type: 'info',
                message: 'Your backup is ready.',
                detail: `${result.items} items and ${result.files} original files were verified.\n\n${result.path}`,
              });
            }),
        },
        {
          label: 'Restore a Backup…',
          click: () =>
            void operation(async () => {
              if (!(await confirmSwitch())) return;
              const chosen = await dialog.showOpenDialog(window!, {
                title: 'Choose an Atlas backup folder',
                properties: ['openDirectory'],
              });
              if (chosen.canceled) return;
              const path = join(app.getPath('userData'), `Restored Library ${Date.now()}`);
              await restoreBackup(chosen.filePaths[0], path);
              await openLibrary(path);
              await dialog.showMessageBox(window!, {
                type: 'info',
                message: 'Your backup has been restored into a new library.',
                detail: 'Your previous library has not been changed.',
              });
            }),
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Agents',
      submenu: [
        {
          label: 'Copy Codex MCP Setup',
          click: () => {
            const { command, args, env } = agentConfiguration();
            const quoted = (value: string) => JSON.stringify(value).replace(/\u007f/g, '\\u007F');
            clipboard.writeText(
              [
                '[mcp_servers.atlas]',
                `command = ${quoted(command)}`,
                `args = [${args.map(quoted).join(', ')}]`,
                'default_tools_approval_mode = "prompt"',
                '',
                '[mcp_servers.atlas.env]',
                ...Object.entries(env).map(([key, value]) => `${key} = ${quoted(value)}`),
                '',
              ].join('\n'),
            );
            void dialog
              .showMessageBox(window!, {
                type: 'info',
                message: 'Codex configuration copied',
                detail:
                  'Add it to your local Codex config.toml and start a new local session. Keep Atlas open. Codex can search, read notes and view supported images.',
                buttons: ['Done', 'Open setup guide'],
              })
              .then(({ response }) => {
                if (response === 1)
                  void shell.openExternal(
                    `https://github.com/Kalyan0540/Asset-Management/blob/v${app.getVersion()}/docs/CODEX.md`,
                  );
              });
          },
        },
        {
          label: 'Copy Read-only MCP Configuration',
          click: () => {
            clipboard.writeText(
              JSON.stringify({ mcpServers: { atlas: agentConfiguration() } }, null, 2),
            );
            void dialog.showMessageBox(window!, {
              type: 'info',
              message: 'Agent configuration copied.',
              detail:
                'Paste it into the MCP settings of your agent app. Keep Atlas open while the agent uses your library. This configuration exposes search and read tools only.',
            });
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Getting Started',
          click: () =>
            void shell.openExternal(
              `https://github.com/Kalyan0540/Asset-Management/blob/v${app.getVersion()}/docs/GETTING_STARTED.md`,
            ),
        },
        {
          label: 'Open-source Notices',
          click: () =>
            void shell.openPath(
              join(app.isPackaged ? process.resourcesPath : __dirname, 'THIRD_PARTY_NOTICES.txt'),
            ),
        },
        {
          label: 'Downloads and Updates',
          click: () =>
            void shell.openExternal('https://github.com/Kalyan0540/Asset-Management/releases'),
        },
        {
          label: 'About This Early Release',
          click: () =>
            void dialog.showMessageBox(window!, {
              type: 'info',
              message: `Atlas ${app.getVersion()} — early desktop release`,
              detail:
                'Files, notes, tags, collections, relations, history and backups work locally. Device sync and the Chrome extension are still in development. Eagle import is available from the Library menu. Your files are not uploaded automatically.',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    let saved: string | undefined;
    try {
      saved = JSON.parse(readFileSync(settings(), 'utf8')).library;
    } catch {}
    await openLibrary(
      process.env.ATLAS_LIBRARY ?? saved ?? join(app.getPath('userData'), 'Library'),
    );
    window = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#161719',
      show: false,
      title: 'Atlas',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    window.webContents.on('will-prevent-unload', (event) => {
      const choice = dialog.showMessageBoxSync(window!, {
        type: 'question',
        buttons: ['Keep Editing', 'Discard Changes'],
        defaultId: 0,
        cancelId: 0,
        message: 'You have unsaved changes.',
      });
      if (choice === 1) event.preventDefault();
    });
    menu();
    await window.loadURL(origin);
    window.show();
    if (smoke) {
      await window.webContents.executeJavaScript(
        `(async()=>{await fetch('/api/session');const result=await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Desktop smoke test',body:'# Native app'})});if(!result.ok)throw new Error('Native database write failed');const data=await (await fetch('/api/library')).json();if(!data.items.some(i=>i.title==='Desktop smoke test'))throw new Error('Native database read failed');if(!document.getElementById('root')?.textContent?.includes('All items'))throw new Error('Interface did not render');return true;})()`,
      );
      const testBackup = join(app.getPath('userData'), `Smoke Backup ${Date.now()}`);
      await createBackup(service!.library, testBackup);
      await restoreBackup(testBackup, join(app.getPath('userData'), `Smoke Restore ${Date.now()}`));
      console.log('DESKTOP_SMOKE_OK');
      const client = new Client({ name: 'packaged-smoke', version: '1.0.0' });
      const transport = new StdioClientTransport({
        ...agentConfiguration(),
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
          ),
          ...agentConfiguration().env,
        },
        stderr: 'inherit',
      });
      try {
        await client.connect(transport);
        const result = await client.callTool({
          name: 'search_library',
          arguments: { query: 'Desktop smoke test', limit: 5 },
        });
        if (!JSON.stringify(result).includes('Desktop smoke test'))
          throw new Error('Packaged MCP search failed');
      } finally {
        await client.close();
      }
      console.log('DESKTOP_MCP_OK');
      app.exit(0);
    }
  })
  .catch((error) => {
    console.error(error);
    if (!smoke) dialog.showErrorBox('Atlas could not start', error.message);
    app.exit(1);
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  service?.server.close();
  service?.server.closeAllConnections();
});
