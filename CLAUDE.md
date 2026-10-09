# Working on Dragon Turtle Ledger (龙龟账本)

Family expense tracker. Next.js on Vercel, Supabase Postgres, GitHub Actions. The code package name (`expensify`)
and some IDs are unchanged from the project's earlier name.

**This repo is public.** It holds the app code and the project docs (`pm/`, `design/`), cleaned of family details.
The raw history data, the full design doc and the history import tools stay in the private, read-only archive
`huiminlatsg/dragon-turtle-ledger` (its Actions are disabled). Never copy its details here: anything pushed here is
public, and `scripts/privacy-guard.py` fails PRs with data files, personal emails, project addresses or private
words. Rules for both AI tools: `pm/SYNC.md`; backlog: `pm/backlog-tracker.md`.

**Data model in one line:** a family = a row in `households` (UI says "family"); every data row carries
`household_id`; RLS confines each person to their own family. One family per person (`members.user_id` unique).
New families are invite-only (`create_family_invite`, admin only). App admins (`app_admins`) get headline
counts via `admin_overview()` and must never be given read access to other families' rows.

## How changes flow (HM manages everything through chat)

HM does not open GitHub, Supabase or Vercel for routine work. Claude runs the pipeline:

1. **Branch** from `main`: `feat/<name>`, `fix/<name>`, `docs/<name>`. `main` is protected: pull requests only.
2. **Build and test locally** where possible (`npm run test:db` works offline; npm may be blocked in the
   workspace, in which case CI is the test runner). Run `python3 scripts/privacy-guard.py` before pushing.
3. **Push and open a PR** via the REST API (`gh api repos/huiminlatsg/dragon-turtle-ledger-app/pulls ...`; GraphQL
   is blocked, so `gh pr create` doesn't work). Fill in the PR template. While still pushing fixes, open it as a
   **draft** (`-F draft=true`): drafts run no CI and apply no migrations or settings to staging. Vercel still
   deploys a draft's preview against staging, so a preview that needs an unapplied migration isn't ready for
   testing. Mark it ready when it should be tested (`POST .../pulls/<n>/ccr/ready_for_review`).
4. **Watch checks** with `gh api .../actions/runs?head_sha=<sha>`. Raw logs can't be downloaded from the workspace;
   read failures from annotations: `gh api .../check-runs/<job id>/annotations`. Steps wrapped in
   `scripts/ci-run.sh` attach the last 80 lines of output as an annotation. **Run logs are public**: never print
   family data, and keep secrets in `secrets.*` (GitHub masks them).
5. **Report to HM**: what changed, the Vercel preview link (from the vercel bot comment on the PR), and exactly
   what to tap/check on iPhone.
6. **Merge only when HM replies "merge"** in chat. Never merge on your own judgement, even when checks are green,
   and even for small fixes. Merge with `gh api -X PUT .../pulls/<n>/merge -f merge_method=squash`.
7. **After merge**: CI does not run again on `main`; verify only the applicable checks, then tell HM: the production
   *Deployment check* (health check reports `"database":"ok"`) when something deployed, *Database migrations* when
   triggered, the settings workflow when relevant.
8. **Releases**: bump the version in `package.json` and both corresponding `"version"` fields in
   `package-lock.json`, and CHANGELOG.md, in the feature PR itself.
9. **Keep the tracker in sync**: a change in status, scope, priority or a decision is recorded in
   `pm/backlog-tracker.md` (its own rules apply, and `pm/SYNC.md`) in the PR that has a real reason to exist, never
   in a PR opened only to log a merge, check or status (HM, 2026-10-08). Refresh the Claude Project mirror after a
   merge only if a mirrored doc changed. No family details in tracker text.

## GitHub Actions

Public repo: standard GitHub-hosted runners cost no Actions minutes. The habits from the private-repo days are
kept because they also keep CI fast and the queue short: drafts run nothing, one CI job, docs-only changes run
only the secret scan, database suites only when `supabase/`, `scripts/db-test*` or `ci.yml` changed, Deployment
check on production only. No blind retries: diagnose a failure first.

- Outside pull requests (from forks) never run workflows without HM's approval, and the migration and settings
  workflows skip them anyway. Never add `pull_request_target`.
- Dependabot is monthly and doesn't auto-rebase; comment `@dependabot rebase` before merging a stale one.
- If npm can't run after a dependency change, dispatch the "Lockfile repair" workflow on the branch, then run CI on
  it by hand (the repair commit doesn't start CI).

## Database changes

- New file per change in `supabase/migrations/` (`YYYYMMDDHHMMSS_what.sql`); never edit a merged migration.
- Applied automatically: staging when a non-draft PR is opened/updated or marked ready, production on merge
  (`db-migrate.yml`). Shared staging may hold migrations from other open PRs; `scripts/prepare_staging_migrations.py`
  adds throwaway placeholders for those in CI only.
- Supabase no longer exposes new tables to the API by default. Every new table needs RLS enabled, policies using
  `public.is_member()` / `public.can_write()`, `revoke all ... from anon`, and explicit grants to
  `authenticated` and `service_role`.
- Add tests for new behaviour to `supabase/tests/rls.test.sql`; run `npm run test:db`. Test data is invented.
- Loading accounts from JSON, backups and the history import are run from the private archive, never from here.

## Service settings as code

- Supabase project settings (Google sign-in; email sign-up off) live in `supabase/config.toml` and are
  pushed by `.github/workflows/supabase-config.yml` (`supabase config push`): staging on PR, production on merge.
- UI text lives in `lib/i18n.ts` (Chinese and English; a unit test checks both have every key). Category names
  stay Chinese. Don't ask HM to click through dashboards for things that can be code.
- Vercel needs no routine changes; it deploys every PR (preview → staging DB) and `main` (production DB), except
  docs-only commits, which `vercel.json` (`ignoreCommand`) skips.

## What still needs HM (and why)

- Approving merges ("merge" in chat) and checking previews on iPhone.
- Anything involving a secret (passwords, tokens, keys): HM enters these directly into GitHub/Vercel/Supabase
  settings. Secrets must never pass through chat. If HM pastes one, tell them to rotate it.
- Renewing the Supabase access token (GitHub secret `SUPABASE_ACCESS_TOKEN`) before it expires.
- Adding a new person's Google account as a **test user** in the Google Cloud project before they sign in
  (docs/SETUP.md Part 6).

## Workspace limits

- The workspace cannot reach `*.vercel.app` or `*.supabase.co`; verify through CI results instead.
- The proxy blocks GitHub repo-settings writes, branch deletion and Actions secrets; ask HM for those one-off clicks.

## Reference

- Production: https://dragon-turtle-ledger.vercel.app (old address expensify-pi.vercel.app still works).
  Supabase project IDs are in the GitHub secrets `SUPABASE_PROD_PROJECT_REF` and `SUPABASE_STAGING_PROJECT_REF`.
- Setup: docs/SETUP.md · Recovery: docs/RUNBOOK.md · Conventions: CONTRIBUTING.md
