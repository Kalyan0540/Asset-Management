# Where the project files live

Updated: 17 November 2026, during implementation. The earlier planning snapshot below explains why the first documents were initially absent from GitHub. The user has since authorized implementation and pushing the completed work.

## Current location

The files are in the remote cloud workspace used by this Codex chat:

```text
/workspace/Asset-Management/
  README.md
  docs/
    PROJECT_PLAN.md
    RESEARCH.md
    OPEN_SOURCE_OPTIONS.md
    FEATURE_BACKLOG.csv
    WORKSPACE_GUIDE.md
    IMPLEMENTATION_STATUS.md
    ADR-001-REFERENCE-PROTOTYPE.md
  src/                 # React interface
  server/              # SQLite, file storage, HTTP and MCP
  shared/              # Item and mutation contracts
  tests/               # Integration and browser checks
  package.json
```

This is a directory on the task's cloud machine. It is not automatically a directory on your laptop, and it is not the GitHub website. File links in the chat refer to that workspace. Open them in Codex; where the desktop client provides Save as/download, use it to save a copy locally.

A convenience archive of the earlier planning documents is also available at `/workspace/Asset-Management-planning.zip`, outside the Git repository. It excludes Git metadata and predates implementation; use the repository for the current source and documents.

## Why the first files were not visible on GitHub

This directory is already configured with this Git remote:

[Kalyan0540/Asset-Management](https://github.com/Kalyan0540/Asset-Management)

At the first planning snapshot, the branch was `work`, with no commits, and `README.md` and `docs/` were untracked. The remote URL identifies where Git can fetch or push; it does not turn on automatic upload.

Implementation now uses `feat/library-foundation`. The remote advertised no branch refs when checked before implementation. After the initial push, select this branch on GitHub to see both the documents and application code. The final chat delivery reports the verified push outcome and commit; local file creation alone is not evidence of publication.

## The normal workflow

1. **Edit/save:** files change in this cloud working directory.
2. **Commit:** Git records a named version locally. A commit alone is still only here.
3. **Push:** Git sends commits to a branch in the GitHub repository. You can then see them by selecting that branch on GitHub.
4. **Pull request, when appropriate:** review a proposed branch against an existing default branch. Pushing a branch does not automatically merge it into the default branch.
5. **Clone/pull elsewhere:** another computer obtains the committed files from GitHub. Uncommitted cloud edits are not included.

Before a first push, inspect the remote branch state so existing history is preserved. An empty remote may need an initial branch rather than a pull request. No force push or assumption about an empty remote is needed.

The deliverables now include a runnable local prototype and tests in addition to documents. There is no deployed public site, product sync server or native Android build. Run the source on your machine using the README instructions; a cloud development process is not automatically available from your laptop's `localhost`.

## Three different meanings of cloud

| Place | Purpose | What it currently contains |
|---|---|---|
| Codex cloud workspace | A remote working machine for researching/editing/building | The source, tests and documents listed above |
| GitHub repository | Versioned project source and documentation after pushing | Delivery branch: `feat/library-foundation`; see final delivery for verified commit |
| Future library sync service | Sync your personal assets, notes and metadata across devices | Proposed architecture only; not implemented |

Publishing the project source on GitHub will not automatically upload your personal Eagle library. The future app's storage and synchronization need their own implementation and configuration. GitHub can review source and Markdown changes; it is not a replacement for conflict-safe live database or large-media synchronization.

Keep important work in a durable versioned location such as GitHub and/or download a copy. Do not treat a task workspace as the only long-term backup. Credentials, private libraries and model keys should stay out of the project source repository.
