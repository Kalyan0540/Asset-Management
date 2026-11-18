# Atlas Android 0.3 preview

An installable offline Android app for Android 8.0 or newer. This is an initial Android implementation, not desktop feature parity or automatic sync. An APK is published only after the Android compile, lint and emulator checks pass.

## Install

From the Android preview's GitHub release, download `Atlas-0.3.0-android-preview.apk` on your phone and open it. Android may ask you to allow installation from the browser or Files app you are using. Allow that source for this installation, then turn that permission off again if desired. This is a test-signed preview, not a Play Store release. The signing identity is cached for development builds; it is not a durable production signing setup. Back up before any uninstall or replacement. If Android reports a signature mismatch, do not uninstall without a verified backup.

## Included

- Local files, original-byte storage and duplicate-byte sharing.
- Dark native gallery, image previews and opening originals in another compatible Android app for video/audio/PDF and other formats.
- Search, editable notes, descriptions and tags, collections, favorites and reversible Trash.
- Android file picker for multiple imports and receiving shared files or text from other apps.
- Manual verified backup export and restore using Android's folder picker. The catalog and immutable originals use the same schema as Atlas desktop.
- Revision history is recorded and retained in backups. Android does not yet have a history-restore screen.

Keep Atlas open until an import or backup completes. The current share receiver does not persist a background job across process termination. A failed copy creates no item, and staged files are cleared at startup; retry the share if Android closes the app mid-copy. No broad storage access or Internet permission is requested.

## Bring an Eagle library to Android

1. On your computer, use Atlas desktop's **Library → Import Eagle Library…** and review its report.
2. Choose **Library → Back Up Library…**.
3. Copy the entire dated backup folder to your phone, including `catalog.sqlite`, `atlas-backup.json` and the complete `blobs` folder. A USB cable or your existing file-transfer service can move it.
4. In Android Atlas, choose **Library → Restore Atlas backup** and select that dated folder. Atlas verifies the files before opening a separate local library.

To move a phone library back to desktop, choose **Library → Back up library**, transfer the complete dated folder, and restore it from the desktop Library menu. Restore creates a separate library; it does not merge changes from two devices. Use **Libraries on this phone** to reopen previous local libraries.

## Limits and verification

Automatic sync, Android AI/MCP, graph/table views, rich Markdown rendering, built-in specialist media previews and persistent share/background work are pending. Image previews use Android's built-in decoder; unsupported formats can still be stored/exported. Personal-library scale and physical-device behavior have not yet been certified.

The Android workflow builds/lints the APK and runs tests on an Android 11 emulator for native launch, reopen persistence, stale-write rejection, original hashing/deduplication, compatible backups, and failed-import cleanup. Workflow configuration is not proof of success; check the linked release's completed run. Desktop and Android source live on `feat/eagle-import-android` while this work is reviewed.

## Developer build

Use Java 17, Android SDK 35 and Gradle 8.11.1: `gradle -p android assembleDebug`. This project uses Android's native views, SQLite and Storage Access Framework without a WebView or embedded Node server. The UI is separate from React; storage compatibility and transfers are shared at the schema/file level. Android Gradle Plugin 8.9.3 follows the [official compatibility requirements](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
