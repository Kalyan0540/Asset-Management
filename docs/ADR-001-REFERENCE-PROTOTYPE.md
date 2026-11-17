# ADR 001 — Build a reference prototype without closing the foundation decision

Date: 17 November 2026. Status: accepted for M0 exploration; production architecture remains open.

## Context

The user authorized implementation and pushing work to the existing GitHub repository. The planning study identified TagSpaces and SiYuan as useful whole-application candidates and AppFlowy as a mobile-oriented substitute. Their suitability for our specific media, Markdown, agents and Android contracts has not been established through builds or target-device tests.

The available working environment is Linux with Node 24 and Chromium. It can exercise a browser UI, local filesystem, database, HTTP and stdio agents. It cannot establish macOS/Windows packaging or native Android behavior merely by rendering a responsive page.

## Decision

Build one executable component-based reference slice with TypeScript, React and Node SQLite. It validates how a real original file, note, collection, relation, history record and MCP command share identity. Use existing table, graph and protocol libraries, retain original files, reject stale writes, and keep the service local.

Do not characterize this as a final fork-versus-composition decision. It is the executable baseline for that comparison. The previous stack table describes a possible production Rust/Tauri implementation; this Node service is not a hidden claim that Rust or native packaging was completed. A successful upstream candidate can replace the prototype, and a production composition route may retain or replace its engine after target-device evidence.

Keep the evaluation library outside version control. Persist a schema version, UUID item identity, explicit revisions, immutable binary hashes and exportable metadata so migration can be implemented and tested. No migration guarantee is made before the importer exists.

## Consequences

We now have a working fixture and observable API behavior instead of static screens. This exposes issues earlier, such as stale editor writes, authorization, unsafe inline preview formats and interrupted file imports. The code can become reusable product code when its relevant gates pass, but performance, native lifecycle and sync still require substantial work.

We accept some possible throwaway code to make the foundation decision concrete. There is one authoritative SQLite catalog and one command implementation in this prototype; the MCP adapter calls the service instead of writing its own database. There is no second sync/storage engine hidden behind the interface.

Do not extend this into a large production archive before resolving the M0 choice and storage/migration gates. See [implementation status](IMPLEMENTATION_STATUS.md) for exact current capabilities and limits, and [open-source evaluation](OPEN_SOURCE_OPTIONS.md) for the adoption gates.
