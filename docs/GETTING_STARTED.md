# Start using Atlas

Atlas is a desktop app for macOS and Windows. You do not need Node, a terminal, Git, or programming knowledge to use the desktop download.

**This is an early release, not the whole Eagle replacement yet.** Use a small collection to try it first, and keep your original files. Android has a separate [preview app and setup guide](ANDROID.md). Automatic synchronization is not available; backups can transfer a library manually.

## 1. Download the right file

Open [Atlas downloads](https://github.com/Kalyan0540/Asset-Management/releases) and choose the newest **early desktop release**. Expand **Assets** below its description. Download the installer, not the “Source code” ZIP.

| Your computer | File to choose |
|---|---|
| Mac with Apple M1, M2, M3, M4 or later Apple chip | `Atlas-0.6.0-mac-arm64.dmg` |
| Mac with an Intel processor | `Atlas-0.6.0-mac-x64.dmg` |
| Windows computer with an Intel/AMD processor | `Atlas-0.6.0-win-x64.exe` |

To check your Mac, click the **Apple menu → About This Mac**. “Chip: Apple …” means use the Apple chip download. “Processor: Intel …” means use the Intel download.

The Mac downloads target modern macOS versions supported by the bundled Electron runtime; older macOS installations may need updating. Windows downloads target 64-bit Windows 10 or later. Native Windows ARM and older operating systems have not been certified.

## 2. Install and open

**Mac:** open the downloaded `.dmg`, drag Atlas into **Applications**, then open Atlas from Applications.

**Windows:** open the `.exe`, follow the installer, then open Atlas from your Start menu or desktop shortcut.

These early downloads are not yet signed with a verified publisher certificate or notarized by Apple. Your computer may show an unrecognized-developer warning. On macOS, after trying to open Atlas, go to **System Settings → Privacy & Security → Open Anyway** for Atlas if that option appears. On Windows, the downloaded installer may offer **More info → Run anyway**. Only continue for the file you downloaded from this project's release page. Do not turn off your computer's protection globally. If it reports the app is damaged, stop and report the exact message instead of using terminal workarounds.

## 3. Try a small collection

1. Click **Import files**, or drag a few images, videos or documents into the window. Atlas copies the files; the originals stay where they were.
2. Click an item. Add a title, description or tags in the right panel, then click **Save changes**.
3. Use **+** next to Collections to make a folder-like collection. An item can belong to more than one collection without duplicating its file.
4. Click **New note** to open a new note in the center. Type `/` at the start of a line for headings, lists and other commands. Use **Link an item** to link a note or embed an image, **Read** to see the formatted result, and **Save note** to keep it. Saved links appear in Graph when both items are in the current view.
5. Hover over an asset and click its magnifying glass to open Quick Preview. On a touch screen, the button is visible on the card. Choose Grid, Justified or Waterfall from the view controls. Select an image to copy colors from the inspector.
6. Use the checkboxes on cards to select several items and tag, collect, favorite or trash them together. A stale item causes the whole batch to stop rather than partially overwrite changes.
7. Double-click an item, or select it and press **Space**, for a larger preview. Use the arrow keys to browse; press Escape to close it.

Your library is saved automatically on this computer as you import files or click Save. You do not need to “push to GitHub” to keep using the app. GitHub holds the application's code and downloads, not your personal library.

## Use the compact workspace

- Use **Appearance** in the top bar for **System**, **Light**, or **Dark**. The sidebar and inspector can also be hidden from the top bar.
- Hover the magnifier for a temporary peek. Click it, tap it, or press Space for a persistent preview. The menu beside the magnifier and the context menu both open searchable item actions.
- Create a root folder with the plus in **Folders**. Hover or focus a folder and use its add-subfolder button to nest another folder. A parent shows items in its descendants once each.
- Paste an image into the workspace to save a timestamped file. Pasting into an editor or search field still edits the field. File imports and clipboard captures go into the active library and the selected ordinary folder, where applicable.
- Use the **Export** menu for selected originals or Markdown and catalog JSON. The native selected-files export asks where to save, and appends numbers when a name already exists. Use a full backup for transfer or recovery.
- In the sidebar, **Repair Eagle folders…** previews matching paths from older Eagle imports before changing their hierarchy. Unmatched path names remain in place. Take a library backup first if you want an independent recovery copy.
- **Smart Folders** remember filters. Optional import actions can add a tag or folder membership to future matching desktop imports. Review the change in the item's revision history.
- In **All Tags**, click the pencil beside a tag. Enter a new name to rename it, or enter an existing tag to combine them. **Review changes** shows which items, tag groups and smart folders will be affected. Edit a tag group to rename it, combine it with another group by entering that group's name, or remove it.
- Right-click a PNG, JPEG, GIF, WebP or AVIF image and choose **Search web by image**. Pick Google Lens or TinEye. Atlas prepares a temporary image copy and opens your browser. To share that copy with the provider, choose **Search by image → Upload a file** on Google or **Upload** on TinEye. [Google Lens help](https://support.google.com/websearch/answer/1325808) · [TinEye help](https://tineye.com/how)

## Combine two Atlas libraries

Open the first library and choose **Library → Merge Libraries…**. Select the second Atlas library folder, then choose a location for the combined copy. Review the contents before creating it. The new library preserves nested folders, notes, links and item history. Look for **From [library name]** in the folder tree to find the second library's folders. Duplicate entries stay separately editable and identical file bytes share storage. Both original libraries stay available at their existing locations.

## 4. Back up your work

From the app's **Library** menu, choose **Back Up Library…**, then select a destination such as an external drive. Atlas creates a new dated folder, copies the catalog and originals, and checks the copied files. Keep that whole backup folder together.

To recover it, choose **Library → Restore a Backup…** and select the dated backup folder. Atlas verifies it and opens a new restored library. Your previous library is left untouched.

Use **Library → Show Library Folder** if you want to see where your active library lives. Avoid editing the files inside manually. Backups are copies for recovery; they are not automatic synchronization.

## 5. Optional AI suggestions

Click **AI suggestions** in Atlas. This release works with the free [Ollama app](https://ollama.com/download), running locally on the same computer.

Install and open Ollama, choose/download a model there, then return to Atlas and click **Refresh**. For images, choose a model that supports image input; a text-only model cannot describe a picture. Model downloads can be several GB and may be slow on a computer with limited memory.

Select a note or a PNG/JPEG/WebP image and click **Suggest tags & description**. Review the result before applying it. Existing tags are retained. Replacing your description is a separate checkbox. If you dislike an applied result, use the item's **Revision history** to restore an earlier version. This feature does not install a model silently or send your content to a hosted AI service.

## Import your Eagle library

Choose **Library → Import Eagle Library…** and follow the [Eagle import guide](EAGLE_IMPORT.md). Close Eagle first. Atlas creates a separate library and reports anything it could not import.

## Connect a local agent

For Codex, follow the [Codex setup guide](CODEX.md). If you use another local AI agent that supports MCP, choose **Agents → Copy Read-only MCP Configuration** in Atlas. Paste it into the agent's MCP settings and leave Atlas open. This lets the agent search and read the library without giving it edit tools; no developer installation is required for this connection.

Automatic multi-device sync, the Chrome capture extension, advanced note/table features, large-library performance work, and many specialist file previews remain pending. Android currently offers a smaller offline feature set. The table currently displays asset metadata; it is not yet a complete Notion-style database. The graph shows explicit relations; it does not yet parse every Obsidian-style link. These limits are recorded in the [implementation status](IMPLEMENTATION_STATUS.md) and full [project plan](PROJECT_PLAN.md).
