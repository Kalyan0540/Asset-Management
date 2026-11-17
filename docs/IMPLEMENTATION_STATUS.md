# Implementation status — local library foundation

17 November 2026. Product working name: **Atlas**. This implementation is an M0 reference prototype and an initial local vertical slice, not the complete R1 release.

## Working now

- Minimal dark interface with collections/tags navigation, search, gallery, table and bounded relation graph.
- File-picker and desktop drag/drop import. Uploads stream to staging, receive a SHA-256 hash, then enter a content-addressed blob store before the SQLite record is committed. Originals are exported byte-for-byte; duplicate content shares storage while each import gets its own logical item.
- Image, browser-supported video/audio and small text previews. PDF and unknown/active file types can be downloaded. SVG/HTML are downloaded instead of executed inline. The extension is a preview hint, not a guarantee that the codec is playable.
- Markdown note creation and source editing, titles, descriptions, tags, favorite flag, multiple collection memberships, typed relations, search across note text and metadata.
- SQLite catalog and immutable per-item history. Updates require an expected revision. Conflicting updates return HTTP 409; the browser keeps the attempted draft. Restore adds a new revision. Trash is reversible; there is no permanent-delete UI or blob garbage collector.
- Original/Markdown export and a metadata manifest. **The manifest alone is not a full backup.**
- Loopback HTTP API with a private local token, a browser session cookie, Host/Origin checks, byte-range media delivery and bounded requests.
- MCP stdio adapter with actual protocol integration tests. Search/read tools are the default; note creation and revision-checked mutation tools require an explicit environment option.
- Responsive browser interface, including phone-size navigation and note editing. Unsaved drafts prompt before in-app item changes and browser unload.

## Reused components

React supplies the UI; TanStack Table supplies table mechanics; Cytoscape.js supplies the relationship graph; the official MCP TypeScript SDK supplies protocol transport; Zod validates commands; Node's built-in SQLite binding supplies storage. The current note input is a plain source textarea. CodeMirror/rich editing remains a later integration decision. No complete upstream application was forked or copied.

## Not implemented or validated yet

- Windows/macOS installers, desktop background service lifecycle, signing or automatic updates.
- Native Android package, share-sheet integration, URI staging, background uploads, Android offline storage or native media testing. A phone viewport test does not establish these capabilities. The current service intentionally accepts loopback traffic only and cannot be used from a phone over the LAN.
- Cross-device sync, remote hosting, resumable transfer, operation idempotency keys, conflict-resolution UI, encryption/key recovery or peer-to-peer transport.
- Built-in AI model setup, OCR, embeddings, auto-tag proposals, classification, job persistence or AI review/undo. MCP connectivity is not automatic image understanding.
- Chrome capture extension, Eagle importer, external Markdown editing/reconciliation, parsed wiki links/backlinks, full-text SQLite indexes, typed property schemas, formulas or arbitrary database records. Current graph edges are explicit relations; the table is a view of item metadata.
- Full backup/restore UI, multi-library switching, schema upgrades, all format previews or 50,000-item performance acceptance. The prototype returns the catalog to the client, searches in memory, does not virtualize the gallery and reads complete note bodies in its snapshot. It is suited to a small evaluation library, not a large production archive.
- Fine-grained per-agent scopes. Read-only is enforced by the MCP adapter's exposed tool set; its underlying local API token has whole-library access. Opt-in write mode permits all supported metadata/note mutations, including reversible trash. Do not give the token to an untrusted process.
- Durable autosaved drafts. Unsaved note edits remain browser state and can be lost if the browser crashes. Explicit Save writes a transaction; stale saves do not overwrite newer revisions.

Do not treat this as the only copy of important assets. Import copies originals and never alters the selected source files. For a prototype backup, stop the service, copy the **entire** library directory including blobs, database and any SQLite sidecars, then test the copy using a separate library path. Keep the agent token private; a metadata export or copied live database alone is insufficient. Files left in staging/orphan blobs after an abrupt process crash are retained rather than automatically deleted without reference checks.

## Validation completed in this cloud environment

Environment: Linux, Node 24, installed Chromium. `npm run build` performs TypeScript checking and a production frontend build. `npm test` tests persistence across close/reopen, revision conflicts/history restoration, collection/relation integrity, failed-edit rollback, original hashes, blob deduplication, HTTP ranges, unsafe preview types, oversized/aborted uploads, request boundaries, and a real MCP SDK client over stdio. Browser tests exercise the main desktop workflow and a 390 × 844 phone viewport. This is not a power-failure, Windows/macOS, or physical Android certification.

The package audit identified an older Zod version; it was upgraded before the final validation. Dependency versions are recorded in `package-lock.json`. CI repeats the build, integration and browser checks; a workflow file does not establish that GitHub CI has run until its result is observed.

## Next implementation gates

1. Finish M0 foundation comparison: pinned TagSpaces/SiYuan builds, free-core boundaries, target-device runs and measured adaptation effort. Compare against this prototype's concrete data/API/UI fixture.
2. Choose the production engine and shell, and document migration from the prototype format if it changes. The detailed Rust/Tauri proposal remains an option.
3. Implement external Markdown reconciliation, scalable catalog queries, durable idempotent commands and crash recovery before promising production library storage.
4. Validate native Android capture early, alongside Windows/macOS media and file handling.
5. Add a built-in local AI provider with persistent proposal jobs and scoped agent writes; then build sync on the validated revision/operation contract.
