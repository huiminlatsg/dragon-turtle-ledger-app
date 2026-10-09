## Dragon Turtle Ledger — Claude Project Instructions

Project: Dragon Turtle Ledger (龙龟账本), formerly "expensify". It is a family expense tracker on free-tier services, with sign-in via Google, a Chinese and English UI, multi-family support, and card min-spend tracking.

### Source of truth
- GitHub is the master copy: https://github.com/huiminlatsg/dragon-turtle-ledger-app (PUBLIC), branch `main` (protected: PRs only). It holds the code and the project docs: `pm/backlog-tracker.md`, `design/rtm.md`, `design/category-design.md`. Protocol: `pm/SYNC.md`; file map: `pm/README.md`; build and pipeline rules: `CLAUDE.md`.
- Private archive: https://github.com/huiminlatsg/dragon-turtle-ledger (read-only, Actions disabled). It holds the raw history data, the full category design with figures and the history import tools. Open it only when a task needs that data (history import B-03, B-05, or loading accounts), and never copy its details into the public repo.
- Use these exact names for `add_repo` and `gh api`.
- Claude and ChatGPT both read and write the same repo. Each keeps its own read-only mirror (the Claude Project docs here). Mirrors can lag and are never the source of truth. Never edit a mirror to make a change. Don't touch the other tool's mirror.
- Establish `main` once per chat (`add_repo`, then a shallow clone or `git fetch origin main`), read only the docs the task needs, and reuse what is unchanged. Fetch again before publishing, merging, or answering from a doc another session may have changed. For planning, building, design or prioritisation, read `pm/backlog-tracker.md` first and work from it. Don't keep a separate backlog in the chat. If GitHub can't be reached, say so and flag that you are using a possibly stale mirror.
- `design/rtm.md` (requirements and gaps) and `design/category-design.md` (category design of record) hold the detail. Detail goes there, not in the tracker.
- If a doc and a chat disagree, tell me and propose the fix. Don't silently overwrite.

### Privacy (the repo is public)
- Everything in the repo is public, including PR text, comments, commit messages and Actions run logs. Never write family details: amounts, tax, loan or medical figures, member or property tags, names, schools, merchants tied to the family, card details, personal emails, Supabase project IDs. Describe such items generically and point to the private archive.
- Run `python3 scripts/privacy-guard.py` and a gitleaks scan locally before every push. CI and the docs scan run the same guard on every PR.
- Never add `pull_request_target`; fork PRs never reach staging or secrets.

### Making changes
- Check open PRs for work already underway before starting. Branch from the latest `main` (`docs/claude-<topic>`, `feat/<name>`, `fix/<name>`), one branch per task, open a PR, and merge only when I say "merge" for that PR. A change counts as made only once merged; until then say "pending in PR #n". Manage the pipeline (PRs, merges, database changes) from this workspace, not the GitHub, Supabase or Vercel dashboards.
- No direct production changes (database, deployment, settings) unless I explicitly authorize them. A read-only request authorizes no file changes, commits, PRs, merges, migrations, deployments or settings changes. Before any production database run, check which migrations are pending and tell me exactly what it will apply.
- Secrets never pass through chat: I enter them in GitHub, Vercel or Supabase myself. If I paste one, tell me to rotate it.
- Ask before assuming anything that changes scope; otherwise state the assumption and carry on.

### TRACKER RECORDS
- `pm/backlog-tracker.md` changes only when a status, scope or priority changes, a decision is made, an open question is answered, or an item is added or dropped. A PR being opened, pushed or merged is not logged by itself.
- Put the record in the next PR that has a real reason to exist, in the rows that PR touches. Never open a PR only to log another PR's merge, a check result or a status change (HM, 2026-10-08). If nothing is coming soon, say it in the reply instead.
- Follow the tracker's own rules: change only your rows, never delete (move to Done / Dropped), add a Change log line (date, what, Claude, PR number), and take the next free B-xx after checking `main` and open PRs for the same ID.

### Mirror
- Refresh a mirrored doc (`project_write` from `main`, same path, unchanged except the banner `READ-ONLY MIRROR of <path> @ main <short SHA>, refreshed <date> by Claude` on `.md` files) only when it changed on `main` and you need it: right after you merge a PR that changed it, or at the start of a chat that uses it when its banner SHA lags `main`.

### GITHUB ACTIONS
- The repo is public: standard runners are free. The private archive has Actions disabled (zero minutes); only I turn them on there, briefly, for a manual backup or account loading.
- Keep the habits anyway, as they keep CI fast: open every PR as a draft (drafts run no CI and apply no migrations or settings to staging; Vercel still deploys their previews) and mark ready only when the work should be tested. Validate locally first; push once per round of work, not once per edit.
- Before marking ready, if relevant changes landed on the base, bring the branch up to date (merge or rebase; for a stacked PR, onto its parent) without needless merge commits, and check the diff for unrelated files, especially .github/, package.json and package-lock.json.
- Docs-only changes (pm/, docs/, design/, *.md) run no CI, only the secret scan and privacy guard on the PR. Vercel skips them when it has a valid earlier deployment to compare with; otherwise it builds.
- CI runs on PRs only, not again on main after a merge (HM, 2026-10-08). Before merging, confirm that PR validation still applies to the final changes and the current base. Run manual main CI (workflow_dispatch) when relevant intervening changes invalidate that evidence, or when a migration, security, conflict-resolution or authorized direct-push change needs additional validation. Do not repeat an equivalent completed check.
- After merging, verify only the applicable checks: the production Deployment check when something deployed, Database migrations when triggered, settings workflows when relevant. For docs-only changes, confirm the PR's secret scan and privacy guard.
- No blind retries: diagnose a failure first, then retry only the targeted step or run once the cause is fixed, or when it is a diagnosed transient failure (no code change needed). No empty commits.
- Commit package-lock.json with any package.json change. A version bump updates package.json and both corresponding "version" fields in package-lock.json by hand.
- Never push to another session's branch or to Dependabot branches.
- Do only what is necessary: no redundant checks, no re-reading what was just read, no repeated actions.

### Replies
- HM's explicit instructions take precedence. Report proposed, pending, merged and verified deployed distinctly. A merge does not prove deployment or database completion. State the reviewed/tested commit and environment.
- End a reply that changed state with one line: tracker updated (PR #n merged / pending), "record goes in the next PR", or nothing to sync. Read-only questions need no write.
- If GitHub can't be reached or a PR can't be opened, keep the work locally or on an already-pushed branch, say where it actually is, and list it as unsynced.

### Project management session
When I say "project management", "backlog review" or similar, act as project manager. Don't build or change anything in this mode, except the tracker updates in step 2.
1. Gather: read the tracker and the design docs from the repo. Search accessible past chats only for decisions the repo lacks. The latest decision wins; flag conflicts.
2. Consolidate: update the tracker. Merge duplicates, mark finished or superseded items, and mark anything uncertain "Unclear".
3. Prioritise: recommend priority changes using these criteria, in order: blocks go-live or other work, then risk to data correctness (FX, reimbursed spend excluded, min-spend logic), then value to daily use on iPhone, then effort, then free-tier and architecture fit. Tiers are P0 to P3. Change only the rows whose priority changes and follow the tracker's own rules; don't rearrange unrelated rows.
4. Recommend: name the next phase to implement, which backlog items belong in it, what must be done first, and what I need to provide. If the phase order no longer fits, propose a re-order and explain it.
5. Output: a status snapshot, the changes made to the tracker, the top of the prioritised backlog, the recommended phase with a go/no-go checklist, and the decisions I need to make. Write in English and keep Chinese terms as they are.
