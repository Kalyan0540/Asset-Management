# Atlas and Eagle workflow alignment

18 November 2026 · Planning draft · Desktop baseline Atlas 0.4.0

Atlas can carry over Eagle's interaction patterns, information hierarchy, and fast asset workflows with its own visual design. This inventory separates what the shared screenshots show, what Eagle documents, and what still needs confirmation from the recording. Implementation is pending agreement on this scope.

The supplied `.mov` exceeds this workspace's 32 MiB attachment transfer limit. I could review the earlier screenshots and compare them with Atlas 0.4.0 source. This is a preliminary inventory, not a recording walkthrough. The recording, asset images in the references, and these notes were not published to the public repository.

## 1. Gallery and thumbnail treatment

**Screenshot evidence** — The asset image is the visual tile. Its title sits directly on the workspace below the image. Rounded corners and a small file-type badge attach to the thumbnail. The gallery uses small, regular gaps and devotes most of the space to the media. Tall mobile screenshots keep their proportions. Some long titles wrap and truncate. A screenshot with both side panels hidden shows the same gallery reaching across the window.

**Atlas today** — Grid, Justified, and Waterfall are available. Atlas wraps the thumbnail and caption in a bordered card with a separate surface. Table and Graph are also available.

**Change** — Use an image frame and a plain caption below it. Remove the always-visible outer card border, footer background, size and Untagged labels from the default gallery tile. Put format and hover actions on the image and use an outline or subtle tint for selection or focus. Keep additional metadata available in the inspector. Try two-line captions, a predictable row baseline, preserved image proportions, a denser gallery, and consistent gaps in all three layouts. Keep Atlas's own typography, icons, colors, and finishing details. Confirm whether to include the Eagle List layout alongside Atlas Table and Graph. [Eagle preview and layout guide](https://eagle.cool/blog/post/how-to-preview-files-in-eagle)

**Check** — Portrait, landscape, square, transparent, video, and note tiles lay out without distorted originals. Captions work at narrow widths and long titles remain discoverable. Keyboard focus and multi-select remain apparent without relying on color or hover alone.

## 2. Preview and viewing

**Screenshot evidence** — A large portrait image sits above a dimmed gallery, with a visible frame and the surrounding library in context. The View menu lists layout changes, scroll commands, zoom and fit, grayscale, open/reveal commands, panel toggles, and presentation options.

**Atlas today** — Hover reveals a zoom button, then clicking opens the dark full-screen preview. Double-click and Space are additional entry points. Video playback controls are present in the preview.

**Change** — Add a transient magnifier-hover peek that returns the user to the same spot and selection when they leave. Keep click/tap and Space for a preview that stays open. Separate hover playback of GIFs or videos from opening the larger viewer. Verify the recording's trigger, timing, playback, arrow navigation, panel toggles and context menu before matching their behavior. Fit, actual size, zoom/pan and open/reveal are distinct jobs to prioritize before presentation mode or specialist viewer commands. [Eagle viewer guide](https://eagle.cool/blog/post/how-to-preview-files-in-eagle) · [Eagle preferences](https://en.eagle.cool/support/desktop/preferences)

**Check** — Hovering repeatedly does not trap the pointer, steal keyboard focus, scroll away, or start audible playback. Click, touch, keyboard, and Escape work independently. Persistent preview restores focus to the originating item.

## 3. Navigation and folder organization

**Screenshot evidence** — Library identity sits at the top of the left sidebar with compact controls. Built-in views show item counts. All, Uncategorized, Untagged, Recently Used, Random, Community, All Tags, and Trash are visible. Smart Folders and Folders have separate sections. Folders expand as a tree with indentation. The create menu exposes New Smart Folder and New Group. A new ordinary folder appears as selected Untitled text in place. The sidebar has a bottom filter.

**Atlas today** — All, Uncategorized, Untagged, Favorites, Notes, and Trash exist. Tags and folder counts are visible. Inline naming already exists. Library switching lives in the native Library menu. Folders are flat, and imported nested Eagle folders are currently represented as folder path names.

**Change** — Make the active library and switcher visible inside Atlas. Group built-in views, Smart Folders, real folder hierarchy, and tags clearly. Preserve inline naming, add folder expand/collapse, show depth, and define whether a parent includes descendant assets. Add All Tags and decide where Favorites, Notes, Recently Used and Random belong. Confirm what the bottom Filter targets and what New Group does from the recording. Eagle Community is a separate content service and would need its own Atlas scope.

**Check** — Nested names with the same final segment remain distinct. Renames and moves preserve memberships and links. Migrate imported path labels cautiously, since a normal folder name can also contain the same separator. Counts and selected view stay consistent across navigation.

## 4. Search, filters, and rules

**Screenshot evidence** — Search sits in the upper toolbar. The visible filters include Color, Tags, Folder, Shape, Rating and Types, with an add control. The Smart Folder dialog presents a name, an any/all selector, a true/false selector, criteria with field/operator/value, add/remove actions, and a match count. Exact implications of the add controls and condition group nesting need the recording.

**Atlas today** — It searches titles, tags and notes, with basic type, folder, and tag filters plus sorting. Smart Folders and automatic organization were deferred.

**Change** — First add shared filters that combine in the toolbar, with visible active conditions and clear/reset. Then let users save them as Smart Folders with a live result count. Start with name, tag, folder, format, or date when their metadata is available. Add color, shape and rating when those fields are consistent for both fresh and imported files. Treat automatic actions separately. A smart folder shows matching assets dynamically. An import rule can add an actual folder membership or tag with an activity record and an undo path. [Eagle search and Smart Folders](https://en.eagle.cool/blog/post/how-to-search-for-files-in-eagle)

**Check** — Existing and new matching assets appear automatically. Editing metadata updates saved results. Rules show which assets will be affected and where their metadata will change. Controls have readable labels and work from the keyboard.

## 5. Inspector and item details

**Screenshot evidence** — Image at the top, compact swatches underneath, then editable title, notes and source. Tags and folders show compact chips and add controls. The properties section includes rating, dimensions, size, type, and imported/created/modified dates, with Export below. A pin control is visible. A separate screenshot shows a selection summary with item count and total size.

**Atlas today** — It has a right inspector, dominant image swatches, dimensions, item tags, folder membership, description, favorite flag, source URL and exact rating when present in Eagle metadata, dates, and export. Source/rating lack general editable fields. It uses larger form controls in places and focuses on single-item inspection.

**Change** — Make the inspector denser, put editable source and rating into Atlas's own data model, distinguish import/create/modify dates, add editable tag and folder chips, and show useful properties for empty, single, and multi-selection. Keep Atlas Relations and Revision history available in secondary groups. Confirm pinning behavior. Make color swatches copyable, with text or accessible names.

## 6. Capture and dedicated library storage

**Screenshot evidence** — The library selector and ordinary folders are visible. The supplied screenshots do not establish how clipboard, capture, or export dialogs behave. Eagle documents import, drag/drop, and clipboard entry points. [Eagle desktop support](https://en.eagle.cool/support/desktop) · [Eagle capture overview](https://eagle.cool/)

**Atlas today** — Desktop file picker, drag/drop and Eagle import copy originals into a managed folder. The default desktop library lives under Atlas's application-data directory. A library chosen through New/Open or created by an Eagle import can be elsewhere. Native text/image clipboard import should not be assumed from the normal paste action in a note. Android uses its app-private library and manual transfer through backups.

**Change** — Bring together file/folder import and clipboard image capture, with predictable default naming and destination. Capture into the active library, apply the current ordinary folder when that matches the user's expectation, and otherwise show recently added or uncategorized items. Display the library name and a Reveal in Finder/Explorer action. Warn clearly about missing storage and report skipped files when importing several at once. Keep current storage compatible, and consider a recognizable `.atlaslibrary` folder name only if it works on Mac, Windows and for backup transfer.

**Check** — Imports and pastes survive restart, preserve original files when applicable, and appear in the expected library. Pasting into search or an editor still edits the field. Ordinary folders are organizational labels within the library, so one asset can belong to multiple folders without duplicated bytes.

## 7. Export, backup, and transfer

**Atlas today**

| Button | Output | Use |
|---|---|---|
| Inspector → Export original | One original file with its filename | Use or send the image, video or other file outside Atlas |
| Inspector → Export Markdown | One `.md` file containing the note text | Open in another editor. Atlas links inside the note still refer to Atlas item IDs |
| Top toolbar download icon | `atlas-manifest.json` with catalog data, including note text and folders | Inspect or process the catalog. It doesn't package media bytes or revision history |
| Library → Back Up Library | Dated folder with the database, original files, and backup marker | Restore a library or carry it to another device |

Desktop exports are ordinary downloads. The destination follows the download settings and dialog for the system. Native backup asks you to pick a parent folder. To find your actual library, choose **Library → Show Library Folder**. Inside, `catalog.sqlite` records the library and `blobs/` stores its original files. The files in `blobs/` use internal identifiers. Export original gives you a convenient named copy.

**Change** — Use a labeled Export menu to distinguish Original files, Markdown, Catalog JSON, and Back Up Library. Add selected-file export to a chosen location with a clear duplicate-name policy and completion summary. Evaluate folder-tree export and portable linked notes after validating the video. Keep conversion, EaglePack, and partial packages separate from backup. [Eagle import and export support](https://en.eagle.cool/support/desktop/import-and-export)

## 8. Notes and Atlas features to retain

**Screenshot evidence** — An open text item takes over the central work area. Library navigation and details flanking the editor retain context. A back affordance appears at the top.

**Atlas today** — Center Markdown workspace, default note naming, slash commands, Write and Read views, links to notes/assets, image embeds, graph links, revision history, and Table and Graph views already exist.

**Change** — Preserve those features and make the back/next actions and inspector consistent with the media viewer. Confirm the recording's individual note, edit and save interactions. Keep meaningful link and reading flows intact during the gallery/sidebar work. Confirm whether autosave, live formatted editing, and portable links are desired additions rather than assuming the recording demonstrates them.

## 9. Generic MCP

MCP is a standard way for an agent to ask Atlas for information or actions through named tools. For example, an agent can ask Atlas to search for “typography references,” then read a matching note or open a supported image. Atlas finds the items. The agent decides what answer to give you. Ollama is separate and powers Atlas's own optional tag and description suggestions.

Atlas 0.4 already includes a generic local MCP server. Choose **Agents → Copy Read-only MCP Configuration** for a client that accepts local `stdio` settings in JSON. **Copy Codex MCP Setup** formats the same connection for Codex. Keep Atlas open on the same machine. The current read setup searches the active library, reads item data and note text, and sends supported images up to 4 MiB. The default connection covers the whole active library. The agent receives the data returned by the tools you allow it to call.

**Change** — Make generic MCP the primary setup path, with Codex as a client-specific shortcut. Add an independent compatibility test with a second client and a simple connection/permissions panel. Keep writes opt-in, with separate approval and a narrower scope when that capability is added to the normal setup. A hosted agent such as ChatGPT on the web needs an authenticated remote service or supported private tunnel; scope and authorization for that connection are a separate decision. [MCP transport documentation](https://csharp.sdk.modelcontextprotocol.io/v2/concepts/transports/transports.html) · [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

## 10. What GitHub has now

| Where | Verified state |
|---|---|
| GitHub front page | Default branch `feat/library-foundation` at `3f355ab`. Desktop 0.4 source, documentation and all four download links are there |
| `feat/eagle-import-android` | Feature branch at the same `3f355ab` commit. PR #1 is closed and marked merged |
| Desktop download | Fixed tag `v0.4.0` at `3f355ab`. Published Mac and Windows prerelease assets |
| Android download | Separate tag `android-v0.3.0-preview` at `321ac03`. Published APK prerelease |
| This workspace | Local checkout of `feat/eagle-import-android`, clean when checked. Personal assets and this planning draft are outside the public source history |

A commit is a saved change, a branch is a line of work, a PR is a place to review and integrate it, and a release tag is a fixed version from which the installers were built. Both GitHub and this workspace have the current source. The released installers are on GitHub Releases. Your imported assets are in your Atlas library on the device, and your backup copies are wherever you chose to put them. For the next agreed round, use a fresh branch and PR with focused commits and comparison screenshots. Tag a release after the agreed checks pass. [Repository](https://github.com/Kalyan0540/Asset-Management) · [PR #1](https://github.com/Kalyan0540/Asset-Management/pull/1) · [Desktop release](https://github.com/Kalyan0540/Asset-Management/releases/tag/v0.4.0) · [Android release](https://github.com/Kalyan0540/Asset-Management/releases/tag/android-v0.3.0-preview)

## Proposed review order

1. Gallery framing and typography, transient and persistent previews, sidebar, and inspector. Compare representative Grid, Justified and Waterfall screens before broadening the changes.
2. Library selector and location, capture and clipboard, native folder tree, and explicit export and backup choices. Verify the flows on Mac and Windows.
3. Reusable filters, saved Smart Folders with counts, then opt-in import rules. Confirm what automatic actions should change before enabling them.
4. Generic local MCP setup and compatibility alongside the desktop work. Retain linked Markdown, graph, table, revision history, and offline Android transfer throughout.

## What to verify from the recording

A smaller recording is the only new reference needed initially. A compressed MP4 under 32 MiB, or a few clips each under 32 MiB, will work. Useful sections are the gallery and preview transition, library and folder creation, smart folder creation or editing, inspector and note interactions, and import/clipboard/export dialogs where present. Record only screens you are comfortable sharing. I can then timestamp each observed interaction, mark missing behaviors and keyboard details, and finalize what belongs in the first implementation pass. A recording alone cannot verify screen reader behavior, responsive extremes, or whether long operations recover after failure. Those checks belong in implementation verification.
