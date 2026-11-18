# Import an Eagle library

Implemented for the next desktop release after 0.2.1. The existing 0.2.1 download does not include this command.

1. Close Eagle so its files do not change while being copied.
2. In Atlas choose **Library → Import Eagle Library…**.
3. Select the whole `Something.library` folder, not its `images` subfolder or an individual image.
4. Choose a destination outside the Eagle library with enough space for a separate copy.
5. Atlas opens the new imported library and offers an import report. Use **Library → Cancel Eagle Import** to stop; cancelled partial output is removed.

Your Eagle source and previously open Atlas library are not modified. Missing or malformed items are reported individually. A disk failure or cancellation stops the import. Repeating the command creates a separate library, not an incremental merge into an existing one.

## What is mapped

Original file bytes are streamed, hashed and checked after copying. Equal bytes share storage while distinct Eagle items stay distinct. Tags, annotations, available timestamps, deleted status and memberships are retained. Nested Eagle folders appear as full-path collection names (`Design / Inspiration`). Star ratings greater than zero become Favorites; the exact rating remains in the preserved metadata. Website-only items with a supported bookmark extension become URL notes.

All item metadata remains in each item's `source.metadata`. Root metadata and ID mappings are retained in `eagle-import-report.json` and an `import_reports` database table, so native backups preserve the report's data as well. Palettes, comments, dimensions, smart folders, folder properties and tag-group definitions are preserved as metadata; this does not make them working Atlas features. Display text above Atlas's limits is shortened with a report entry; the complete text remains in source metadata. Tags/memberships that exceed editing limits cause the item to be skipped rather than silently truncated.

The importer never uses a thumbnail in place of a missing original, follows no item/file symlinks, rejects unsafe filenames, and refuses a destination inside the source library. Some broken layouts require repair in Eagle before retrying. It does not import `.eaglepack` ZIP exports, encrypted libraries or arbitrary undocumented layouts.

## Compatibility evidence

The implementation reads the conventional `metadata.json` and `images/<id>.info/metadata.json` layout. Field semantics were checked against [Eagle's item API](https://developer.eagle.cool/plugin-api/api/item) and [library API](https://developer.eagle.cool/plugin-api/api/library). The on-disk layout was cross-checked against the [EaglePack Importer's format notes](https://github.com/Stef4678/eaglepack-importer/blob/main/docs/FORMAT.md). This is a format adapter, not an Eagle-supported API or a fork of that importer.

Synthetic fixture tests cover nested folders, metadata, bookmarks, duplicate bytes, deleted items, backup/restore, missing originals, traversal, directory links and cancellation. No representative private Eagle library has been supplied; these tests do not establish compatibility with every Eagle version or the user's personal collection.
