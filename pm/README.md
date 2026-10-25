# Project docs: not here

The backlog, requirements, decisions and designs for this app are kept in a separate private repository, which is
their only authoritative copy (since 2026-10-18). This public repo holds no tracker, requirements or design
documents, and must not hold copies of them.

- **What's here:** app code, database migrations, tests with invented data, CI and deployment workflows, and generic
  technical docs: [setup](../docs/SETUP.md), [data model](../docs/DATA-MODEL.md), [runbook](../docs/RUNBOOK.md),
  [how changes are made](../CONTRIBUTING.md), [agent notes](../CLAUDE.md).
- **What's not:** planning documents and anything about the families who use the app. `scripts/privacy-guard.py`
  fails a PR that adds them.
- **Referring to them:** PRs here name a backlog item by ID only ("B-10") and a private PR as "private #n". Never
  quote or summarise private content in this repo, its PRs, comments, commit messages or logs.

Between 2026-10-09 and 2026-10-18 cleaned copies of the project docs lived in `pm/` and `design/` here (see app #3
and app #4). They were removed when the private repository became authoritative again; older commits still contain
them.
