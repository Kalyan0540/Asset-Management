# Atlas Android 0.4.1 preview

Use Atlas offline on Android 8 or newer. The preview is available as an APK on GitHub. [Download Atlas for Android](https://github.com/Kalyan0540/Asset-Management/releases/tag/android-v0.4.1-preview)

## Install or update

1. If you have an older Atlas preview, make a backup from **Library → Back up library** and keep the complete dated folder outside Atlas.
2. Open the new APK on your phone. Android may ask you to allow installation from your browser or Files app.
3. If Android reports a signing mismatch, check that your backup is complete before uninstalling the older app. Install the new APK, then choose **Library → Restore Atlas backup** and select the dated backup folder. These previews use test signing.

## Capture from other apps

Share an image, several files, a quote, or a website link and choose **Atlas**. Review the capture, choose tags and a folder, then save. A link share creates a note with its source. The **Photos** button opens Android's photo picker or its file picker on older phones. A Pinterest or Google Images share may contain a page link. Download an available image first if you want the actual file.

Once the browser or source app's bytes have been copied into Atlas's private capture inbox, Atlas can resume after a restart. To retry an accepted capture, use **Library → Retry pending captures**. A source that became unavailable before it was copied needs to be shared again. Atlas keeps bookmark links and imported files offline.

## Browse, edit, and export

- Switch between Grid and List. Search titles, notes and tags. Sort results or filter by actual file type, use built-in views, and browse nested folders.
- Create simple Smart Folders for names, tags, and file types. Backups can carry saved desktop rules as well.
- Edit notes and details with autosave and draft recovery. Notes can link to library items and display embedded images. The **Connections** view shows a small interactive graph and a list of related items and backlinks. **Revision history** can restore a previous version.
- Edit tags, folder memberships, ratings, descriptions and source links. Folder deletion has a preview and an Undo action. Export an original or Markdown file to a location you choose.
- Use image and supported video previews on the phone. **Open original** uses a compatible app for playback or specialist formats.

## Use AI writing and organization

Open an item and tap **AI writing and organization**. Enter an Ollama-compatible HTTPS address and the installed model name. A service running on the phone can use localhost. Generate a writing draft or a suggestion for tags, descriptions and folders, then review what to apply. Atlas sends the selected note or image when you choose Generate. Your library tools work offline.

## Move a library manually

On desktop, choose **Library → Back Up Library…** and copy the entire dated folder to your phone. In Android Atlas, choose **Library → Restore Atlas backup**. To go the other way, make a backup on Android and restore it in the desktop Library menu. Restore verifies the files and opens a separate local library.

The Android workflow compiles and lints the app, runs native persistence and transfer tests on an Android 11 emulator, checks recovery of accepted shares, and exercises installation. [Android build workflow](https://github.com/Kalyan0540/Asset-Management/actions/workflows/android.yml)
