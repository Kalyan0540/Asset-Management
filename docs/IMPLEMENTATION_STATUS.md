# Implementation status — Atlas 0.6 desktop and Android preview

18 November 2026. This is an early personal desktop release. The complete R1 plan is **not finished**. The implementation now has native desktop packaging; it is no longer only a browser prototype.

## Chrome Capture preview

- The Chrome extension saves page links, selected text, chosen images and screenshots into the open desktop library. The [Chrome capture guide](CHROME_CAPTURE.md) covers pairing, preferences, the current batch and screenshot limits, and handling a blocked image.
- The [mobile capture plan](MOBILE_CAPTURE_PLAN.md) prioritizes the Android Sharesheet and Photo Picker. A durable offline capture queue and Chrome Web Store distribution are later work.

## Workspace improvements in 0.7

- Note and inspector edits autosave. Recoverable desktop drafts stay in the active library's staging area. Simultaneous edits to the same field require a choice before replacing a saved version.
- Parent folders display subfolders first. Enable **Show subfolder contents** to include descendant items. Grid and List are the main gallery layouts. Search includes file-type checkboxes and accepts normalized color values.
- The center image view keeps the side panels in place. The gallery supports directional focus, range and drag selection, context actions, and thumbnail size steps. Video posters are cached for formats the bundled browser can decode. The note magnifier shows rendered excerpts.
- The graph supports full and local views, search, and connection highlighting. The [workspace research](WORKSPACE_RESEARCH.md) records the references and the next editor and organization improvements.

## New in 0.6

- Merge two Atlas libraries into a verified new copy. The second library's nested folders sit under a named branch. Originals, item revisions, relations, Markdown links and embeds, Trash, tag groups and smart folder definitions are carried forward. Distinct entries share original bytes when their hashes match. The merge copies catalog data from both libraries and carries the current library's auxiliary data. Source-specific import reports and pending AI jobs remain in the source.
- Review and apply a library-wide tag rename or merge from All Tags. Item revisions, tag groups, unambiguous exact tag rules and automatic tag actions follow the change. Substring rules keep their original expressions. Edit, merge or delete tag groups. To undo an item's tag change, restore its earlier revision. A single command to undo the entire operation is still pending.
- Open Google Lens or TinEye from image actions and use a temporary local image copy. The user uploads the file on the provider's website. AVIF search copies are rendered as PNG on the device.

## New in 0.5

- Compact desktop gallery and inspector with System, Light and Dark appearance, panel toggles, captions below thumbnails, and temporary image/video peeks. The persistent image preview has zoom and grayscale.
- Real folder parent relationships, a descendant-aware gallery and counts, and previewable repair for earlier flattened Eagle imports. Branch repair keeps existing IDs and memberships.
- In-app library switcher, clipboard image import, searchable item actions, recent searches, selection summary, selected-file export and Trash Undo. Original-file export and library backups remain separate.
- Smart Folders hold all/any conditions. Optional actions apply on future file imports. The All Tags workspace supports groups. The generic local MCP connection continues to work through the Agents menu.

## New in 0.4

- Quick Preview button on gallery cards, Grid/Justified/Waterfall arrangements, compact navigation, inline folder naming, and an image inspector with dimensions and copyable color swatches.
- Center Markdown workspace with slash commands, rendered reading mode, image embeds, links to saved items and links shown in the relations graph. The editor saves Markdown source with the existing revision checks.
- Local Codex MCP setup copied from the Agents menu. Adds note text search and bounded image reads. Hosted ChatGPT access remains pending.

## New in 0.3

- Desktop Eagle import copies into a separate Atlas library, verifies originals, maps folders/tags/annotations/dates, preserves raw source metadata, reports skips and supports cancellation. Compatibility evidence is documented in EAGLE_IMPORT.md; the supplied import report informed legacy folder repair, while verification uses synthetic libraries.
- Native Android source implements offline files, notes, tags, collections, favorites, Trash, search, previews through native decoders/external viewers, and share/file-picker imports. It uses the same schema-1 catalog and hash-addressed originals as desktop.
- Manual desktop/Android backup transfer verifies originals before switching libraries. It is not synchronization. Android compile/lint/emulator and cross-platform backup checks gate APK publication. Published release runs, not these source descriptions, establish build success.

## Available functionality

- Compact light and dark workspace, with left collections/tags navigation, a denser asset grid, a right details panel, adjustable thumbnails, sorting, search, table view and a bounded relation graph.
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

Local checks cover formatting, the TypeScript and production build, and integration tests for persistence, conflicts, import/export, backup/restore, bulk transactions, merge integrity, AI review and real MCP stdio clients. Browser tests cover the desktop and mobile-size workflows, tag change review, and the reverse-image chooser. Linux Electron runtime testing opens the UI and exercises database access. Platform release jobs also test the packaged application on macOS and Windows.

AI tests use a deterministic local HTTP model fixture. They establish protocol, review and integrity behavior; they do not establish real-model caption accuracy or hardware performance. An installed Ollama vision model is needed to analyze actual pictures. No hosted inference is enabled by default.

## Pending work

| Area | Remaining work |
|---|---|
| Android | Durable share-sheet/background recovery, graph/table/AI/MCP parity, history-restore UI, production signing and physical-device testing; initial native offline app and manual transfer implemented |
| Multi-device | Sync transport, paired devices, resumable verified media transfer, operation IDs, conflict queue, old-device rebase and remote backups |
| Browser capture | Chrome extension, website image/text/bookmark capture, screenshots, durable native bridge |
| Migration | Real-world Eagle fixture validation, additional layouts/.eaglepack support and incremental merge; richer Obsidian import; import Markdown assets as editable notes |
| Knowledge tools | External Markdown reconciliation, autosaved drafts, rendered editing, wiki-link resolution/backlinks, embeds, custom property schemas, independent records, formulas and rollups |
| AI | Provider credentials, hosted adapters, model installation, persisted work queue/resume, OCR, embeddings, visual similarity, controlled-vocabulary rules and evaluation sets |
| Organization/media | Folder moves and merging within a library, whole-operation tag undo, cross-library search, richer filter operators, EXIF, generated video posters, thumbnails/proxies, and specialist formats |
| Scale | Indexed/paginated queries, virtualized grid, 50,000-item and multi-GB media benchmarking |
| Security/release | Per-agent scopes, key recovery, tested migrations, updater, verified publisher signing, Apple notarization and long-term acceptance testing |

This release still returns catalog data to the client and searches in memory. Start with a small evaluation library. Unsaved drafts are browser memory; explicitly Save before closing. A metadata manifest alone is not a complete backup. Use the native Library backup menu and keep the whole resulting folder.

The complete 115-item backlog remains in [FEATURE_BACKLOG.csv](FEATURE_BACKLOG.csv). Entries marked partial are not production-complete acceptance claims. The desktop packaging decision is documented in [ADR 002](ADR-002-DESKTOP-DELIVERY.md).
