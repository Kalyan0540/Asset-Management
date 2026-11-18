# Atlas — personal asset and knowledge library

A local-first asset library inspired by Eagle, with Markdown notes, collections, tags, typed relations and agent access. The compact desktop workspace supports System, Light, and Dark appearance. **This is an early desktop release, not the complete planned product.**

The desktop app imports Eagle libraries and includes tags, folders, previews, a Markdown editor, backups, and local Codex access. The Android preview stores files and notes offline and supports manual backup transfer.

## Downloads

Open [GitHub Releases](https://github.com/Kalyan0540/Asset-Management/releases) and choose the newest published desktop release. Under **Assets**, pick `mac-arm64.dmg` for an Apple-chip Mac, `mac-x64.dmg` for an Intel Mac, or `win-x64.exe` for 64-bit Windows. [Desktop setup](docs/GETTING_STARTED.md)

[Download the Android preview APK](https://github.com/Kalyan0540/Asset-Management/releases/download/android-v0.3.0-preview/Atlas-0.3.0-android-preview.apk) · [Android setup](docs/ANDROID.md)

The native **Library** menu opens libraries, shows their location, makes verified backups, and combines two Atlas libraries into a separate copy. The desktop gallery has a **Search web by image** action, and **All Tags** offers a preview before renaming or merging tags. Your data stays outside the installed application when you update.

## Run from source (developers)

Requires **Node.js 24 or later** and npm. Clone the repository and select the implementation branch:

```sh
git clone --branch feat/library-foundation https://github.com/Kalyan0540/Asset-Management.git
cd Asset-Management
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3210** on the same machine. Import a file or create a note to start; no sample data or AI account is required. `npm run dev` serves the development interface at the same URL. Changes to server code require restarting that command.

By default, your originals, catalog, history and private agent token live in `.library/`, which Git ignores. To select another library, set `ATLAS_LIBRARY` to a directory before starting the service; set `PORT` to change the port. In PowerShell, for example:

```powershell
$env:ATLAS_LIBRARY = 'C:\Users\YourName\AtlasLibrary'
npm start
```

Do not sync a live `.library` directory through Git, Dropbox or a shared drive. This prototype has no cross-device synchronization. Keep important originals backed up. The [status document](docs/IMPLEMENTATION_STATUS.md) explains backup limitations and every major unimplemented area.

To build the desktop app from source, run `npm run desktop`. To package it for your current platform, run `npm run package:desktop`. Release automation builds and smoke-tests Apple-chip Mac, Intel Mac and Windows packages.

## Use with a local agent

**Codex:** use **Agents → Copy Codex MCP Setup** and follow the [local setup guide](docs/CODEX.md).

**Other local MCP apps:** choose **Agents → Copy Read-only MCP Configuration**, then paste that configuration into your agent's MCP settings. Keep Atlas open. The installed app includes its own adapter, so no Node installation or source checkout is needed. The instructions below are for source-development use.

Start the library service first. Configure your MCP client to launch the adapter from this repository. Replace the absolute paths below with your installation paths; `node` must resolve to Node 24+:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["--import", "/absolute/path/Asset-Management/node_modules/tsx/dist/loader.mjs", "/absolute/path/Asset-Management/server/mcp.ts"],
      "env": {
        "ATLAS_LIBRARY": "/absolute/path/Asset-Management/.library",
        "ATLAS_URL": "http://127.0.0.1:3210"
      }
    }
  }
}
```

The adapter exposes `search_library`, `read_item` and `read_image`. To deliberately enable reversible metadata/note writes, add `"ATLAS_MCP_WRITE": "1"`; this also exposes `update_item` and `create_note`. Updates require the current `expectedRevision` and reject conflicts. This is a whole-library capability, not per-folder permission management. The adapter reads the local `agent-token` file; keep it private. Client configuration wrappers vary by MCP client.

On Windows, use a file URL for the source-development `--import` loader argument, for example `file:///C:/Projects/Asset-Management/node_modules/tsx/dist/loader.mjs`, and normal absolute paths for the script and library directory. The desktop adapter discovers its current library and port automatically from the running app.

For development, `npm run mcp` starts the same stdio adapter. Do not log ordinary text to its stdout: stdout carries protocol messages. The HTTP API accepts the private token as a Bearer credential, and the browser uses an HttpOnly, SameSite session cookie.

## Check the implementation

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

If Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable instead of downloading a browser. Browser tests use a separate `.test-library/` directory, leaving your default library alone. GitHub Actions is configured to run build, integration and browser checks.

## Eagle import and Android

Use desktop 0.3.0 or later for [Eagle library import](docs/EAGLE_IMPORT.md). The separate [Android preview guide](docs/ANDROID.md) covers installing the APK and manually moving verified backups between your phone and computer. See GitHub Releases for published downloads; the older 0.2.1 installers do not contain these additions.

## Project documents

See the [documentation index](docs/README.md) for user guides, research, planning, and engineering notes.

The implementation branch is `feat/library-foundation`. The task workspace is `/workspace/Asset-Management`; that path is on the cloud machine, not your laptop. GitHub is the versioned source location after push. Neither GitHub nor the Codex workspace is the future personal-library sync service.

Planning baseline: 17 November 2026. Atlas is a working name. No application distribution license has been chosen yet; third-party packages retain their own licenses. Do not infer an open-source redistribution grant for the new application solely from repository visibility.
