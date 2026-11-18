# ADR 003: Native offline Android preview with compatible backups

18 November 2026. Applies to the initial Android preview, not the full R1 sync design.

## Decision

Use Android's native views, SQLite, content providers and Storage Access Framework for the first phone app. The desktop remains Electron/React/Node. Share the schema-1 JSON item/catalog contract, SHA-256 original-file layout and verified backup folder format, not the Node server or React presentation code.

A responsive desktop page is insufficient for offline Android storage and receiving shared files. Running the desktop HTTP server inside a WebView would add a second runtime and lifecycle complexity. A native app can copy granted content streams into app-owned storage without Internet or broad filesystem permissions. This first client intentionally has a smaller interface and feature set than desktop.

This trades duplicated storage/UI code for a small native dependency surface. The cross-platform gate generates a backup with the real Node implementation, edits it with the Android SQLite implementation in an emulator, then restores and verifies the Android snapshot with the real desktop code. Changes to the shared model or storage need this test to continue passing. Snapshot copying is serialized under Android's store lock with DELETE journaling; the folder manifest is committed last after file verification.

## Reuse and constraints

Platform SQLite, document pickers and media viewers perform the major platform-specific work. No external Eagle application's source was copied. [Eagle Nest](https://github.com/koto9x/eagle-nest) was identified as another mobile Eagle client during format research, but adopting a separate Eagle-format client would not by itself provide Atlas notes/revisions and desktop-compatible backups. It was not selected as the foundation without a separate license, maintenance and adaptation evaluation. The broader reuse evaluation remains in OPEN_SOURCE_OPTIONS.md.

Manual backup transfer is intentionally distinct from synchronization. Restores create separate local libraries; edits on two devices are not merged. Incoming shares copy while the app is alive and do not yet have a persisted background work queue. Graphs/tables, AI/MCP, richer Markdown, share recovery, device pairing, conflict resolution, production signing and physical-device certification remain pending.

Android previews use a development signing identity cached by CI. This is not a reliable production signing or upgrade strategy. Backups must precede uninstall/signature changes; a durable signing process is required before a production release.
