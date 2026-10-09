Dragon Turtle Ledger — ChatGPT shared project workflow

This project is developed collaboratively by HM, ChatGPT/Codex, and Claude. Both AI sessions work with the same GitHub repository (since 2026-10-09):
https://github.com/huiminlatsg/dragon-turtle-ledger-app (PUBLIC; main is protected, PRs only)

A private, read-only archive https://github.com/huiminlatsg/dragon-turtle-ledger holds the raw history data, the full category design with figures and the history import tools. Its GitHub Actions are disabled. Open it only when a task needs that data (history import B-03, B-05, or loading accounts), and never copy its details into the public repo.

SOURCE OF TRUTH
- The public repository's main branch is the authoritative copy of accepted code, project documentation, requirements, decisions, and backlog.
- pm/SYNC.md contains the shared, agent-neutral synchronization and collaboration policy. pm/backlog-tracker.md is the authoritative backlog and status tracker. design/rtm.md and design/category-design.md hold requirements and the category design. CLAUDE.md and CONTRIBUTING.md hold the build and pipeline rules.
- ChatGPT and Claude project files, uploaded documents, local mirrors, memories, and previous conversations are reference snapshots. They may be outdated and must not override current repository content.
- HM's explicit instructions take precedence and can change requirements. Persist accepted decisions through the authorized repository workflow.
- GitHub records intended configuration. Actual deployment and database state must be verified separately before claiming something is live.

PRIVACY (THE REPOSITORY IS PUBLIC)
- Everything in the repository is public, including PR text, comments, commit messages and Actions run logs. Never write family details: amounts, tax, loan or medical figures, member or property tags, names, schools, merchants tied to the family, card details, personal emails, Supabase project IDs. Describe such items generically and point to the private archive.
- Run python3 scripts/privacy-guard.py before pushing where possible; CI runs it and a secret scan on every PR.
- Never add pull_request_target; fork PRs must never reach staging or secrets.

BEFORE WORK
- Establish current main once per chat and read only what the task needs: pm/SYNC.md, pm/backlog-tracker.md, applicable repository instructions, and relevant documents. Reuse unchanged reads. If pm/SYNC.md is missing, disclose this and use these instructions as the policy.
- Check relevant open PRs for work already underway by either session. Avoid duplicating existing work.
- State the branch or commit being reviewed or used as the starting point.
- If GitHub cannot be accessed, disclose that limitation. Snapshot-based analysis may continue with its source and age clearly stated, but do not claim it reflects current repository state.
- Follow the user's authorized task scope. Reading a policy or backlog does not itself authorize implementation, repository writes, or production changes. A read-only request authorizes no file changes, commits, PRs, merges, migrations, deployments, or settings changes.

COLLABORATION AND CHANGES
- Use a separate branch for each task, starting from current main unless deliberately extending an existing PR. Do not modify another session's branch unless HM authorizes it.
- Before publishing or merging, refresh repository state and re-read files another session may have updated. Resolve conflicts while preserving both sessions' accepted work. Keep edits focused, and check the diff does not revert recent changes on main.
- Submit code and documentation changes through a PR, unless HM explicitly authorizes an exception.
- Merge only when HM explicitly says "merge" for the relevant PR. Authorization for one PR does not authorize merging others.
- Check workflow side effects before pushing: a non-draft PR may update shared staging; merging may trigger production migrations or deployment.
- Do not perform direct production changes unless explicitly authorized by HM. Before any production database run, check which migrations are pending and state exactly what it will apply.
- Secrets never pass through chat. If HM pastes one, tell HM to rotate it.

TRACKER RECORDS
- pm/backlog-tracker.md changes only when a status, scope or priority changes, a decision is made, an open question is answered, or an item is added or dropped. A PR being opened, pushed or merged is not logged by itself.
- Put the record in the next PR that has a real reason to exist, in the rows that PR touches. Never open a PR only to log another PR's merge, a check result or a status change (HM, 2026-10-08). If nothing is coming soon, say it in the reply instead.
- Follow the tracker's own rules: change only your rows, never delete (move to Done / Dropped), add a Change log line (date, what, ChatGPT, PR number), and take the next free B-xx after checking main and open PRs for the same ID.

GITHUB ACTIONS
- The repository is public: standard runners are free. The private archive has Actions disabled; only HM turns them on there, briefly, for a manual backup or account loading.
- Keep the habits anyway, as they keep CI fast: open every PR as a draft (drafts run no CI and apply no migrations or settings to staging; Vercel still deploys their previews) and mark ready only when the work should be tested. Validate locally first; push once per round of work, not once per edit.
- Before marking ready, if relevant changes landed on the base, bring the branch up to date (merge or rebase; for a stacked PR, onto its parent) without needless merge commits, and check the diff for unrelated files, especially .github/, package.json and package-lock.json.
- Docs-only changes (pm/, docs/, design/, *.md) run no CI, only the secret scan and privacy guard on the PR. Vercel skips them when it has a valid earlier deployment to compare with; otherwise it builds.
- CI runs on PRs only, not again on main after a merge (HM, 2026-10-08). Before merging, confirm that PR validation still applies to the final changes and the current base. Run manual main CI (workflow_dispatch) when relevant intervening changes invalidate that evidence, or when a migration, security, conflict-resolution or authorized direct-push change needs additional validation. Do not repeat an equivalent completed check.
- After merging, verify only the applicable checks: the production Deployment check when something deployed, Database migrations when triggered, settings workflows when relevant.
- No blind retries: diagnose a failure first, then retry only the targeted step or run once the cause is fixed, or when it is a diagnosed transient failure (no code change needed). No empty commits.
- Commit package-lock.json with any package.json change. A version bump updates package.json and both corresponding "version" fields in package-lock.json by hand.
- Never push to another session's branch or to Dependabot branches.
- Do only what is necessary: no redundant checks, no re-reading what was just read, no repeated actions.

SNAPSHOTS
- ChatGPT and Claude each keep their own replaceable reference mirror, derived from GitHub, never a master document. Follow pm/SYNC.md for locations and refresh.
- Refresh a mirrored doc only when it changed on main and you need it. Label each snapshot with its repository path, commit SHA, and retrieval date. Label unmerged proposals with their branch or PR number and keep them separate from accepted snapshots.
- Do not maintain competing backlog, requirements, decisions, or synchronization policies in either AI project.
- Treat synced sources/ files as read-only. Do not edit, rename, move, or delete them.
- Do not claim mirrors are automatically synchronized unless a mechanism has been configured and verified.

STATUS AND HANDOFFS
- Report changes accurately as proposed, pending in PR #number, merged, or verified deployed. A local edit or open PR is not a completed update to main. A merge is not proof of a successful deployment or database completion. State the reviewed or tested commit and environment.
- Verify relevant checks and actual deployment or migration results before reporting something as shipped.
- Persist important decisions and handoffs in repository documentation or PR descriptions, without private details. Handoffs identify the backlog item, branch or PR, completed work, validation results, and remaining work.
- If GitHub is unreachable or a PR can't be opened, keep the work locally or on an already-pushed branch, say where it actually is, and report it as unsynced.
- Do not assume either session can see the other's conversation history. Use GitHub as the shared coordination record.
