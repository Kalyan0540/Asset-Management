# Start using Atlas

Atlas is now being packaged as a normal desktop app. You do not need Node, a terminal, Git, or programming knowledge to use the desktop download.

**This is an early release, not the whole Eagle replacement yet.** Use a small collection to try it first, and keep your original files. Android and automatic synchronization between devices are not available in this release.

## 1. Download the right file

Open [Atlas downloads](https://github.com/Kalyan0540/Asset-Management/releases) and choose the newest **early desktop release**. Expand **Assets** below its description. Download the installer, not the “Source code” ZIP.

| Your computer | File to choose |
|---|---|
| Mac with Apple M1, M2, M3, M4 or later Apple chip | `Atlas-0.2.0-mac-arm64.dmg` |
| Mac with an Intel processor | `Atlas-0.2.0-mac-x64.dmg` |
| Windows computer with an Intel/AMD processor | `Atlas-0.2.0-win-x64.exe` |

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
4. Click **New note** to write a Markdown note. Use Relations in the details panel to connect it to your references, then switch to **Graph** to see those connections.
5. Use the checkboxes on cards to select several items and tag, collect, favorite or trash them together. A stale item causes the whole batch to stop rather than partially overwrite changes.
6. Double-click an item, or select it and press **Space**, for a larger preview. Use the arrow keys to browse; press Escape to close it.

Your library is saved automatically on this computer as you import files or click Save. You do not need to “push to GitHub” to keep using the app. GitHub holds the application's code and downloads, not your personal library.

## 4. Back up your work

From the app's **Library** menu, choose **Back Up Library…**, then select a destination such as an external drive. Atlas creates a new dated folder, copies the catalog and originals, and checks the copied files. Keep that whole backup folder together.

To recover it, choose **Library → Restore a Backup…** and select the dated backup folder. Atlas verifies it and opens a new restored library. Your previous library is left untouched.

Use **Library → Show Library Folder** if you want to see where your active library lives. Avoid editing the files inside manually. Backups are copies for recovery; they are not automatic synchronization.

## 5. Optional AI suggestions

Click **AI suggestions** in Atlas. This release works with the free [Ollama app](https://ollama.com/download), running locally on the same computer.

Install and open Ollama, choose/download a model there, then return to Atlas and click **Refresh**. For images, choose a model that supports image input; a text-only model cannot describe a picture. Model downloads can be several GB and may be slow on a computer with limited memory.

Select a note or a PNG/JPEG/WebP image and click **Suggest tags & description**. Review the result before applying it. Existing tags are retained. Replacing your description is a separate checkbox. If you dislike an applied result, use the item's **Revision history** to restore an earlier version. This feature does not install a model silently or send your content to a hosted AI service.

## What remains in development

If you use a local AI agent that supports MCP, choose **Agents → Copy Read-only MCP Configuration** in Atlas. Paste it into the agent's MCP settings and leave Atlas open. This lets the agent search and read the library without giving it edit tools; no developer installation is required for this connection.

Automatic multi-device sync, Android, the Chrome capture extension, Eagle library import, advanced note/table features, large-library performance work, and many specialist file previews remain pending. The table currently displays asset metadata; it is not yet a complete Notion-style database. The graph shows explicit relations; it does not yet parse every Obsidian-style link. These limits are recorded in the [implementation status](IMPLEMENTATION_STATUS.md) and full [project plan](PROJECT_PLAN.md).
