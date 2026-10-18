# How changes are made

Changes are made by the owner (HM), mostly through Claude or ChatGPT in chat; the AI runs every step below and
merges only when HM replies "merge" (Claude specifics in CLAUDE.md). Outside pull requests aren't accepted.
This file holds the pipeline rules shared by both AI tools.

## Two repos

| This repo (`huiminlatsg/dragon-turtle-ledger-app`, public) | Private repo (`huiminlatsg/dragon-turtle-ledger`) |
|---|---|
| App code, generic parsing and calculation logic, migrations, access-control rules, tests with invented data, CI and deployment workflows, generic docs (`docs/`), these instructions | Backlog, requirements, decisions, full designs, the shared collaboration policy (`pm/SYNC.md`), project instructions, all family data and private operational tools. **Authoritative and active** (HM, 2026-10-18) |

Code changes come here; planning and decisions go to the private repo, in a companion PR only when a status,
scope, priority or decision actually changes. Never keep a tracker or requirements copy here. Qualify PR numbers
across repos: `app #n` for this repo, `private #n` for the private one.

## Every change

1. **Backlog item** — what and why, plus "done when", in the private tracker. Name it here by ID only (B-xx).
2. **Branch** — `feat/<short-name>`, `fix/<short-name>` or `docs/<tool>-<topic>` from the latest `main`. Never
   commit to `main` directly. Check open PRs first for work already underway.
3. **Pull request** — open it as a draft. When marked ready, CI runs unit tests, build, type check, iPhone-sized
   end-to-end tests, database security tests, a secret scan and the privacy guard, and database migrations are
   applied to **staging**.
4. **Preview** — Vercel posts a preview link (staging data). Try it on your iPhone.
5. **Merge** — only on HM's "merge" for that PR. Production deploys, migrations apply to the production database.
6. **Release** — bump `version` in `package.json` (and both `"version"` fields in `package-lock.json`), add a
   `CHANGELOG.md` entry in the feature PR, then tag (`git tag v1.1.0 && git push --tags`) and create a GitHub
   Release from the tag.

Before publishing or merging, refresh `main` and re-read files another session may have changed. Preserve both
sessions' accepted work, and check the diff does not revert recent changes on `main`. No direct production changes
(database, deployment, settings) without HM's explicit authorization; before any production database run, state
exactly which migrations it will apply.

## PR review workflow (HM, 2026-10-18)

Applies to PRs in both repos.

- A request to review a PR authorizes reviewing and committing focused fixes to that PR's existing branch,
  including a branch started by the other AI session. Never write to Dependabot or fork branches under this rule.
  An explicitly read-only review overrides this workflow.
- Refresh the base and PR head first, preserve concurrent accepted work, and review the final diff. Apply
  corrections within the PR's scope; don't implement a feature merely because its design PR is under review. Leave
  unresolved product choices clearly proposed.
- Validate locally, run the privacy guard and applicable checks, and push once per review round. Inspect workflow
  side effects before publishing or marking ready. Don't bypass a production-change restriction or a feature freeze.
- Keep one top-level review summary comment per reviewing agent on the PR: update it on later rounds (create it if
  absent). State the reviewed/resulting commit, key fixes, validation and limitations, remaining decisions or
  blockers, and what the next reviewer should inspect. Never include private samples or data.
- When fixes are complete, the branch is current and local validation passes, mark a draft PR ready for the next
  review round and inspect its checks. If blocked, leave it draft and explain the blocker in the summary. Ready for
  review is not approval to merge.
- Merging still requires HM's explicit "merge" for that PR. This workflow doesn't authorize production database
  writes, deployments or settings changes outside the normal PR pipeline.

## GitHub Actions

This repo is public, so standard GitHub-hosted runners are free. The habits are kept because they keep CI fast:

- Open every PR as a draft. Drafts run no CI and apply no migrations or settings to staging; **Vercel still
  deploys their previews against staging.** Mark ready only when the work should be tested. Validate locally
  first; push once per round of work, not once per edit.
- Check side effects before pushing: a non-draft PR updates shared staging (migrations, Supabase settings); a merge
  deploys production and runs production migrations.
- Before marking ready, if relevant changes landed on the base, bring the branch up to date (merge or rebase; for a
  stacked PR, onto its parent) without needless merge commits, and check the diff for unrelated files, especially
  `.github/`, `package.json` and `package-lock.json`.
- Docs-only changes (`pm/`, `docs/`, any `.md`) run no CI, only the secret scan and privacy guard. Vercel skips
  them when it has a valid earlier deployment to compare with; otherwise it builds.
- CI runs on PRs only, not again on `main` after a merge (HM, 2026-10-08). Before merging, confirm that PR
  validation still applies to the final changes and the current base. Run manual `main` CI (`workflow_dispatch`)
  when intervening changes invalidate that evidence, or when a migration, security, conflict-resolution or
  authorized direct-push change needs more validation. Don't repeat an equivalent completed check.
- After merging, verify only the applicable checks: the production Deployment check when something deployed,
  Database migrations when triggered, settings workflows when relevant.
- No blind retries: diagnose a failure first; retry only the targeted step once the cause is fixed or a transient
  failure is diagnosed. No empty commits.
- Commit `package-lock.json` with any `package.json` change. CI is one job; the database suites run only when
  `supabase/`, `scripts/db-test*` or `ci.yml` changed; manual runs do everything. Dependabot PRs are monthly and
  don't auto-rebase. "Lockfile repair" is manual.
- Never push to another session's branch except under the PR review workflow or HM's explicit authorization.
  Outside (fork) PRs never run workflows without HM's approval; never add `pull_request_target`. Public CI never
  downloads the private repo or real family data.

## Local development

```sh
npm install
cp .env.example .env.local     # fill in staging values
npm run dev                    # http://localhost:3000
npm test                       # unit tests
npm run test:db                # database migrations + security tests on a throwaway Postgres
npm run build && npm run test:e2e
python3 scripts/privacy-guard.py && python3 -m unittest discover -s tests/python
```

## Database changes

- Add a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a
  migration that has already been merged, even to remove text; propose a separate remedy instead.
- New tables must `enable row level security` and get policies using `public.is_member()` /
  `public.can_write()`, plus `revoke all ... from anon`. Check explicit grants as well as RLS: default grants depend on the project configuration. Grant only the
  operations each role requires.
- Add checks for the new behaviour to `supabase/tests/rls.test.sql`.
- Destructive changes (dropping a column) happen in two releases: stop using it, then drop it.

## Secrets

Secrets live only in Vercel, Supabase and GitHub settings, never in chat. `.env*` files are git-ignored and CI
scans every pull request for leaked keys. If a secret leaks, rotate it (docs/RUNBOOK.md).

## This repo is public

Everything here is public: files, history, PR text, comments, commit messages, Actions logs and bot comments.
Family data, spending history, planning notes and private import inputs or results never go here. Use invented data
in tests, fixtures and examples (comments and migration text included). `scripts/privacy-guard.py` runs on every pull
request and fails on:

- data and bank-export files (`.csv`, `.xlsx`, `.ofx`, `.qif`, `.pdf` and similar, history files);
- planning documents (anything in `design/`, `pm/` other than `pm/README.md`, trackers, requirements, project
  instructions, import designs and agent instructions);
- import payloads (`dtl-import` JSON) outside `tests/fixtures/`;
- personal email addresses, Supabase project addresses and IDs, and a short hashed list of private words.

Supabase project IDs live in GitHub and Vercel settings.
