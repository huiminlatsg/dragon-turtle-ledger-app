# Dragon Turtle Ledger (龙龟账本)

Family expense tracker for a few families (each family sees only its own data): quick logging on iPhone, card
minimum-spend and bonus-cap tracking, and category reports. Runs on free tiers (Vercel, Supabase, GitHub).
Chinese and English UI; sign-in with Google.

| | |
| --- | --- |
| App | Next.js web app, installed to the iPhone home screen |
| Data | Supabase Postgres with row-level security: every row belongs to one family |
| Pipeline | GitHub Actions → Vercel previews (staging) → production |
| Live | https://dragon-turtle-ledger.vercel.app (invite only) |

This repo holds the app code and the project docs (`pm/`, `design/`). Family data and history are kept privately.

## Roadmap

| Release | Phase | What |
| --- | --- | --- |
| v0.1 | 0 | Skeleton, database schema, CI/CD |
| v0.2 | — | Several families, invite-only family creation, admin overview |
| v0.5 | 1 | Sign-in, family + member invites, admin page, cards, manual entry, recurring bills |
| v1.0 | 2 | Min-spend dashboard, reports, CSV export |
| v1.1 | 3 | Apple Pay auto-capture (iOS Shortcuts) |
| v1.2 | 4 | Bank email alert parsing |
| v1.3 | 5 | Receipt reading, statement import, alerts, budgets |
| v1.4 | 6 | Databricks analytics |

## Docs

- [Data model](docs/DATA-MODEL.md) — categories, ledgers, income, paybacks, report rules
- [Setup guide](docs/SETUP.md) — one-time accounts and settings
- [How changes are made](CONTRIBUTING.md) — branches, tests, releases
- [Runbook](docs/RUNBOOK.md) — rollback and recovery
- [Changelog](CHANGELOG.md)
- [Backlog](pm/backlog-tracker.md) · [Requirements](design/rtm.md) · [Category design](design/category-design.md)

## Layout

```
app/                  pages and API routes (Next.js App Router)
lib/                  shared logic: money parsing, min-spend periods, Supabase clients
supabase/migrations/  database schema, security rules, default categories
supabase/tests/       database security tests
tests/unit/           unit tests (Vitest)
tests/e2e/            end-to-end tests on an iPhone-sized screen (Playwright)
tests/python/         tests for the CI helper scripts
.github/workflows/    CI, migrations, settings, post-deploy checks, secret scan
docs/                 setup guide and runbook
```

## Contributions and reuse

This is a personal project shared for reference. Issues are off and outside pull requests aren't accepted.
To report a security problem, use **Security → Report a vulnerability** on this repo.

© HM (huiminlatsg). All rights reserved. No license is granted to copy, modify or distribute this code.
