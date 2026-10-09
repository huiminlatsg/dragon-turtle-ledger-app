# Sync protocol: GitHub master, Claude and ChatGPT mirrors

Read by every tool (Claude, ChatGPT, others) that works on the project.

## Roles
- **Master:** `main` on https://github.com/huiminlatsg/dragon-turtle-ledger-app (public, since 2026-10-09). Code, migrations and tests, plus the project docs in `pm/` and `design/`. Only changes merged to `main` count as made.
- **Private archive:** https://github.com/huiminlatsg/dragon-turtle-ledger (private, read-only, GitHub Actions disabled). It holds the raw 2024–2026 history data, the full category design with historical figures, the history import tools and the account-loading and backup workflows. Open it only when a task needs that data (history import B-03, B-05, or loading accounts), and never copy its details into the public repo.
- **Mirrors (slaves):** the Claude Project docs and the ChatGPT project files. Read-only copies of `main`. Each tool keeps only its own mirror. A mirror is a convenience for fast reading and can lag; it is never the source of truth and is never edited directly.

## Privacy: this repo is public
- Everything here is public, including PR titles and descriptions, comments, commit messages and Actions run logs.
- Never write family details: amounts, tax, loan or medical figures, member or property tags, names, schools, merchants tied to the family, card numbers or digits, personal emails, Supabase project IDs. Describe such items generically ("a recurring bank debit") and point to the private archive.
- `scripts/privacy-guard.py` runs on every PR (CI and the docs scan) and fails on data files, personal emails, Supabase project addresses and a hashed list of private words. Run it locally before pushing. It is a safety net, not a substitute for care.
- Keep IDs in GitHub secrets and Vercel settings; use invented test data.

## Reading
1. Before using any doc, read it from `main` (fetch or clone; ChatGPT through its GitHub connector). Don't trust an earlier read in the same chat.
2. If GitHub can't be reached, use the mirror and say it may be stale.
3. Every mirrored `.md` starts with a banner: `READ-ONLY MIRROR of <path> @ main <short SHA>, refreshed <date> by <Claude|ChatGPT>`. Compare that SHA with `main` to see if it lags.

## Writing
1. Branch from the latest `main`. Name it `docs/<tool>-<topic>`, `feat/<name>` or `fix/<name>`, for example `docs/claude-backlog-review`, so concurrent work is visible.
2. Change only the rows or sections you own. Never delete tracker items; move them to Done / Dropped.
3. Open a PR (`main` is protected: PRs only). HM merges only by saying "merge" in chat. A change is "pending in PR #n" until merged.
4. Tracker Change log line: date | what | tool | PR number. PR numbers up to #66 in older lines refer to the private repo.
5. New backlog IDs: take the next free B-xx after checking `main` and open PRs for the same ID. If two PRs collide, the later one renumbers.
6. If `main` moved while your PR is open, rebase or re-apply on the latest `main` before asking HM to merge. The later PR resolves conflicts, never overwrites. Check the diff does not revert recent changes on `main`.
7. Don't write to a mirror to "save" a change. A mirror changes only by refresh.

## Every chat, every action
- Applies to every tool (Claude, ChatGPT, others) in every chat. The tracker changes only when a status, scope or priority changes, a decision is made, an open question is answered, or an item is added or dropped (tracker row, Decisions log if a decision, Change log line with the PR number). A PR being opened, pushed or merged is already recorded by GitHub and is not logged by itself; it shows up in the row of the item it affects.
- **Never open a PR only to log another PR's merge, a check result, or a status change (HM, 2026-10-08).** Put the record in the next PR that has a real reason to exist: a feature PR updates the tracker rows it touches and logs the previous merge in the same PR. Until then say it in the reply ("merged; tracker update goes in the next PR"). A docs-only PR is for a real doc change, or when HM asks for one.
- Go through a PR as in Writing above. A change is "pending in PR #n" until HM says "merge" and it is merged.
- After a merge, CI does not run again on `main`. Verify only the applicable checks (see "GitHub Actions"). Refresh your own mirror of a changed doc only if the mirrored doc itself changed (see Refreshing a mirror). A docs-only merge deploys nothing; confirm the PR's secret scan and privacy guard and say so.
- Before any production database run, check which migrations are pending and state exactly what it will apply.
- End each reply that changed state with one line: tracker updated (PR #n merged / pending), "record goes in the next PR", or nothing to sync. Read-only questions need no write.
- If GitHub is unreachable or a PR can't be opened, keep the work locally or on an already-pushed branch, say where it actually is, and say it is unsynced.
- Do only what is necessary. Don't repeat a check that already passed, re-read what was just read, or take an action nobody needs.

## GitHub Actions
The same text is in both tools' project instructions.
- This repo is public: standard GitHub-hosted runners are free. The private archive has Actions disabled (zero minutes); only HM turns them on there, briefly, for a manual backup or account loading.
- Keep the habits anyway, as they keep CI fast: open every PR as a draft (drafts run no CI and apply no migrations or settings to staging; Vercel still deploys their previews) and mark ready only when the work should be tested. Validate locally first; push once per round of work, not once per edit.
- Before marking ready, if relevant changes landed on the base, bring the branch up to date (merge or rebase; for a stacked PR, onto its parent) without needless merge commits, and check the diff for unrelated files, especially .github/, package.json and package-lock.json.
- Docs-only changes (pm/, docs/, design/, *.md) run no CI, only the secret scan and privacy guard on the PR. Vercel skips them when it has a valid earlier deployment to compare with; otherwise it builds.
- CI runs on PRs only, not again on main after a merge (HM, 2026-10-08). Before merging, confirm that PR validation still applies to the final changes and the current base. Run manual main CI (workflow_dispatch) when relevant intervening changes invalidate that evidence, or when a migration, security, conflict-resolution or authorized direct-push change needs additional validation. Do not repeat an equivalent completed check.
- After merging, verify only the applicable checks: the production Deployment check when something deployed, Database migrations when triggered, settings workflows when relevant.
- No blind retries: diagnose a failure first, then retry only the targeted step or run once the cause is fixed, or when it is a diagnosed transient failure (no code change needed). No empty commits.
- Commit package-lock.json with any package.json change. A version bump updates package.json and both corresponding "version" fields in package-lock.json by hand.
- Never push to another session's branch or to Dependabot branches. Outside (fork) PRs never run workflows without HM's approval; never add `pull_request_target`.
- CI is one job. The database suites run only when `supabase/`, `scripts/db-test*` or `ci.yml` changed; run CI by hand (`workflow_dispatch`) for everything. Dependabot PRs are monthly and don't auto-rebase. "Lockfile repair" is manual.

## Refreshing a mirror
- Whoever sees that a doc changed on `main` (including the tool that just got "merge" from HM) refreshes **its own** mirror: copy the file from `main` unchanged, add the banner to `.md` files, update the SHA.
- Refresh a mirrored doc only when it changed on `main` and you need it: right after you merge a PR that changed it, or at the start of a chat that uses it when its banner SHA lags `main`. Docs nobody uses, and docs that did not change, are left alone.

## Conflicts and disagreements
- `main` wins over any mirror. If a chat's understanding differs from `main`, tell HM and propose the fix; don't silently overwrite.
- Between tools: the later merged change wins on a row; the Change log shows who changed what.
