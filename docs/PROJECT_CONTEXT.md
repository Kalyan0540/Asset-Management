# Project context and continuation guide

Updated 18 November 2026. This file records project decisions and verified delivery state so work can continue without relying on a chat transcript. It contains no credentials or personal library data.

## Product and user

Atlas is an Eagle-inspired personal asset and knowledge manager. The user is a designer and wants straightforward installers and plain-language instructions. Priorities are Windows, macOS and Android, personal use across devices first, a minimal dark interface, assets and Markdown notes, tags/collections, relations/graph/table views, and native AI/agent integration. Plugins are deferred. Automatic synchronization is a separate feature, not supplied by GitHub.

## Delivered baseline

- Desktop version 0.2.1 is published: https://github.com/Kalyan0540/Asset-Management/releases/tag/v0.2.1
- Release source: e1750894c4f0fb7606351d5dd6682a283bea5daa on `feat/library-foundation`.
- Windows x64, macOS Apple-chip and macOS Intel builds and packaged-app checks passed: https://github.com/Kalyan0540/Asset-Management/actions/runs/44129441363
- Build, integration and browser checks passed: https://github.com/Kalyan0540/Asset-Management/actions/runs/44129441425
- The full product plan is not complete. Read IMPLEMENTATION_STATUS.md and FEATURE_BACKLOG.csv before claiming feature parity.
- Installers are not publisher-signed or Apple-notarized. Local AI uses a separately installed Ollama model; testing uses a deterministic local fixture, not a real-model quality evaluation.

## Code and storage

React/TypeScript UI in `src/`, shared contracts in `shared/`, Node 24 SQLite/HTTP/MCP service in `server/`, Electron shell in `desktop/`. Desktop menus create/open libraries, back up and restore, and copy an MCP configuration. The adapter uses Electron's bundled Node runtime, including on Windows. Release builds include third-party notices.

Libraries contain `catalog.sqlite`, immutable SHA-256-addressed originals in `blobs/`, and a private local agent token. Revisions reject stale writes. Bulk updates are atomic. Backups use a consistent SQLite snapshot, copy and hash-check originals, and restore into a new directory. Never commit personal libraries, credentials, build output or dependency directories.

The browser UI is responsive, but that does not constitute an Android app. Node/Electron cannot simply be shipped inside an Android WebView; Android needs a native storage bridge or its own local implementation. Preserve offline usability and original-file integrity when making that choice.

## Current requested order

1. Commit and push current documentation and this continuation context to GitHub **before** implementing the next features.
2. Implement Eagle library import, preserving original files and reporting unsupported metadata or damaged items without modifying the Eagle source.
3. Start the Android app, with installable delivery, local persistence and clear limitations. Do not describe a desktop-dependent browser shortcut as a native offline Android library.
4. Keep docs, acceptance tests and GitHub delivery synchronized with actual implementation.

The user has authorized branches, implementation, commits and pushes autonomously. Do not ask for the same authorization again. A representative private Eagle library has not been provided; use documented layouts and synthetic fixtures, state the compatibility evidence, and do not claim validation against their personal library.

## Verification and delivery

Use `npm run check` for formatting, TypeScript, production build and integration tests. `npm run test:e2e` runs browser workflows. `npm run build:desktop` bundles the native shell; native and packaged smoke tests verify UI/database, backup/restore and MCP. Desktop releases build on platform runners when a version tag is pushed, and publish only when all package jobs pass.

For nontechnical usage, point to GETTING_STARTED.md and actual release installers, not source archives or terminal instructions. GitHub stores code/docs/installers; the cloud workspace is a development machine; the user's personal library remains local until synchronization is implemented.
