import {
  nativeTheme,
  app,
  BrowserWindow,
  Menu,
  dialog,
  shell,
  session,
  clipboard,
  ipcMain,
} from 'electron';
import { basename, extname, join } from 'node:path';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { createLibraryServer } from '../server/http.ts';
import { createBrowserCaptureServer } from '../server/browser-capture.ts';
import { capturePort } from '../shared/capture.ts';
import { createBackup, restoreBackup } from '../server/backup.ts';
import { importEagleLibrary } from '../server/eagle.ts';
import { mergeLibraries } from '../server/merge.ts';
import { imageSearchExtension, imageSearchProviders } from '../shared/image-search.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let window: BrowserWindow | null = null;
let service: ReturnType<typeof createLibraryServer> | undefined;
let root = '';
let origin = '';
let busy = false;
let eagleImport: AbortController | undefined;
const smoke = process.argv.includes('--smoke-test');
const imageSearchFolders = new Set<string>();
app.setName('Atlas');
if (process.env.ATLAS_USER_DATA) app.setPath('userData', process.env.ATLAS_USER_DATA);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  window?.show();
  window?.focus();
});
const settings = () => join(app.getPath('userData'), 'preferences.json');
const captureKeyPath = () => join(app.getPath('userData'), 'browser-capture-key');
let captureKey: string | undefined;
const capture = createBrowserCaptureServer(
  () => service?.library,
  () => captureKey,
  () => {
    if (window && !window.isDestroyed()) window.webContents.send('atlas:capture-saved');
  },
);
function startBrowserCapture() {
  if (existsSync(captureKeyPath())) {
    const saved = readFileSync(captureKeyPath(), 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(saved)) captureKey = saved;
  }
  capture.on('error', (error) => console.warn('Atlas Capture is unavailable.', error.message));
  capture.listen(capturePort, '127.0.0.1');
}
function copyCaptureKey(reset = false) {
  if (!capture.listening)
    throw new Error(
      'Atlas Capture could not open its local port. Check if another Atlas app is running.',
    );
  if (!captureKey || reset) {
    const key = randomBytes(32).toString('hex');
    writeFileSync(captureKeyPath(), key, { mode: 0o600 });
    captureKey = key;
  }
  clipboard.writeText(captureKey);
}
function preferences(): {
  library?: string;
  recent?: unknown;
  appearance?: 'system' | 'light' | 'dark';
} {
  try {
    return JSON.parse(readFileSync(settings(), 'utf8'));
  } catch {
    return {};
  }
}
function recentLibraries(): string[] {
  const saved = preferences().recent;
  return Array.isArray(saved)
    ? saved.filter((entry) => typeof entry === 'string').slice(0, 20)
    : [];
}
function writePreferences(update: ReturnType<typeof preferences>) {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(settings(), JSON.stringify({ ...preferences(), ...update }), { mode: 0o600 });
}
function savePath() {
  writePreferences({
    library: root,
    recent: [...new Set([root, ...recentLibraries()])].slice(0, 20),
  });
}
async function openLibrary(path: string) {
  const next = createLibraryServer({ root: path, dist: join(__dirname, '../dist') });
  next.server.listen(0, '127.0.0.1');
  await once(next.server, 'listening');
  const previous = service;
  const previousRoot = root;
  const previousOrigin = origin;
  service = next;
  root = path;
  origin = `http://127.0.0.1:${(next.server.address() as { port: number }).port}`;
  try {
    if (window) await window.loadURL(origin);
  } catch (error) {
    service = previous;
    root = previousRoot;
    origin = previousOrigin;
    next.server.close();
    next.server.closeAllConnections();
    if ((error as Error & { code?: string }).code === 'ERR_ABORTED') return false;
    throw error;
  }
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
  return true;
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
async function chooseMerge() {
  if (!(await confirmSwitch())) return;
  const current = service!.library;
  const source = await dialog.showOpenDialog(window!, {
    title: 'Choose the second Atlas library',
    properties: ['openDirectory'],
  });
  if (source.canceled) return;
  const target = await dialog.showOpenDialog(window!, {
    title: 'Choose where the combined library will be saved',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (target.canceled) return;
  const destination = join(
    target.filePaths[0],
    `Merged Atlas ${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
  );
  try {
    const result = await mergeLibraries(current, source.filePaths[0], destination, {
      review: async (preview) => {
        const { response } = await dialog.showMessageBox(window!, {
          type: 'question',
          title: 'Merge Atlas libraries',
          message: `Combine “${basename(preview.current)}” with “${basename(preview.source)}”?`,
          detail: `The second library has ${preview.assets} assets, ${preview.notes} notes (${preview.trashed} items in Trash), ${preview.folders} folders, ${preview.groups} tag groups, ${preview.smartFolders} smart folders, and ${preview.revisions} revisions. It will be copied into a new library at:\n\n${destination}\n\nThe source folder tree will appear under “From ${basename(preview.source)}”. The new library will use both libraries’ import rules.`,
          buttons: ['Cancel', 'Create combined library'],
          defaultId: 0,
          cancelId: 0,
        });
        return response === 1;
      },
      progress: () => {
        window?.setProgressBar(2);
        window?.setTitle('Atlas — Merging libraries');
      },
    });
    if (!result) return;
    const { response } = await dialog.showMessageBox(window!, {
      type: 'info',
      message: 'The combined library is ready.',
      detail: `${result.path}\n\nEach item from both libraries has its own entry in this copy.`,
      buttons: ['Done', 'Open combined library'],
      defaultId: 1,
      cancelId: 0,
    });
    if (response === 1) await openLibrary(result.path);
  } finally {
    window?.setProgressBar(-1);
    window?.setTitle('Atlas');
  }
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
function checkWindow(event: Electron.IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    !event.senderFrame ||
    event.senderFrame.parent !== null ||
    new URL(event.senderFrame.url).origin !== origin
  )
    throw new Error('This action is available in the Atlas window.');
}
ipcMain.handle('atlas:appearance', (event) => {
  checkWindow(event);
  return preferences().appearance ?? 'system';
});
ipcMain.handle('atlas:read-drafts', (event) => {
  checkWindow(event);
  const file = join(root, 'staging', 'editor-drafts.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
});
ipcMain.handle('atlas:write-drafts', (event, drafts: unknown) => {
  checkWindow(event);
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts))
    throw new Error('Invalid drafts.');
  const data = JSON.stringify(drafts);
  if (Buffer.byteLength(data) > 12_000_000) throw new Error('Too much pending text to recover.');
  const file = join(root, 'staging', 'editor-drafts.json');
  if (data === '{}') {
    rmSync(file, { force: true });
    return;
  }
  writeFileSync(file + '.tmp', data, { mode: 0o600 });
  renameSync(file + '.tmp', file);
});
ipcMain.handle('atlas:set-appearance', (event, value: unknown) => {
  checkWindow(event);
  if (value !== 'light' && value !== 'dark' && value !== 'system')
    throw new Error('Unknown appearance.');
  writePreferences({ appearance: value });
  nativeTheme.themeSource = value;
});
ipcMain.handle('atlas:libraries', (event) => {
  checkWindow(event);
  return {
    active: root,
    entries: [...new Set([root, ...recentLibraries()])]
      .slice(0, 20)
      .map((path) => ({ path, name: basename(path) })),
  };
});
ipcMain.handle('atlas:library-action', async (event, action: string, path?: string) => {
  checkWindow(event);
  if (busy) return;
  if (action === 'reveal') return shell.openPath(root);
  if (action === 'merge') return operation(chooseMerge);
  if (action === 'new' || action === 'open')
    return operation(() => chooseLibrary(action === 'new'));
  if (
    action === 'recent' &&
    path &&
    recentLibraries().includes(path) &&
    existsSync(join(path, 'catalog.sqlite'))
  ) {
    return operation(async () => {
      if (path !== root && (await confirmSwitch())) await openLibrary(path);
    });
  }
  if (action === 'recent')
    throw new Error('This library is no longer available at its saved location.');
});
function exportName(raw: string) {
  let name =
    basename(raw.replaceAll('\\', '/'))
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[. ]+$/, '')
      .slice(0, 180) || 'item';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}
ipcMain.handle(
  'atlas:image-search',
  async (event, id: unknown, provider: unknown, png?: unknown) => {
    checkWindow(event);
    if (typeof id !== 'string' || (provider !== 'google' && provider !== 'tineye'))
      throw new Error('Choose an image and a search provider.');
    const item = service!.library.get(id);
    const extension = imageSearchExtension(item.mime);
    if (item.kind !== 'asset' || !extension || !item.hash || !/^[a-f0-9]{64}$/.test(item.hash))
      throw new Error('Choose a supported image.');
    const original = join(root, 'blobs', item.hash);
    const converted = item.mime === 'image/avif';
    const limit = 20_000_000;
    if (
      converted &&
      (!ArrayBuffer.isView(png) ||
        png.byteLength < 8 ||
        png.byteLength > limit ||
        !Buffer.from(png.buffer, png.byteOffset, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        ))
    )
      throw new Error('This AVIF could not be prepared as a PNG under 20 MB.');
    if (provider === 'tineye' && !converted && item.size > limit)
      throw new Error('TinEye accepts images up to 20 MB.');
    const folder = await mkdtemp(join(app.getPath('temp'), 'atlas-search-'));
    imageSearchFolders.add(folder);
    const target = join(
      folder,
      exportName(basename(item.filename, extname(item.filename))).slice(0, 170) + extension,
    );
    try {
      if (converted && ArrayBuffer.isView(png))
        await writeFile(target, Buffer.from(png.buffer, png.byteOffset, png.byteLength), {
          flag: 'wx',
          mode: 0o600,
        });
      else await copyFile(original, target, constants.COPYFILE_EXCL);
      shell.showItemInFolder(target);
      await shell.openExternal(imageSearchProviders[provider].url);
    } catch (error) {
      rmSync(folder, { recursive: true, force: true });
      imageSearchFolders.delete(folder);
      throw error;
    }
  },
);
ipcMain.handle('atlas:item-action', async (event, id: unknown, action: unknown) => {
  checkWindow(event);
  if (typeof id !== 'string' || (action !== 'open-copy' && action !== 'reveal'))
    throw new Error('Invalid item action.');
  const item = service!.library.get(id);
  const path =
    item.hash && /^[a-f0-9]{64}$/.test(item.hash) ? join(root, 'blobs', item.hash) : undefined;
  if (action === 'reveal') {
    if (!path || !existsSync(path)) throw new Error('The original file is unavailable.');
    shell.showItemInFolder(path);
    return;
  }
  const filename = exportName(item.kind === 'note' ? `${item.title}.md` : item.filename);
  const allowed =
    /^\.(png|jpe?g|gif|webp|avif|tiff?|bmp|ico|heic|svg|mp4|m4v|mov|webm|mp3|wav|ogg|flac|m4a|pdf|txt|md|csv|docx|pptx|xlsx|psd|ai|indd|fig|sketch|xcf)$/i;
  if (!allowed.test(extname(filename)))
    throw new Error('This file type can be exported from Atlas.');
  const folder = await mkdtemp(join(app.getPath('temp'), 'atlas-original-'));
  const target = join(folder, filename);
  if (item.kind === 'note') await writeFile(target, item.body, { flag: 'wx' });
  else {
    if (!path) throw new Error('The original file is unavailable.');
    await copyFile(path, target, constants.COPYFILE_EXCL);
  }
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
});
ipcMain.handle('atlas:export-originals', async (event, ids: unknown) => {
  checkWindow(event);
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== 'string')
  )
    throw new Error('Select between 1 and 500 items.');
  const activeService = service!;
  const activeRoot = root;
  const items = [...new Set(ids)].map((id) => activeService.library.get(id));
  const destination = await dialog.showOpenDialog(window!, {
    title: 'Choose where to export selected files',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (destination.canceled) return { count: 0, skipped: [] };
  let count = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const raw = item.kind === 'note' ? `${item.title}.md` : item.filename;
    const safe = exportName(raw);
    const ext = extname(safe);
    const stem = ext ? safe.slice(0, -ext.length) : safe;
    try {
      for (let index = 1; ; index++) {
        const name = index === 1 ? safe : `${stem} (${index})${ext}`;
        const target = join(destination.filePaths[0], name);
        try {
          if (item.kind === 'note') await writeFile(target, item.body, { flag: 'wx' });
          else {
            if (!item.hash || !/^[a-f0-9]{64}$/.test(item.hash))
              throw new Error('Missing original.');
            await copyFile(join(activeRoot, 'blobs', item.hash), target, constants.COPYFILE_EXCL);
          }
          count++;
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
    } catch {
      skipped.push(item.title);
    }
  }
  return { count, skipped };
});
function menu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Library',
      submenu: [
        { label: 'New Library…', click: () => void operation(() => chooseLibrary(true)) },
        { label: 'Open Library…', click: () => void operation(() => chooseLibrary(false)) },
        { label: 'Merge Libraries…', click: () => void operation(chooseMerge) },
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
      label: 'Browser Capture',
      submenu: [
        {
          label: 'Copy Pairing Key',
          click: () =>
            void operation(async () => {
              copyCaptureKey();
              await dialog.showMessageBox(window!, {
                message: 'Pairing key copied',
                detail: 'Paste the key in Atlas Capture → Preferences in Chrome.',
              });
            }),
        },
        {
          label: 'Reset Pairing Key…',
          click: () =>
            void operation(async () => {
              const answer = await dialog.showMessageBox(window!, {
                type: 'question',
                buttons: ['Cancel', 'Reset and Copy'],
                defaultId: 0,
                cancelId: 0,
                message: 'Reset the browser pairing key?',
                detail: 'Extensions using the old key will need to pair again.',
              });
              if (answer.response === 1) copyCaptureKey(true);
            }),
        },
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
                'Files, notes, tags, collections, relations, history and backups work locally. Use the Browser Capture menu to pair the Chrome preview. Eagle import is available from the Library menu.',
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
    const saved = preferences();
    nativeTheme.themeSource =
      saved.appearance === 'light' || saved.appearance === 'dark' ? saved.appearance : 'system';
    await openLibrary(
      process.env.ATLAS_LIBRARY ?? saved.library ?? join(app.getPath('userData'), 'Library'),
    );
    if (!smoke) startBrowserCapture();
    window = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#191b20' : '#fdfdfe',
      show: false,
      title: 'Atlas',
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
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
        `(async()=>{await fetch('/api/session');const bridge=window.atlasDesktop;const libraries=await bridge.libraries();if(!libraries.active||await bridge.appearance()!=='system')throw new Error('Desktop workspace bridge failed');const result=await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Desktop smoke test',body:'# Native app'})});if(!result.ok)throw new Error('Native database write failed');const data=await (await fetch('/api/library')).json();if(!data.items.some(i=>i.title==='Desktop smoke test'))throw new Error('Native database read failed');if(!document.getElementById('root')?.textContent?.includes('All items'))throw new Error('Interface did not render');return true;})()`,
      );
      const testBackup = join(app.getPath('userData'), `Smoke Backup ${Date.now()}`);
      await createBackup(service!.library, testBackup);
      const restored = await restoreBackup(
        testBackup,
        join(app.getPath('userData'), `Smoke Restore ${Date.now()}`),
      );
      const merged = await mergeLibraries(
        service!.library,
        restored,
        join(app.getPath('userData'), `Smoke Merge ${Date.now()}`),
        {
          review: async (preview) => preview.notes === 1,
        },
      );
      if (!merged || merged.collisions !== 1 || !(await openLibrary(merged.path)))
        throw new Error('Desktop library merge failed');
      const mergeWorked = await window.webContents.executeJavaScript(
        `(async()=>{await fetch('/api/session');const data=await (await fetch('/api/library')).json();return data.items.filter(i=>i.title==='Desktop smoke test').length===2;})()`,
      );
      if (!mergeWorked) throw new Error('Combined library did not open');
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
  capture.close();
  capture.closeAllConnections();
});
app.on('will-quit', () => {
  for (const folder of imageSearchFolders) {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // A browser may still have the temporary image open.
    }
  }
});
