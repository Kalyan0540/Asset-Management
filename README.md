# Atlas — personal asset and knowledge library

A local-first asset library inspired by Eagle, with Markdown notes, collections, tags, typed relations and agent access. The working interface uses a minimal dark theme. **This is an early desktop release, not the complete planned product.**

The desktop app imports Eagle libraries and includes tags, folders, previews, a Markdown editor, backups, and local Codex access. The Android preview stores files and notes offline and supports manual backup transfer.

## Downloads

| Device | Installer |
|---|---|
| Mac with Apple chip (M1 or newer) | [Atlas 0.4.0 for Apple chip](https://github.com/Kalyan0540/Asset-Management/releases/download/v0.4.0/Atlas-0.4.0-mac-arm64.dmg) |
| Mac with Intel processor | [Atlas 0.4.0 for Intel Mac](https://github.com/Kalyan0540/Asset-Management/releases/download/v0.4.0/Atlas-0.4.0-mac-x64.dmg) |
| Windows with Intel or AMD processor | [Atlas 0.4.0 for Windows](https://github.com/Kalyan0540/Asset-Management/releases/download/v0.4.0/Atlas-0.4.0-win-x64.exe) |
| Android 8.0 or newer | [Atlas Android preview APK](https://github.com/Kalyan0540/Asset-Management/releases/download/android-v0.3.0-preview/Atlas-0.3.0-android-preview.apk) |

See the [desktop installation guide](docs/GETTING_STARTED.md), the [Android setup guide](docs/ANDROID.md), or [all GitHub releases](https://github.com/Kalyan0540/Asset-Management/releases).

The native **Library** menu creates/opens libraries, shows their location, makes verified backups and restores a backup into a separate library. Your data stays outside the installed application, so replacing the app does not replace the library.

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

- [Getting started](docs/GETTING_STARTED.md): simple download, install, first-use, backup and AI instructions.
- [Release notes](docs/RELEASE_NOTES.md): what is included and still pending in 0.2.

- [Implementation status](docs/IMPLEMENTATION_STATUS.md): working capabilities, measured checks, limitations and next gates.
- [Local API](docs/API.md): endpoints, storage layout, error semantics and agent boundaries.
- [Architecture decision 001](docs/ADR-001-REFERENCE-PROTOTYPE.md): why this executable baseline does not close the fork/production-stack decision.
- [Project plan](docs/PROJECT_PLAN.md): full Windows/macOS/Android scope, architecture options, AI, sync and milestones.
- [Eagle research](docs/RESEARCH.md): feature baseline, evidence limits and primary sources.
- [Open-source options](docs/OPEN_SOURCE_OPTIONS.md): candidate applications, components, licenses and adoption tests.
- [Feature backlog](docs/FEATURE_BACKLOG.csv): staged requirements and acceptance criteria.
- [Cloud workspace and GitHub guide](docs/WORKSPACE_GUIDE.md): where files live and how commits/pushes work.

The implementation branch is `feat/library-foundation`. The task workspace is `/workspace/Asset-Management`; that path is on the cloud machine, not your laptop. GitHub is the versioned source location after push. Neither GitHub nor the Codex workspace is the future personal-library sync service.

Planning baseline: 17 November 2026. Atlas is a working name. No application distribution license has been chosen yet; third-party packages retain their own licenses. Do not infer an open-source redistribution grant for the new application solely from repository visibility.
