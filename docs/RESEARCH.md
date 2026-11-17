# Research: Eagle and a unified personal library

Research date: 17 November 2026. This document separates documented behavior from proposed product requirements. It is a capability baseline, not a claim that every Eagle plugin or format has been tested.

## 1. Evidence and limits

- **Documented:** supported by readable official product, API, or platform documentation.
- **Historical:** official article describes an earlier release; useful for workflow context, not sufficient to establish every current detail.
- **Roadmap:** announced development, not a shipping commitment.
- **Verify:** requires installed-app testing, a real library, or representative file fixtures.
- **Proposed:** our design decision; not a claim about Eagle.

The main Eagle website currently lists Eagle 4.0.0 Build23. Public descriptions and API documentation were inspected. Eagle was not installed, no user library was supplied, and no live desktop workflow was exercised. Several support articles exposed their title and navigation but not their body to the research tool. Their titles identify follow-up questions; they are not used as proof of detailed behavior.

Visual browser inspection was attempted but blocked by the browser URL access policy. UI descriptions below therefore come from readable official interface articles and release documentation, not freshly captured screenshots. Pixel measurements, menu ordering, hover behavior, and the exact current interaction sequence remain unverified.

## 2. Findings that affect the product

### Eagle's core is an asset library

Eagle's public product page presents collection, organization, search, previews, and external cloud synchronization. Tags, folders, ratings, annotations, duplicate finding, media browsing, and browser collection form the core reference set. Its Windows/macOS desktop downloads establish the baseline platforms. Our notes, graph, structured records, and Android requirements are additions, rather than features assumed to exist in that desktop baseline. [E01]

### The interface is useful without reproducing the visual effects

An older official interface discussion describes navigation on the left, an asset list and filters in the center, and an inspector on the right. It lists justified, waterfall, grid, and list layouts and describes multi-folder membership. Eagle 4's release article describes transparency and frosted-glass styling. Retaining the three functional regions while using opaque surfaces is a reasonable simplification. This does not eliminate the harder work of large-list rendering, selection, keyboard behavior, and media decoding. [E02, E03]

### Rule-based auto-tagging and AI are different systems

Folder-based automatic tagging is distinct from asking a model to analyze image contents. Eagle's AI Action article describes configurable renaming, descriptions, existing-folder classification, and tags. AI Search's launch article describes local visual similarity and semantic matching over existing text metadata; it explicitly distinguishes that text search from direct image understanding. Our search should label lexical, metadata-semantic, and image-semantic modes separately. [E01, E05, E06]

### Some advertised AI functionality is implemented through plugins

Eagle documents four plugin types: window tools, background services, format extensions, and inspector extensions. The AI SDK is a dependency plugin with shared provider configuration; AI Search requires its own plugin. MCP/Skill setup also uses an MCP plugin. In our product these become built-in services and settings. Downloadable model weights or bundled media libraries need not imply a user-facing plugin marketplace. [E04, E07, E08, E09]

### Browser capture is a separate deliverable

Eagle's extension page describes context-menu and drag collection, batch filtering, region/element/full-page capture, higher-resolution discovery, and choosing tags/folders at capture time. It offers Chrome, Edge, Safari, and Firefox extensions and says the desktop application is required. Our first extension target is Chrome desktop. Android capture uses the operating system share sheet rather than depending on a desktop extension being available on mobile. [E10, P01]

### File support has multiple levels

Eagle's release article distinguishes a video-thumbnail extension from actual playback and describes additional format extensions. This is a useful constraint: storing a file, extracting metadata, making a thumbnail, rendering a full preview, and editing the original are separate promises. Our feature matrix must identify the level and platform for each format. [E03]

### APIs make migration and automation plausible, not automatic

The item API exposes IDs, tags, folder references, metadata paths, modification times, file replacement, and image/video annotations. Folder and tag APIs expose organization operations; smart-folder support includes structured conditions. Eagle recommends API-based modifications instead of changing its library internals. Web API V2 is documented for Eagle 4.0 Build21+ and requires Eagle to be running. These interfaces can support extraction and migration, subject to a field-by-field fidelity test. [E11–E16]

### A whole library is not a version-control protocol

Eagle documents whole-library copying and `.eaglepack` transfers. Those are useful migration/export paths, not a specification for merging concurrent changes. Its August 2026 V5 article discusses separating the library engine from the UI and improving hosted/multi-user access. It explicitly does not announce a release date. An alpha-site document inspected in the earlier research contains placeholder content. This plan does not depend on V5 being available. [E17–E19]

### Notes and tables should share the asset model

Obsidian's documentation demonstrates local Markdown files, internal links, backlinks/graph concepts, typed properties, and database-like views over files. The useful architectural lesson is that a table can be another view over durable items instead of a second silo. Our design extends this to assets and independent records, with stable identities and typed relations. It does not promise complete Obsidian plugin or `.base` compatibility. [O01–O05]

### Android and agent support affect the foundation

Android documents receiving shared data through intents, user-selected document access, and offline data with durable background work. Chrome extension workers can terminate and need persisted state. MCP supplies tool schemas and local/HTTP transports. These are reasons to use a durable library command layer and queues, rather than letting UI components, model responses, and background tasks write independently. [P01–P06, A01–A02]

## 3. Eagle interface inventory and proposed mapping

| Eagle reference pattern | Evidence status | Our interpretation |
|---|---|---|
| Left navigation and folder list | Historical official description; also listed in current support index | Library selector; Inbox; All items; Notes; Collections; saved views; tags; trash |
| Center asset list and filter area | Historical description and current feature pages | One collection surface with gallery, list, table, and graph modes |
| Right inspector | Documented interface pattern and item API fields | Details, properties, relations, source, and history tabs |
| Grid / justified / waterfall / list | Official interface description | Grid/list initially; justified and waterfall in broad-parity release |
| Spacebar and hover media preview | Current product page | Spacebar desktop preview; explicit tap/play on Android |
| Tag selection and manager | Build6 article and tag APIs | Searchable tag picker, recent/starred tags, groups, merge preview |
| Batch selection and operations | Official interface article | Selection toolbar with additive/removal semantics and mixed-value states |
| Searchable context actions | Eagle 4 release article | Shared action registry powering command palette, menus, and keyboard shortcuts |
| AI workflow configuration | AI Action article | Built-in Automations screen and reviewable result queue |
| AI provider configuration | AI SDK documentation | Built-in Models settings; provider capability checks |
| Plugin center | Eagle 4 and Plugin API | No marketplace initially; built-in feature/settings pages instead |
| Transparency and frosted glass | Eagle 4 release article | Opaque dark panels, borders, restrained accent, no decorative glow |

This table is not a screenshot audit. Validate the exact desktop patterns in milestone M0 before implementing interaction details.

## 4. Plugin capability map

This is a representative taxonomy from Eagle's official documentation and launch articles, not an exhaustive list of independently maintained community plugins.

| Capability seen in Eagle's ecosystem | Our implementation decision |
|---|---|
| MCP and agent workflows | Built-in MCP server and CLI/API adapter in the first release |
| AI model settings | Built-in provider registry and secret storage |
| AI tagging, naming, descriptions, classification | Built-in job system, taxonomy rules, review and undo |
| Semantic/visual retrieval | Built-in indexing workers; separate capability flags |
| EXIF inspector / histogram | Native inspector features; EXIF first, histogram later |
| Format conversion / compression | Built-in derivative jobs; keep originals |
| Background removal / upscaling / erasing | Later native image tools; not prerequisites for organization |
| Video thumbnails | Built-in decoder workers; separate from playback claims |
| EPUB / EPS / HEIC / SWF preview extensions | Evaluate individually; broader formats later; SWF deferred |
| Pinterest/external visual lookup | Later provider integration; local search is independent |
| Third-party window/background/inspector plugins | Marketplace and arbitrary code execution deferred |

“Native” in the plan means part of the shipped product and its supported workflows. It does not require every screen to use an operating-system-native widget toolkit.

## 5. Source register

All links below were consulted during this research or the immediately preceding Eagle investigation. Source descriptions are deliberately short. Access dates are 17 November 2026; dated release articles retain their historical context.

### Eagle

- **E01 — [Eagle product page](https://www.eagle.cool/):** current public feature surface and listed desktop build. Product claims are not our benchmarks.
- **E02 — [Eagle interface and organization discussion](https://www.eagle.cool/blog/post/adobe-bridge-alternative):** 2022 article; sidebar, inspector, layouts, multiple folders, batch actions. Historical interaction reference.
- **E03 — [Eagle 4 release article](https://www.eagle.cool/blog/post/eagle4):** 2024 release; styling, context actions, duplicate detection, plugin examples, format distinctions. Not an exhaustive current format list.
- **E04 — [Plugin types](https://developer.eagle.cool/plugin-api/get-started/plugin-types):** window, service, preview, inspector categories.
- **E05 — [AI Action launch](https://www.eagle.cool/blog/post/eagle-plugin-ai-action):** 30 March 2026; configurable image organization operations.
- **E06 — [AI Search launch](https://www.eagle.cool/blog/post/eagle-plugin-ai-search):** 17 March 2026; offline similarity and text-metadata semantic search.
- **E07 — [AI SDK](https://developer.eagle.cool/plugin-api/extra-module/ai-sdk):** model configuration, local/commercial providers, structured generation; requires Build20+.
- **E08 — [AI Search API](https://developer.eagle.cool/plugin-api/extra-module/ai-search):** plugin dependency and search/service status APIs.
- **E09 — [Eagle MCP and Skill](https://www.eagle.cool/blog/post/eagle-plugin-mcp-skill):** 1 March 2026; external agents, batch library operations, MCP plugin installation.
- **E10 — [Browser extensions](https://www.eagle.cool/extensions):** capture modes, categorization, supported browsers, desktop dependency.
- **E11 — [Item API](https://developer.eagle.cool/plugin-api/api/item):** metadata, file paths, replacement, IDs, and annotations; safe modification guidance.
- **E12 — [Folder API](https://developer.eagle.cool/plugin-api/api/folder):** hierarchy and folder operations.
- **E13 — [Tag API](https://developer.eagle.cool/plugin-api/api/tag):** recent/starred tags and merge operations.
- **E14 — [Tag-group API](https://developer.eagle.cool/plugin-api/api/tag-group):** group metadata and membership.
- **E15 — [Smart-folder API](https://developer.eagle.cool/plugin-api/api/smart-folder):** saved structured conditions; Build22+ requirement.
- **E16 — [Web API V2](https://developer.eagle.cool/web-api):** external automation, local server, remote token access, Build21+ requirement.
- **E17 — [Importing and exporting](https://en.eagle.cool/blog/post/how-to-import-export-in-eagle):** whole libraries, `.eaglepack`, normal exports, monitored imports.
- **E18 — [V5 development update](https://www.eagle.cool/blog/post/eagle-v5-development-update):** 11 August 2026; architectural roadmap, not release confirmation.
- **E19 — [V5 preview documentation](https://alpha-v5.eagle.cool/en/docs/where-is-data/):** placeholder wording; excluded as shipping evidence.
- **E20 — [Tag-panel update](https://en.eagle.cool/blog/post/eagle4-build6):** 13 November 2024; list/grid tag selector and starred tags.
- **E21 — [Support article index](https://www.eagle.cool/support/all-articles):** discovery aid for additional edge cases; title-only entries require verification.

### Notes and structured information

- **O01 — [Obsidian data storage](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata):** Markdown vaults and external file changes.
- **O02 — [Obsidian links](https://obsidian.md/help/links):** wiki/Markdown links, rename behavior, attachments, heading links.
- **O03 — [Obsidian graph](https://obsidian.md/help/plugins/graph):** local/global graphs and filtering.
- **O04 — [Obsidian properties](https://obsidian.md/help/properties):** typed properties and YAML frontmatter.
- **O05 — [Obsidian Bases](https://obsidian.md/help/bases):** database-like file views and saved view definitions.

### Platforms and implementation constraints

- **P01 — [Android receiving shared data](https://developer.android.com/develop/ui/compose/sharing/receive):** share-intent entry points and MIME types.
- **P02 — [Android offline-first architecture](https://developer.android.com/topic/architecture/data-layer/offline-first):** local reads, queues, and background synchronization.
- **P03 — [Android document access](https://developer.android.com/training/data-storage/shared/documents-files):** user-selected URI-based access through the Storage Access Framework.
- **P04 — [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging):** extension/desktop bridge and allowed origins.
- **P05 — [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle):** worker shutdown and durable state requirements.
- **P06 — [Tauri mobile development](https://v2.tauri.app/develop/plugins/develop-mobile/):** Kotlin/native bridges; feasibility evidence, not proof all desired mobile APIs work out of the box.
- **P07 — [SQLite FTS5](https://www.sqlite.org/fts5.html):** embedded full-text indexing and query capabilities.
- **P08 — [GitHub large-file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github):** reason to separate media storage from optional Git exports.

### Agents and local AI

- **A01 — [MCP transport overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports):** stdio and Streamable HTTP; protocol compatibility must be tested with actual clients.
- **A02 — [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools):** schema-described tools and interaction considerations.
- **A03 — [Ollama vision](https://docs.ollama.com/capabilities/vision):** image inputs for compatible local models.
- **A04 — [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs):** JSON-schema-constrained output, with documented cloud limitations. Valid structure does not establish factual accuracy.

## 6. Required follow-up experiments

1. Installed Eagle walkthrough: import, tagging, multi-selection, preview, search, export, and keyboard behavior on Windows/macOS.
2. Real sample `.library`: map folders, smart rules, tag groups, annotations, custom covers, deleted items, bookmarks, and unsupported fields. Compare API extraction with a copied on-disk library.
3. Mixed-format fixture set: test actual codecs and previews on all target platforms. Extensions alone cannot establish decoder compatibility.
4. Android share-intent and offline upload experiment: process death, revoked URI permissions, large video, interrupted upload.
5. Notes portability: import/export Markdown with frontmatter, duplicate titles, Unicode filenames, wiki links, and attachments; external edit conflict round trip.
6. AI evaluation: user-approved sample assets and taxonomy; measure corrections, latency, privacy routing, and model capability failures.
7. Sync simulator: two offline devices plus an agent; conflicting notes, tags, moves, delete/edit races, retries, and old-client compatibility.

8. Open-source foundation evaluation: build/license screen and compare candidate forks with the same asset, note, Android, sync and agent fixtures. See [Open-source options](OPEN_SOURCE_OPTIONS.md).

These are milestone M0/M1 validation tasks, not hidden assumptions that research has already resolved.

## 7. Open-source follow-up

The [open-source study](OPEN_SOURCE_OPTIONS.md), added on 17 November 2026, reviews nine application/protocol candidates and reusable implementation libraries. It records primary repository/license links, current release observations, gaps and a fork-versus-composition decision process. This supplements the Eagle feature baseline; it does not claim compatibility or tested integration. The [workspace guide](WORKSPACE_GUIDE.md) explains how these documents are stored and delivered.
