# Implementation status — Atlas 0.2 desktop release

17 November 2026. This is an early personal desktop release. The complete R1 plan is **not finished**. The implementation now has native desktop packaging; it is no longer only a browser prototype.

## Available functionality

- Minimal dark workspace, with left collections/tags navigation, a denser asset grid, a right details panel, adjustable thumbnails, sorting, search, table view and a bounded relation graph.
- File import preserving originals, shared blob storage for identical bytes, image/video/audio/text previews, original export and Markdown note creation/source editing.
- Tags, multiple collection memberships, favorites, explicit typed relations, reversible trash and revision history.
- Atomic bulk tagging/collection/favorite/trash edits. If any selected revision is stale, the whole batch rolls back.
- Larger preview with double-click/Space and arrow navigation. PDF preview uses the bundled browser's support; uncommon codecs still depend on the runtime.
- Desktop app window, icon and native menus. New/open library controls and data stored separately from the installed app.
- Consistent database backup plus original files, hash verification, and restore into a new library. Existing libraries and source files remain untouched.
- Built-in local Ollama connection, model discovery, tag/description suggestions for notes and PNG/JPEG/WebP, durable proposal records, review-before-apply, cancel, stale-result rejection, and atomic application with item history. Hosted providers, model installation and automatic background categorization are not included.
- Local HTTP and MCP access. MCP defaults to search/read; write tools are opt-in. The underlying credential is still whole-library access, not per-folder agent authorization.
- macOS Apple-chip/Intel DMG and ZIP builds plus Windows x64 installer automation. Each platform runs a native app smoke test and a packaged-app test before its artifact is uploaded. Publishing runs only after all package jobs succeed.

See [Getting Started](GETTING_STARTED.md) for nontechnical installation instructions. A workflow configuration does not itself prove a build succeeded; the GitHub run and published release are the evidence for each version.

## Testing

Local checks cover formatting, TypeScript/production build, nine integration tests across persistence, conflicts, import/export, backup/restore, bulk transactions, AI review and real MCP stdio clients. Browser tests include the original desktop/mobile-size workflows plus bulk edits and the larger preview. Linux Electron runtime testing opens the UI and exercises database access. Platform release jobs repeat the checks and additionally test the packaged application on macOS/Windows, including native backup/restore and a real MCP client launched through the bundled runtime.

AI tests use a deterministic local HTTP model fixture. They establish protocol, review and integrity behavior; they do not establish real-model caption accuracy or hardware performance. An installed Ollama vision model is needed to analyze actual pictures. No hosted inference is enabled by default.

## Pending work

| Area | Remaining work |
|---|---|
| Android | Native installable app, durable share-sheet capture, local storage, offline pinning, background jobs and physical-device testing |
| Multi-device | Sync transport, paired devices, resumable verified media transfer, operation IDs, conflict queue, old-device rebase and remote backups |
| Browser capture | Chrome extension, website image/text/bookmark capture, screenshots, durable native bridge |
| Migration | Eagle library import with fidelity report; richer Obsidian import; import Markdown assets as editable notes |
| Knowledge tools | External Markdown reconciliation, autosaved drafts, rendered editing, wiki-link resolution/backlinks, embeds, custom property schemas, independent records, formulas and rollups |
| AI | Provider credentials, hosted adapters, model installation, persisted work queue/resume, OCR, embeddings, visual similarity, controlled-vocabulary rules and evaluation sets |
| Organization/media | Nested/smart collections, tag groups and merging, more filters, EXIF/palettes, thumbnails/proxies, specialized design/3D/font formats |
| Scale | Indexed/paginated queries, virtualized grid, 50,000-item and multi-GB media benchmarking |
| Security/release | Per-agent scopes, key recovery, tested migrations, updater, verified publisher signing, Apple notarization and long-term acceptance testing |

This release still returns catalog data to the client and searches in memory. Start with a small evaluation library. Unsaved drafts are browser memory; explicitly Save before closing. A metadata manifest alone is not a complete backup. Use the native Library backup menu and keep the whole resulting folder.

The complete 115-item backlog remains in [FEATURE_BACKLOG.csv](FEATURE_BACKLOG.csv). Entries marked partial are not production-complete acceptance claims. The desktop packaging decision is documented in [ADR 002](ADR-002-DESKTOP-DELIVERY.md).
