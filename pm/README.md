# Project docs (master copy)

**These files are the master copy** of the project docs, on `main` in this public repo since 2026-10-09 (B-30). Read and edit them here, not in the Claude or ChatGPT projects. **This repo is public: no family details** (see `SYNC.md`, "Privacy").

| Path | What it is |
|---|---|
| `pm/backlog-tracker.md` | Backlog, priorities, phase plan, decisions, change log. Its own "How to update this doc" rules apply |
| `pm/SYNC.md` | Sync protocol for the GitHub master and the Claude and ChatGPT mirrors. Read by every tool |
| `pm/project-instructions.md` | The instructions for chats in the Claude Project |
| `pm/chatgpt-project-instructions.md` | The instructions for the ChatGPT project |
| `design/rtm.md` | Requirements traceability matrix and gaps |
| `design/category-design.md` | Category and data design of record (public version, without historical figures) |

**Private archive** (`huiminlatsg/dragon-turtle-ledger`, read-only): the raw 2024–2026 monthly history CSVs, the full category design with historical figures, the history import tools and reports, and the account-loading and backup workflows. Open it only when the history import (B-03, B-05) or account loading needs it.

**Editing:** use a `docs/<tool>-<topic>` branch and a PR, merged only when HM says "merge" (see `CLAUDE.md`).

**The Claude and ChatGPT project copies are read-only mirrors of `main`** (the `.md` files carry a banner saying so). They can lag behind `main`, so every chat reads the latest from GitHub first, and refreshes the mirror after a doc changes on `main`. Each project's custom instructions must match the text in `pm/project-instructions.md` or `pm/chatgpt-project-instructions.md`; HM pastes it in when it changes.
