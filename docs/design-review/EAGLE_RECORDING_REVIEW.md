# Atlas desktop alignment from the Eagle recording

18 November 2026 · 2:58 compressed Eagle walkthrough · Atlas desktop 0.4 baseline

The 1920×1080 recording opened successfully. I reviewed the visual sequence across the full recording and checked individual frames at the important transitions. The reference screenshots from the earlier message supply additional states for the View menu, inline creation, Smart Folder editor, text editor, and gallery with both side panels hidden. The guide below distinguishes those sources. Menu entries alone do not demonstrate the behavior behind them.

## 1. 0:00–0:19 · Library switcher and navigation

The library name opens a compact popover with a search field, current-library checkmark, location next to the library name, Create Library, Switch Library, Empty cache and reload, and Merge Library. Gallery and folder tree stay in place behind it. The left sidebar has short rows, built-in views with counts where applicable, a Smart Folders section, an indented disclosure tree, and a bottom filter field. The top-level App Store Screenshots folder shows 30 items and Finance Apps contains four child folders with 9, 7, 6, and 8 items. Other Apps is visible under App Store Screenshots. [Frame at 0:04](references/earlier-eagle-recording/00-04-library.jpg)

**Atlas plan** — Keep the existing native library actions and surface recent libraries, current location, create/open and reveal in an in-app switcher. Make cache/reload and merge separate flows. Add nested folders with independent expansion and selection. Display direct membership and descendant totals consistently. Reserve space for Recently Used and All Tags. Random and external Community are visible in the navigation, but their behaviors were not demonstrated.

## 2. 0:19–0:43 · Compact filters and resizing

A dedicated filter row below the navigation toolbar keeps Color, Tags, Folder, Shape, Rating and Types one click away. Color has a two-dimensional picker, hue strip, quick swatches, hex entry and an accuracy control. Changing color produces a smaller result set and a result count without leaving the gallery. The folder chooser has search, counts, rule icons and instructions for selecting or excluding choices. Rating opens another compact chooser. The centered thumbnail size slider changes the number of columns without changing the whole window zoom. [Folder filter frame](references/earlier-eagle-recording/00-31-shape.jpg)

**Atlas plan** — Move resizing into the compact toolbar and retain it per layout. Make filters small anchored popovers with selected criteria, exclusion, a result count, and an obvious reset. Build type, folder, tag and rating lookups before combining color tolerance and shape. Keep results and selection focus stable during resizing and filtering. Use a text label and a non-color indicator for active filters.

## 3. 0:43–1:10 · Gallery, large preview, and inline playback

Thumbnails use rounded corners and a format badge in the top-left. Captions are centered outside the image, wrap to about two lines, and truncate; there is little visual weight in the space between assets. Portrait and landscape items keep their proportions. A small bottom-right affordance opens a large, framed image or video above a dimmed gallery. The gallery remains recognizable, and the preview dismisses back to it. Around 1:00–1:09, the video plays or scrubs in the thumbnail with time feedback, a different interaction from the large preview. [Image peek](references/earlier-eagle-recording/00-49-peek.jpg) · [Video peek](references/earlier-eagle-recording/00-58-video.jpg) · [Inline video](references/earlier-eagle-recording/01-04-inline-play.jpg)

**Atlas plan** — Remove the persistent outer tile frame and footer. Keep the image frame, format badge, quiet captions, and visible selection and focus. Use the same component across Grid, Justified and Waterfall. Add transient hover peek and keep the existing click/tap/Space viewer as persistent preview. Design inline video as a separate, muted and lazy playback mode. Confirm the exact trigger and timing before copying interaction details. A mouse recording cannot establish keyboard or touch behavior. Verify focus return, reduced motion, and Escape in Atlas.

## 4. 1:10–1:41 · Inspector and tag picker

Single selection puts a thin accent outline around the image and highlights the title below. The inspector stays aligned with the gallery and changes from a collection summary to a small centered media preview, palette, editable title/notes/source, tag and folder controls, properties, and Export. Folder membership is a removable chip with a nearby plus. Properties show rating, dimensions, size, type, and imported/created/modified dates. The palette menu offers similar-color search, several copy formats and Set as Primary Color. Adding a tag opens a contextual picker with search, pin/options, layout and column width, and toggles for Starred, Recently, Recommended, and Count. [Inspector and swatches](references/earlier-eagle-recording/01-24-swatch.jpg) · [Tag picker](references/earlier-eagle-recording/01-39-tag-options.jpg)

**Atlas plan** — Use compact field groups and show tools where the related value lives. Keep source/notes editable, add rating and distinct dates, show tag and folder chips, and add palette actions without hiding accessible color names. Preserve Atlas Relations and Revision History. Start with straightforward tag search/add, counts and recently used tags. Evaluate recommendation behavior separately. Ensure inline changes have clear save feedback.

## 5. 1:41–1:55 · Dedicated tag manager

All Tags opens a distinct workspace with its own short sidebar for All, Uncategorized, Starred and Groups, a plus to create a group, a searchable toolbar, and a centered empty state. The library navigation stays visible. The tag manager replaces the asset gallery and its item inspector. [All Tags frame](references/earlier-eagle-recording/01-47-all-tags.jpg)

**Atlas plan** — Add a dedicated tag-management surface with an empty state, search, usage counts, and groups. Keep asset tagging in the inspector. Treat group rename/merge and changing tags across assets as separate, reversible edits.

## 6. 1:55–2:08 · Searchable item context menu

Right-click opens an item menu with a search field and shortcut hints. It groups open/default app/reveal, folder and other-library actions, export/share, rename/copy/path/tags/duplicate, image search, thumbnail background/grayscale, and Trash. The image search submenu lists providers. Other actions are visible but their subflows are not exercised. [Context menu frame](references/earlier-eagle-recording/02-02-context.jpg)

**Atlas plan** — First provide a focused context menu for Preview, Open original, Reveal, Rename, Add to folder, Export, Copy and Trash. Expose the same commands via keyboard and a visible menu trigger. Only add platform integrations, external reverse image search, plugin commands or cross-library actions after their allowed data and behavior are agreed.

## 7. 2:19–2:41 · Clipboard capture, multi-selection, and Undo

A new timestamp-named Clipboard PNG appears in the library, becomes selected with its caption highlighted, and is shown in the inspector. Two selected items switch the inspector to a multi-item summary with a count, shared editing controls, and combined size. The menu then moves the clipboard item to Trash and an anchored toast offers Undo. The initial screen and the return to the gallery show the unselected summary state again. [Clipboard result](references/earlier-eagle-recording/02-22-clipboard.jpg) · [Multi-selection](references/earlier-eagle-recording/02-30-selection.jpg) · [Undo notification](references/earlier-eagle-recording/02-39-undo.jpg)

**Atlas plan** — Capture clipboard images into the actual library and select/locate them on completion. Keep ordinary text paste within text controls. Add selection-aware inspector and export. Let Undo reverse the specific Trash operation with clear feedback. The clip shows the resulting clipboard asset, not which exact shortcut was pressed.

## 8. 2:43–2:58 · Search and return to browsing

Opening Search shows recent query suggestions under the field. The gallery remains visible and the toolbar can return to the simple browse state. [Search field](references/earlier-eagle-recording/02-48-search.jpg)

**Atlas plan** — Keep search in the upper toolbar with recent searches, scope and clear/reset. Track search state separately from navigation and selection. Make suggestions keyboard reachable and easy to dismiss.

## Screenshot-only states

- **Folder creation** — The earlier screenshot shows the new folder inline with Untitled selected. Atlas already creates folders inline. The missing behavior is placing the new folder at the chosen depth and preserving the tree.
- **Smart Folder dialog** — The screenshots show a name, any/all plus true/false logic, editable criteria rows and a live match count. Use shared filter expressions. Keep Smart Folders as live results, with actual automatic tag or membership edits as a separate opt-in feature.
- **Text editor** — The screenshot shows an editor taking the center while navigation and item properties remain visible. Keep Atlas's center editor, Markdown links, graph and history. Align opening/back behavior with the viewer.
- **View menu and gallery** — Earlier screenshots show layout choices, zoom, panel toggles, grayscale and presentation options. Both side panels can be hidden to widen the gallery. The order and visual grouping are useful references. Bring panel toggles, layout and zoom into the first pass; confirm finer options individually.
- **Export** — A button and menu entry are visible, but no export completion or format chooser is demonstrated in this recording. Keep Atlas's distinctions between original files, Markdown, catalog JSON and backup. Add batch original export before advanced conversion or interchange formats.

## Eagle import findings

The report records 64 imported items, all with originals, zero skips, and zero bookmarks. There are 64 unique Eagle item IDs, 64 unique Atlas item IDs, and 63 unique content hashes. Two item records have identical bytes. This is consistent with Atlas keeping both records and sharing original storage. The raw data and originals were not independently checked against the actual library folder.

The JSON contains four top-level folders and ten folder nodes in total. One branch is App Store Screenshots → Finance Apps → four leaf folders. The only reported issue explicitly states that Atlas uses full-path collection names. This explains why subfolders appear at the top level and why parent folders can show zero direct items even when their children contain assets. The report does not list per-item folder memberships or per-folder counts, so it cannot distinguish an intentionally empty folder from one containing only descendants. The report contains no saved Smart Folder or tag group entries in this sample.

**Proposed migration** — For new imports, persist native parent IDs and retain original memberships. For libraries already imported, read the preserved Eagle tree, offer a preview that matches legacy path names to folders and flags renamed or ambiguous matches, and keep current Atlas item and folder IDs when moving them into the tree. Preserve intentionally empty folders. Make parent counts include descendants while counting an asset only once in a parent branch. Check desktop backup/restore and Android compatibility against an older flat library before rolling out.

## First review checkpoint

Prototype or implement the approved Atlas-owned visual treatment in one desktop slice: compact library switcher and toolbar, gallery thumbnails with plain captions, selected/unselected inspector, and transient preview. Use the supplied reference to confirm hierarchy and behavior, keeping Atlas's visual identity. Include native folder hierarchy in this checkpoint. Verify the existing-library repair separately against a backup before exposing it to users. Then tackle capture/Undo, context actions, filters, Smart Folders and tag management in smaller reviewable pieces.

The recording is sufficient to align the core desktop slice. Additional clips would help only if exact export options, Smart Folder editing, or a specific menu action must match. Validate keyboard navigation, accessibility and touch separately.
