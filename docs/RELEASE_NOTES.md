# Atlas 0.2.1 — early desktop release

This release turns the browser prototype into a downloadable desktop application for Apple-chip Macs, Intel Macs, and 64-bit Windows computers. The installer includes the runtime; no developer setup is needed.

**It is not the completed Eagle replacement.** This release is intended for trying a small personal library while the remaining platform, synchronization and advanced features are developed. Keep your originals and make backups.

This patch includes the bundled components’ license notices, available in **Help → Open-source Notices**.

## Included

- Desktop window, app icon, native library menus, and automatic local storage.
- Native library creation/opening, verified backups, and restore into a separate library.
- Denser gallery, adjustable thumbnails, sorting, multi-item selection and transactional bulk edits.
- Full-screen image/video/audio/note preview, arrow-key navigation and Space shortcut.
- Local Ollama AI suggestions for notes and supported images, review-before-apply, stale-result protection and revision history.
- Existing collections, tags, notes, relations, graph/table views, original export, recoverable trash and MCP access.

## Download

- Apple-chip Mac: `Atlas-0.2.1-mac-arm64.dmg`
- Intel Mac: `Atlas-0.2.1-mac-x64.dmg`
- Windows Intel/AMD: `Atlas-0.2.1-win-x64.exe`

[Simple installation and first-use instructions](https://github.com/Kalyan0540/Asset-Management/blob/feat/library-foundation/docs/GETTING_STARTED.md)

The early installers are not publisher-signed or Apple-notarized. macOS/Windows may show an unrecognized-developer warning. Follow the guide's normal operating-system options; do not disable system protection globally. The Mac packages use ad-hoc signing for executable integrity, which is not a verified Apple Developer identity. `SHA256SUMS.txt` records the published files' checksums.

## Still pending

Native Android, automatic cross-device sync, Chrome capture, Eagle import, hosted sharing, advanced tables/Markdown features, AI model installation, performance certification for large archives, publisher signing and Apple notarization.

AI integration is tested with a deterministic local model fixture. Actual suggestion quality and speed depend on the installed Ollama model and your computer. Automated desktop smoke checks open the app and verify local database writes/reads; they do not replace long-term testing on real personal libraries.
