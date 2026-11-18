# Atlas 0.3.0 — Eagle import

You can now copy an Eagle `.library` into Atlas from **Library → Import Eagle Library…**. Close Eagle first, choose its library folder, and choose a destination. Atlas creates a separate library and leaves the Eagle source unchanged.

Originals are hashed and verified, tags/annotations/dates are mapped, and nested folders become collection path names. Raw Eagle metadata is preserved. An import report lists missing files and unsupported features; thumbnails are never substituted for missing originals. Imports can be cancelled. See the [Eagle import guide](https://github.com/Kalyan0540/Asset-Management/blob/v0.3.0/docs/EAGLE_IMPORT.md) for compatibility limits. Tests use synthetic fixtures; private personal libraries have not been certified.

## Downloads

- Apple-chip Mac: `Atlas-0.3.0-mac-arm64.dmg`
- Intel Mac: `Atlas-0.3.0-mac-x64.dmg`
- Windows Intel/AMD: `Atlas-0.3.0-win-x64.exe`

Open the Mac DMG and drag Atlas into Applications, or run the Windows installer. No developer tools are required. Existing Atlas libraries remain outside the application and can still be opened. [Setup guide](https://github.com/Kalyan0540/Asset-Management/blob/v0.3.0/docs/GETTING_STARTED.md).

These early installers are not publisher-signed or Apple-notarized. The guide explains normal operating-system approval options without disabling protection globally.

## Android

A separate [Android preview](https://github.com/Kalyan0540/Asset-Management/releases/tag/android-v0.3.0-preview) provides an offline native library for files, notes, tags and collections. Use complete Atlas backup folders for manual transfers between desktop and Android. Import Eagle on desktop before transferring to Android. This does not merge simultaneous edits or provide automatic sync. The Android release is independently gated by its compile, lint and emulator checks.

Automatic device sync, Chrome capture, richer knowledge tools, real-world migration compatibility testing, production signing and Android feature parity remain pending.
