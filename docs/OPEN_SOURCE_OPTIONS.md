# Open-source foundations and reuse decision

Research date: 17 November 2026. Status: repository/documentation review; no candidate has been installed, built, benchmarked, or modified for this project.

## 1. Recommendation

Yes: existing projects can remove substantial implementation work. There are two credible routes: extend an existing application, or build our product around existing editors, media engines, tables, graph renderers, and AI runtimes. Neither route removes the need to validate data integrity, Android capture, cross-device conflicts, and asset portability.

**Before selecting the application architecture, compare TagSpaces and SiYuan with a small component-based prototype.** TagSpaces is the leading asset-first candidate; SiYuan is the leading knowledge-first candidate. Keep AppFlowy as a second-round candidate if the first two fail the mobile/editor gates. This is a recommendation for an evaluation, not a claim that either already meets the complete specification.

The proposed Rust/Tauri stack in the project plan is the component-based option, not a settled decision. A successful fork should retain its existing engine and platform stack where practical. Rewriting a chosen base into our preferred framework would discard much of the benefit of choosing it.

Use a fork only when measured adaptation and ongoing maintenance are cheaper than composition. Do not merge several complete apps into one: their databases, identities, sync protocols, editors, and release processes would create multiple sources of truth. Study other projects and reuse compatible components behind one product model.

## 2. Application shortlist

“Available” below means described by upstream documentation or source layout. It does not mean verified on our devices. “Missing/unproven” means additional implementation or verification is required; it is not an exhaustive claim that upstream has no such feature.

| Candidate | Existing work relevant to us | Missing or unproven for our requirements | License / decision |
|---|---|---|---|
| [TagSpaces](https://github.com/tagspaces/tagspaces) | File/folder organization, tags, media viewing, TXT/Markdown/HTML notes, desktop applications, Chrome/Edge/Firefox clipping; source includes Capacitor mobile builds | Unified typed relationships/tables/graph, robust item identity across renames, conflict-aware personal sync, built-in scoped MCP and AI review workflow; Android lifecycle behavior must be tested | AGPL-3.0 core; proprietary Pro boundary. **First asset-first evaluation** |
| [SiYuan](https://github.com/siyuan-note/siyuan) | Block references/backlinks, note editor, table databases, attachments, OCR, AI writing, API/CLI, web clipping, desktop and Android ecosystem | Eagle-like asset gallery and bulk management, large media pipeline, our AI proposal/undo contract, externally editable Markdown reconciliation | AGPL-3.0 main repository; separate projects and paid services require review. **First knowledge-first evaluation** |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Documents, database views, AI workspace, Windows/macOS and Android distribution, Flutter/Rust foundation | General-purpose asset catalog and previews, native file capture workflow, graph behavior, Markdown fidelity, agent permissions, independent sync/export requirements | AGPL-3.0 application. **Second-round mobile/structured-data candidate** |
| [TagStudio](https://github.com/TagStudioDev/TagStudio) | Directory-based library, SQLite catalog, rich tag hierarchy/aliases, search, fields, previews of many media types | Separate reusable core/API is still described as planned; Android, notes/tables, synchronization and our built-in AI work need substantial development | GPL-3.0-only. **Strong asset behavior reference; weaker complete cross-platform base** |
| [Spacedrive](https://github.com/spacedriveapp/spacedrive) | Rust/TypeScript storage infrastructure; current direction includes portable indexes, unified operations, CLI/SDK/MCP and device access | Release maturity and required Windows/Android behavior; notes and structured knowledge features | Current main Apache-2.0; older releases differ. **Watch/evaluate selectively; do not make it the initial dependency** |
| [Immich](https://github.com/immich-app/immich) | Photo/video ingestion, mobile backup, thumbnails, deduplication, visual search, face clustering, albums and sharing | General files, source-editable notes, relational tables, mixed-item graph and independent desktop workflow | AGPL-3.0. **Media workflow reference or optional separate integration** |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | Local-first documents, databases, linked pages, canvas, sync and AI-oriented workspace | Asset-management depth, our mobile capture contract; exact reusable backend/native boundary needs resolution | Mixed MIT/MPL-2.0/EE terms by directory and edition. **Selective component evaluation, not an assumed all-MIT fork** |
| [Anytype desktop](https://github.com/anyproto/anytype-ts) | Local-first objects, relations, block editing, encrypted sync and agent-oriented interfaces | Asset management additions, independent distribution/network terms, exact Android code boundary | ASAL-1.0 source-available, with use/network restrictions. **Product reference; not our default open-source application base** |
| [any-sync](https://github.com/anyproto/any-sync) | Separate Go protocol for encrypted peer-to-peer synchronization; related node/file-node infrastructure | Schema mapping, mobile integration, identity/key recovery, operational complexity, media retention and conflict UX | MIT protocol repository. **Optional sync experiment, not a drop-in library sync solution** |

### TagSpaces: closest starting point for assets plus files

Its React/Electron architecture is compatible with a minimal dark interface, and the existing file viewers and clipper are useful starting points. Tags can live in filenames or sidecar metadata. The README documents Android/iOS Capacitor build commands, which is encouraging but does not establish durable background transfers or process-death recovery. It also warns about locations exceeding 100,000 files. [Repository](https://github.com/tagspaces/tagspaces/blob/develop/README.md).

The fork experiment must show that a free-core-only build works and can support stable item IDs and a revisioned command boundary without duplicating metadata. The [licensing document](https://github.com/tagspaces/tagspaces/blob/develop/LICENSING.md) explicitly separates the AGPL core from proprietary Pro modules. Do not count Pro features as reusable merely because upstream screenshots display them.

### SiYuan: strongest starting point for notes and agent workflows

It already covers many knowledge-management requirements, but ordinary documents are stored as JSON `.sy` files; Markdown is an import/export format. Our external Markdown editing requirement therefore needs an adapter or a consciously revised storage design. The README warns against third-party sync disks and distinguishes its browser-only Docker hosting from desktop/mobile synchronization. A self-hosted Docker instance must not be assumed to synchronize native clients. [README and architecture](https://github.com/siyuan-note/siyuan/blob/master/README.md).

The experiment should add a first-class asset item, connect it to a note and table row, then expose one revision-checked operation through the API. Verify paid-service boundaries and licenses of the Android shell and related repositories before claiming a complete independently distributable fork.

### AppFlowy: credible if mobile and tables dominate

The project ships desktop applications and an Android app, and identifies Flutter/Rust as its foundation. That can save platform/editor work. Its README currently lists Android 10 or later and excludes ARMv7. [Platform and source instructions](https://github.com/AppFlowy-IO/AppFlowy/blob/main/README.md).

A fork would stay with Flutter rather than transplanting its screens into React. The main uncertainty is the cost of turning a document/database workspace into a high-volume mixed-media catalog. Audit the cloud and AI service repositories separately; the application license does not establish the terms or offline behavior of every service it can connect to.

### Why the other candidates are not first choices

TagStudio's tag model is valuable, but its README still describes a standalone core/API as future work and discusses an eventual MIT-licensed module. **A future licensing plan does not license today's GPL application code under MIT.** Its Python application would require significant additional mobile infrastructure. [README](https://github.com/TagStudioDev/TagStudio/blob/main/README.md).

Spacedrive's current direction matches our shared UI/agent command layer unusually well. However, its README still describes the planned 2.0 beta and unsigned nightlies; the latest non-prerelease endpoint returned 0.4.3 from March 2025 during this review. The date of a planned beta is not proof that it shipped. Current main is Apache-2.0, while pre-24-March-2026 releases remain AGPL. Pin the exact revision before comparing or reusing code. [README](https://github.com/spacedriveapp/spacedrive/blob/main/README.md), [releases](https://github.com/spacedriveapp/spacedrive/releases).

Immich offers impressive media functionality, but using it as our complete base would leave the knowledge-management half largely to build. Keeping it as an optional separate integration also means keeping a separate catalog; that does not satisfy the unified-library requirement by itself. [Feature matrix](https://github.com/immich-app/immich/blob/main/README.md).

AFFiNE's README uses a broad MIT description, but the [root license](https://github.com/toeverything/AFFiNE/blob/canary/LICENSE) routes backend and native directories to a [separate license](https://github.com/toeverything/AFFiNE/blob/canary/packages/backend/server/LICENSE) with EE terms and a CE/client-side MPL-2.0 exception. Evaluate the actual files and edition boundary rather than treating the whole tree as permissive.

Anytype's [ASAL license](https://github.com/anyproto/anytype-ts/blob/develop/LICENSE.md) restricts commercial use to allowed networks. Its separate [any-sync repository](https://github.com/anyproto/any-sync) is MIT. These are different licensing decisions. The latter still involves multiple infrastructure services and does not remove our responsibility for conflict semantics or key recovery.

## 3. Reusable building blocks

These are alternatives to implementing low-level functionality ourselves, not a list of dependencies already selected. Web UI components suit the composition route and web-based forks; a Flutter fork should first reuse its existing equivalents. Verify exact package versions, transitive licenses, vulnerabilities and platform builds before adoption.

| Area | Candidate and source | License evidence / work saved | Work still ours |
|---|---|---|---|
| Markdown editing | [CodeMirror](https://github.com/codemirror/dev), [view license](https://github.com/codemirror/view/blob/main/LICENSE) | MIT editor packages; editing, selection, incremental document handling | Wiki links, embeds, frontmatter contract, external edit reconciliation and mobile IME testing |
| Rich-text editing | [Tiptap](https://github.com/ueberdosis/tiptap) / [ProseMirror](https://github.com/ProseMirror/prosemirror) | MIT core editor foundations | Markdown round trips and custom asset nodes; Tiptap Pro extensions have separate subscription terms |
| Tables and virtualization | [TanStack Table](https://github.com/TanStack/table), [TanStack Virtual](https://github.com/TanStack/virtual) | MIT; table mechanics and rendering large lists | Durable schemas, typed properties, relations, accessible editing and query planning |
| Relationship graph | [Cytoscape.js](https://js.cytoscape.org/) | MIT graph rendering, layouts and touch interaction | Relation semantics, bounded queries, keyboard/list alternative and phone performance |
| Collaborative text internals | [Yjs](https://github.com/yjs/yjs), [license](https://github.com/yjs/yjs/blob/main/LICENSE) | MIT; CRDT data structures | Authentication, durable storage, blob transfer, schema migration, retention and external Markdown conflicts; optional for R1 |
| PDF viewing | [PDF.js](https://github.com/mozilla/pdf.js) | Apache-2.0; PDF rendering/extraction | Annotation anchors, original preservation, resource limits and mobile integration |
| Audio/video probing and derivatives | [FFmpeg](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) | Primarily LGPL-2.1+; configured features can change licensing | Bounded job execution, codec packaging, platform playback, thumbnails and retry policy; avoid unredistributable nonfree builds |
| OCR | [Tesseract](https://github.com/tesseract-ocr/tesseract) | Apache-2.0 OCR engine | Language/model packaging, layout quality, jobs and searchable provenance |
| Transcription | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | MIT inference implementation | Model-weight terms, hardware budgets, timestamps and job orchestration; later scope where specified |
| Local AI runtime | [Ollama](https://github.com/ollama/ollama) | MIT runtime; model serving rather than a custom inference engine | Vision-model selection, separate weight licenses, prompts, evaluation, permission/routing policy, proposals and undo |
| Agent protocol | [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE) | Current license describes transition from MIT to Apache-2.0 for code, with mixed historical contributions | Tool schemas, scope enforcement, expected revisions, audit and client compatibility; pin and retain applicable notices |

The CodeMirror and ProseMirror GitHub meta-repositories are archived and point to their new upstream host at `code.haverbeke.berlin`. This is a hosting migration, not evidence by itself that their npm editor packages are abandoned. Follow the current upstream for maintenance checks.

Prefer the simplest integration that meets a measured need. A graph renderer does not supply a knowledge database; a table component does not supply Notion-style relational storage; a CRDT does not synchronize a multi-GB video safely. These are the boundaries where most project-specific engineering remains.

## 4. Fork versus composition evaluation

### Timebox and candidates

Allocate the first five engineer-days of M0 to source/build/license screening and narrow to **at most two executable routes**. Default routes: TagSpaces fork and SiYuan fork; keep the existing composition design as the cost/requirements baseline. If both forks fail early gates, replace the weaker route with a minimal component prototype. AppFlowy is a substitute when Android/editor constraints justify it, not a fourth full prototype.

M0 now has a provisional 3–4 week elapsed budget for two engineers, including existing platform, storage and sync experiments. It is not a commitment to complete production integrations in that period. Stop an evaluation early when a hard gate fails.

### Common fixture and acceptance gates

Use the same small fixture of images, GIF, MP4, unsupported-codec media, PDF, Markdown, CSV, a large video and an unknown binary. Include duplicate filenames, Unicode, two notes with links, table records, tags and collections. Also generate a 50,000-item metadata dataset for catalog behavior. Real Eagle import fidelity requires a consented sample library.

1. **Build and licensing:** reproducible Windows/macOS/Android build path; exact source revisions; all required source available on usable terms; no undisclosed Pro module needed to complete the fixture. Record any platform not actually tested as blocked/unverified.
2. **Asset integrity:** import and byte-identical export; rename and multi-collection membership preserve identity; unsupported previews do not block storage.
3. **Knowledge integrity:** link asset, note and record with stable IDs; edit properties; preserve Markdown/frontmatter on round trip; retain both divergent external and in-app edits.
4. **Android lifecycle:** capture image, text and video through the share sheet; kill/restart; complete import after the temporary URI grant expires by staging bytes while permission exists; browse pinned content offline.
5. **Personal sync:** two devices edit offline; reconnect without silent overwrites; retry an interrupted large-file transfer; recover a delete/edit conflict. If upstream sync cannot meet this without replacement, include that replacement in the cost.
6. **Agent and AI boundary:** expose one search and one reversible metadata mutation; enforce scope and expected revision; one AI tag proposal uses the same mutation path and records provenance.
7. **Maintenance:** implement a small change without broad core surgery; identify changed upstream modules and demonstrate how a subsequent upstream update would be reconciled.

Score only routes passing the integrity/platform/license gates. Suggested weights: mixed-media fit 25%, notes/relations 20%, Android 20%, sync/recovery 15%, agent extensibility 10%, ongoing maintenance 10%. Give each criterion a 0–5 score with a log or fixture result; unknown is not a pass. License acceptability is a gate rather than a score that can be outweighed by attractive UI.

### Decision artifact

Produce an architecture decision record containing pinned revisions, build commands, platform results, source/Pro boundaries, fixture outcomes, changes required per backlog area, expected upstream merge burden, and a three-point effort estimate. Choose the lowest-risk route that preserves the confirmed scope. A fork may use a different schema, shell or server than the current proposal; update the plan coherently rather than maintaining two architectures on paper.

## 5. Effort and licensing implications

The strongest likely savings are editor behavior, preview engines, common file operations, table/graph rendering, and platform packaging. A full-app fork can save additional shell/navigation/settings work. The largest remaining costs are unified identity, durable mutations, external edits, cross-device recovery, safe agent operations and migration fidelity.

Do not assign a percentage saving yet. Compare **remaining adaptation + integration + testing + maintenance** against the same baseline requirements. More existing features do not guarantee less work if the storage model must be replaced. The project schedule remains a provisional composition estimate until M0 supplies this evidence; a successful fork should reduce the relevant milestones, not automatically erase testing or recovery work.

Personal use is the initial product audience, not a decision about the project's future distribution license. GPL/AGPL allow modification and commercial activity subject to their conditions; distributing covered derivatives or allowing network interaction with modified AGPL software can create source-availability obligations. They are not interchangeable with permissive MIT/Apache terms. Select a compatible project license before distributing a fork. Keep upstream notices, audit component boundaries, and use our own product name/branding. A public repository alone does not make code open source or remove trademarks.

No candidate application's code was copied during this research. A later [reference prototype](ADR-001-REFERENCE-PROTOTYPE.md) now uses selected packages through npm; its lockfile records actual versions. No whole-application fork, AI model or application distribution license has been selected. The application-foundation comparison remains open.

## 6. Maintenance snapshot and evidence limits

The following are values returned by the GitHub latest non-prerelease endpoint on the research date. They are not promises of stability or compatibility. Default-branch documentation can describe changes not present in these releases.

| Project | Latest non-prerelease returned | Published date |
|---|---|---|
| [TagSpaces](https://github.com/tagspaces/tagspaces/releases/tag/v6.15.1) | v6.15.1 | 16 November 2026 |
| [SiYuan](https://github.com/siyuan-note/siyuan/releases/tag/v3.8.10) | v3.8.10 | 10 November 2026 |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy/releases/tag/0.15.1) | 0.15.1 | 15 November 2026 |
| [TagStudio](https://github.com/TagStudioDev/TagStudio/releases/tag/v9.6.4) | v9.6.4 | 2 October 2026 |
| [Spacedrive](https://github.com/spacedriveapp/spacedrive/releases/tag/0.4.3) | 0.4.3 | 24 March 2025 |

All nine application/protocol repositories in the shortlist were unarchived when checked. Recent repository activity is only a screening signal. This review did not audit issue response times, security posture, test coverage, maintainers' capacity, or long-term release support. A fresh build from a pinned revision and actual target-device tests are required before adoption.
