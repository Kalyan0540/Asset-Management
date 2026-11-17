# ADR 002 — Deliver a self-contained desktop application

Date: 17 November 2026. Status: accepted for early desktop delivery; Android and sync remain unresolved platform work.

## Problem

The user is a designer, not a developer. A source repository and commands to run a local server do not meet their need to download and open an app. The first prototype made the data/agent contract testable but did not provide a desktop product.

## Decision

Package the existing interface and service with Electron 45. The Electron main process owns the local HTTP service and SQLite catalog, binds to a random loopback port, and opens the bundled interface in a sandboxed renderer with Node integration disabled. No separate Node installation is required. The existing browser-session and request-origin controls remain in place.

Store each library in a user-owned directory outside the installation. Default to the platform's application-data location. Expose library creation/opening, location, verified backup and restore through native menus. Restore always creates a separate library. Signed publisher identity and Apple notarization require credentials not present in this project; Mac packages use ad-hoc signing and are labeled as early unnotarized downloads.

Build on actual macOS Apple-chip, macOS Intel and Windows runners. Test the native runtime and packaged executable before uploading artifacts. Publish a prerelease with checksums only when all three packaging jobs pass. Git tags identify release source; a branch push builds candidate artifacts without publishing a release.

## Consequences

The user can install a desktop application without programming tools. The application is larger than a Tauri shell, but reuses the already tested service without introducing a second database engine. Browser rendering and native dialogs still require platform-specific acceptance tests beyond the automated smoke check.

This selects the current component-based route for early desktop delivery, rather than leaving the runnable app indefinitely as a comparison fixture. The TagSpaces/SiYuan study remains useful for feature design and selective reuse. No upstream application has been forked. The original Rust/Tauri proposal is superseded for this desktop release; it is not silently implemented elsewhere.

Electron does not supply Android support. Native Android must share the tested command/data contract through an appropriate portable engine or adapter and pass the original offline/capture gates. No claim of full cross-device architecture completion follows from desktop packaging.
