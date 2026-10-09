# Dragon Turtle Ledger (龙龟账本) — Unified Backlog & Project Tracker

**Single source of truth for the backlog, priorities and phase plan.** Every chat in this project reads this doc before planning or building, and updates it when scope, status or priority changes.

**Master copy (since 2026-10-09, HM): this file on `main` in the public GitHub repo `huiminlatsg/dragon-turtle-ledger-app`.** It moved here, cleaned of family details, from the private repo `huiminlatsg/dragon-turtle-ledger`, which is now a read-only archive of the raw history data (B-30). The copies in the Claude and ChatGPT projects are read-only mirrors of `main`, refreshed from it. Always read the latest from `main`; never edit the mirrors.

**This repo is public.** Never write family details here: amounts, tax, loan or medical figures, member or property tags, names, schools, merchants tied to the family, card details. Describe such items generically and keep the detail in the private archive.

PR numbers up to #66 refer to the private repo; from 2026-10-09 on, PR numbers refer to this repo unless marked "private #n".

- Last full review: 2026-10-04
- Built from: `design/rtm.md` (requirements matrix, updated for v0.7.1) and saved project notes
- **Pending:** a first pass over all project chats is still needed. Rows marked "Unclear" need confirming from chat history.
- Related docs: `design/rtm.md` (requirements and gaps), `design/category-design.md` (category design of record; the full version with historical figures is in the private archive)
- Repo: https://github.com/huiminlatsg/dragon-turtle-ledger-app (public). Archive: https://github.com/huiminlatsg/dragon-turtle-ledger (private, read-only). Production app: https://dragon-turtle-ledger.vercel.app (old expensify-pi.vercel.app still works).

## How to update this doc (rules for every chat)

1. Read the latest version from `main` in the repo (fetch it, don't trust an earlier read) before editing, and re-read it right before you write. Another chat may have changed it.
2. Change only the rows your chat is responsible for. Never reorder or delete other rows.
3. Update a row's Status and "Updated" date when work starts, is blocked, or finishes. When something ships, add the version or PR.
4. New backlog items go at the bottom of the right tier with the next free ID (B-xx). Check for duplicates first.
5. Never delete an item. Move finished or dropped items to the "Done / Dropped" table with the date and reason.
6. Add one line to the Change log for every edit: date, chat topic, what changed.
7. Write to the doc only when backlog content actually changes. Don't rewrite it for formatting.
8. A decision that changes priority or phase scope goes in the Decisions section too, stating who decided (HM unless noted).
9. Keep it short. Detail belongs in the design docs, not here.
10. Edits go through the repo's normal flow: a `docs/<name>` branch from `main` and a PR, merged only when HM says "merge". An edit counts as made only once merged; until then say "pending in PR #n". Put the PR number in the Change log line. (HM may relax this for tracker-only edits.)

Statuses: Open · In progress · Blocked · Unclear (needs confirming) · Done · Dropped
Tiers: **P0** blocker or must-do before go-live · **P1** high value, next · **P2** planned · **P3** nice-to-have or later

## Phase plan

Phase definitions come from the implementation plan; update them here if the plan changes.

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Foundation plus B-04 min-spend dashboard, reports, CSV export and period aggregation | In progress |
| Phase 2 | *Scope to be confirmed after B-04 moved to Phase 1* | Not started |
| Phase 3 | Historical data import and October 2026 back-fill (B-03, B-05) | Not started |
| Phase 4 | *Fill in from the implementation plan chat* | Unclear |
| Phase 5 | Reminders and alerts, budgets UI, statement import, bank statement reconciliation, storage buckets | Not started |
| Later | Automated capture, Databricks analytics, investment accounts and other late items | Backlog |

**Recommended next work (2026-10-07):** B-04 is now part of Phase 1 and remains the top backlog priority. B-03 (history import) and B-05 (October 2026 back-fill) are in Phase 3. B-03 preparation already has a reviewed dry run from PR #46; actual import remains pending.

## Backlog (sorted by priority, highest first)

| ID | Item | Tier | Phase | Status | Depends on | Source | Updated |
|---|---|---|---|---|---|---|---|
| B-29 | GitHub Actions minutes: the free 2,000/month ran out on 2026-10-08 after 6 days (2,070 billed per GitHub; job-level estimate about 2,030 billable from about 990 real minutes, as per-job rounding roughly doubles it). Actions was blocked (no CI, no production migrations, no nightly backup) until HM set a small budget; jobs resumed the same day. Fix in PR #64: one CI job instead of five, no CI for docs-only changes or draft PRs, database suites only when `supabase/` changes, Deployment check on production only, Vercel skips docs-only builds (but builds when it has no baseline), docs-only changes still get a secret scan, Dependabot monthly without auto-rebase, lockfile committed with each dependency or version change (automatic lockfile workflow replaced by a manual repair workflow). Also restores the action versions from #12 that stale PR #52 reverted. HM set a small Actions budget on 2026-10-08 (whether it hard-stops usage is unverified). CI run on this branch passed in one job (about 4 billed minutes against roughly 7–8 before); a manual backup run succeeded. PR #64 merged 2026-10-08 as `ec46952`; main CI, secret scan and production deployment check green; real savings to be measured over a full month. **2026-10-09:** Actions disabled in the private repo; code, CI and deploys moved to this public repo, where standard runners are free (B-30). No automatic backups (HM decision) | P0 | n/a | Done | none | GitHub billing screenshot 2026-10-08 | 2026-10-09 |
| B-30 | Move to the public repo `dragon-turtle-ledger-app`. Done 2026-10-09: clean one-commit snapshot (privacy guard in CI, IDs in secrets), public with secret scanning, push protection and a `main` ruleset; 8 secrets added and checked on staging and production; Vercel deploys from here; full CI green. The production check also applied the `expense_templates` migration that had failed on private #52's merge (additive; the app expected it since 2026-10-08). Private PRs #53 and #63 ported as PRs #1 and #2 (pending); project docs moved here cleaned (PR #3). Remaining: port private #60/#61, mark the private repo as archive, refresh the AI mirrors and instructions. Full plan in the private repo, `docs/public-repo-migration.md` | P0 | n/a | In progress | none | HM request 2026-10-09 | 2026-10-09 |
| B-28 | Stabilisation gate from ChatGPT's audit (private #63, 2026-10-08): Actions failing before steps, `expense_templates` migration missing in production, category seeder callable by clients, non-atomic reimbursement edit; HM froze feature merges until resolved. **2026-10-09:** Actions run again (public repo, CI green); production migration applied; seeder lock-down and strict dates in PR #2. Still open: reimbursement-edit atomicity (P1), records list capped at 300 a month (P2), Supabase advisor findings to review | P0 | 1 (stabilisation) | In progress | none | HM audit/freeze request 2026-10-08; private #63 | 2026-10-09 |
| B-04 | Min-spend dashboard, reports, CSV export; period aggregation (D2, R9.2) | P1 | 1 | Open | B-01 | RTM D2, R9.2 | 2026-10-07 |
| B-03 | Import 2024–2026 monthly history using the old → new mapping (D5). Dry run and reconciliation prepared in PR #46 (import candidates through Sep 2026); storage/UI support, destination checks and actual import remain | P1 | 3 | In progress | B-01, B-02 | RTM D5 | 2026-10-07 |
| B-05 | Back-fill October 2026 history: re-screenshot, convert at that day's rate, add the listed recurring items (D11) | P1 | 3 | Open | B-03 | RTM D11 | 2026-10-07 |
| B-07 | Monthly/yearly recurring bills, optional end date, future-only revisions, due bill confirmation/skip and replay protection; staging build in private #53 (v0.22.0); ported as PR #1 (feature only: #53 also reverted the live session-cookie fix, which was left out), CI green, pending HM testing and the B-28 freeze | P1 | after B-01; staging advanced by HM | In progress | B-01 | HM request 2026-10-07; PR #53 | 2026-10-09 |
| B-08 | Private storage buckets for statements and receipts, family-scoped policies (G6). **Receipts bucket done in v0.19.0 (PR #41); the statements bucket remains for B-10** | P2 | 5 | Open | none | RTM G6 | 2026-10-07 |
| B-09 | Due-date and annual-fee reminders, low-balance alerts, budgets UI (D3) | P2 | 5 | Open | B-04 | RTM D3 | 2026-10-04 |
| B-10 | Statement PDF/CSV import and auto-matching (D4) | P2 | 5 | Open | B-08 | RTM D4 | 2026-10-04 |
| B-11 | Bank statement reconciliation resolves known history gaps (D12) | P2 | 5 | Open | B-03, B-10 | RTM D12 | 2026-10-04 |
| B-21 | Dependabot PRs: #12 (GitHub Actions group) merged as `a827806` and #13 (@supabase/ssr 0.6.1 → 0.12.7, sign-in library) merged as `ad377df` on 2026-10-08 01:51 SGT by HM; main CI and deployment check green. Still open: HM to confirm Google sign-in works on production after the #13 bump (the tracker asked for a preview sign-in test before merging; none is recorded) | P2 | n/a | In progress | none | repo PR list | 2026-10-08 |
| B-13 | Member tag values (D7) | P3 | when needed | Open | none | RTM D7 | 2026-10-04 |
| B-14 | A household expense whose recording method changed in March 2026 is to be recorded as a bank account transfer (D9) | P3 | with bank accounts | Open | B-01 | RTM D9 | 2026-10-04 |
| B-15 | Investment account type or transfer kind for fund flows (D10) | P3 | late | Open | none | RTM D10 | 2026-10-04 |
| B-16 | Design how to record a one-time loan repayment (D13) | P3 | later | Open | none | RTM D13 | 2026-10-04 |
| B-17 | Dividend income (股息分红) on the income screens (D14) | P3 | with income screens | Open | B-01 | RTM D14 | 2026-10-04 |
| B-18 | Automated capture: bank/card auto-import first, receipt photo OCR second (Gemini free tier OK; moved out of B-01 by HM 2026-10-05) | P3 | later | Open | B-01, B-08 | project notes | 2026-10-05 |
| B-19 | Databricks analytics on top of the reports | P3 | later | Open | B-04 | project notes | 2026-10-04 |
| B-22 | Explicit merchant/account expense templates, optional category, exact matching and manual override; staging build in PR #52 (v0.21.0), pending HM testing | P2 | after B-01 | In progress | B-01 | HM request 2026-10-07; PR #52 | 2026-10-07 |
| B-23 | Per-transaction "exclude from reports" override (the old category-level flag was dropped in B-12; nature already decides what counts) | P3 | with reports | Open | B-04 | HM list 2026-10-05 | 2026-10-05 |
| B-24 | Memo / reference number (invoice or transaction reference) on transactions | P3 | later | Open | B-01 | HM list 2026-10-05 | 2026-10-05 |
| B-25 | Loan transaction type: not designed yet. Refund (negative expense) and reimbursement (income in 回款类) are already covered without new types | P3 | later | Open | none | HM list 2026-10-05 | 2026-10-05 |
| B-26 | Multi-currency account balances: the balance view uses `amount` only when the transaction currency equals the account currency, else `amount_sgd`, so a non-SGD account used in an SGD ledger (or the reverse) is not handled correctly. Also refunds (negative expenses) are not on the add screen yet | P2 | after B-01 | Open | B-01 | PR 2 design | 2026-10-06 |

| B-27 | Default card/account per exact sub-category: past two calendar months, >75% usage with at least 10 purchases; otherwise sub-category last-used account. Manual override preserved; PR #51 (v0.20.0), pending HM testing | P2 | after B-01 | In progress | B-01 | HM request 2026-10-08; PR #51 | 2026-10-08 |

## Done / Dropped

| ID | Item | Result | Date |
|---|---|---|---|
| G1–G3, G5 | Card statement status, payback pool, fee waiver link, rent in household income | Closed in v0.4.1 | 2026-10-03 |
| G4 | Category required on every expense and income | Closed in v0.7.1 (PR #23) | 2026-10-04 |
| D6 | Split historical 税费 | Done in the history data using actual GIRO amounts | 2026-10-04 |
| (D1 part) | Sign-in, family invite, accounts screens | Shipped v0.5.0–v0.7.0 | 2026-10-04 |
| B-06 | Rename to Dragon Turtle Ledger: in-app rename v0.9.3 (PR #27), new web address v0.9.4 (PR #28), docs/repo v0.9.5 (PR #29); repo, Vercel and Supabase project names per repo CLAUDE.md. Sign-in confirmed on the new address (incognito) | Done | 2026-10-04 |
| (branding) | Dragon-turtle mascot as the app icon and header logo | Shipped v0.10.0 (PR #30, squash-merged, all checks green); live in production | 2026-10-04 |
| B-20 | Confirm v0.10.0 is live in production | Done: HM's iPhone screenshot at 22:16 SGT shows Version 0.10.0 (b4d722c), production, Database Connected, turtle logo in the header (earlier v0.9.5 reads were stale caches) | 2026-10-04 |
| B-12 | Drop deprecated `categories.is_excluded_from_reports` (D8) | Done: v0.10.1 (PR #31, squash-merged on HM's go-ahead; CI, production migration and deployment check green). Nothing in the app read the column; DB test now asserts it is gone | 2026-10-04 |
| B-02 | Seed 医疗健康 / 体检 category | Done: v0.10.2 (PR #32, squash-merged on HM's "merge"; CI, production migration and deployment check green). Existing families backfilled, new families seeded; unblocks B-03 once B-01 is done | 2026-10-04 |
| B-01 | Entry screens (ledgers, expense, paid-back part, income and transfer, records list and delete, edit, last-used defaults), plus refunds linked to any spend and receipt photos | Done: PRs #33–#41 merged as v0.11.0–v0.19.0 on HM's "merge" (#36–#41 on 2026-10-07; CI, production migration and deployment check green). Includes the default Cash account for every family, refunds in parts (#40, v0.18.0) and receipt photos (#41, v0.19.0) | 2026-10-07 |

## Decisions log

| Date | Decision | By |
|---|---|---|
| 2026-10-04 | History converts at one fixed rate for 2024–2025 and 2026 Jan–Sep (rate in the private archive); the pre-go-live October summary uses that day's rate | HM |
| 2026-10-04 | Rent stays out of household income and is tracked only under its rental property | HM |
| 2026-10-04 | Project renamed Dragon Turtle Ledger (龙龟账本), replacing "expensify" | HM |
| 2026-10-04 | PRs are merged only when HM says "merge" | HM |
| 2026-10-05 | Receipt OCR moves out of B-01 into B-18 (automated capture) | HM |
| 2026-10-05 | Foreign currency: optional foreign amount and currency are stored for information only, no stored FX rates (the "amount stays in SGD" part was refined the same day by the ledger-currency decision below) | HM |
| 2026-10-05 | B-01 starts with the ledger structure and screens (one level up the data hierarchy), then expense entry | HM |
| 2026-10-05 | A rental ledger has exactly one property, which is just a tag created together with the ledger (no separate property screen) | HM |
| 2026-10-05 | Every ledger has a currency; amounts are entered in the ledger currency, plus an optional foreign amount in a foreign currency | HM |
| 2026-10-05 | Accounts are shared by all ledgers of a family: a card's billing, balance and min-spend combine every ledger, while expense reports stay separate per ledger | HM |
| 2026-10-05 | Accounts and Ledgers live under Family (Home → Family), not in the top bar or on Home | HM |
| 2026-10-05 | Home shows the family name as a link to the Family page; an account with no family is sent to "Set up your family" | HM |
| 2026-10-06 | In a non-SGD ledger, HM types the SGD amount on each entry (no rate per ledger); the entry form needs an SGD amount field for non-SGD ledgers | HM |
| 2026-10-06 | Add expense: merchant is optional; foreign currency fields stay hidden until HM ticks "Paid in a foreign currency", then currency and amount are required | HM |
| 2026-10-06 | Foreign currency is chosen from a dropdown: USD, GBP, EUR, MYR, CNY first, then AUD, CAD, HKD, JPY, THB (ten in all) | HM |
| 2026-10-06 | Expense, income and transfer share one Add screen with a switch at the top | HM |
| 2026-10-06 | A payback settles only the part it covers: a claim becomes Received only when its paybacks add up to the claimed amount (not on the first payback); a payback larger than the claims ticked asks for confirmation | HM |
| 2026-10-06 | No account on an expense or income means Cash; paybacks, refunds and rent can be received in cash. The old "needs the account that received the money" rule is removed. Transfers still need both accounts | HM |
| 2026-10-06 | Income's "Received in" starts on the family's Cash account, unless another account is chosen | HM |
| 2026-10-07 | Every family starts with a Cash account (现金): new families automatically, existing families without one are backfilled | HM |
| 2026-10-07 | The GitHub repo (`main`) is the master copy of the project docs: `pm/` and `design/`. The Claude Project copies are read-only slave mirrors of `main`, refreshed from it; chats read the latest from `main` | HM |
| 2026-10-07 | Edit, delete and defaults go ahead as three stacked PRs (5a delete, 5b edit, 5c defaults) on Claude's best judgement: the record's type can't change on edit; ledger changes only within the same currency; expense "Paid from", transfer accounts and the ledger start on the person's last-used values; income stays on Cash | Claude (HM: "best knowledge") |
| 2026-10-07 | B-07 (recurring expenses) is not built yet and is to be built after B-03 (history import) | HM |
| 2026-10-07 | In every chat, every state-changing action is recorded in the tracker and sync files on GitHub in the same chat (PR flow, merge only on "merge"), and each tool refreshes its own mirror after merge | HM |

| 2026-10-07 | Execute B-03 preparation first: validate and review the historical batch before any production import. Merge and production data changes retain separate explicit authorization | HM |

| 2026-10-07 | Build three separate features in staging now: B-07 recurring expenses with future-only changes, B-27 usage-based card defaults, B-22 explicit merchant/account templates. This advances recurring staging work ahead of B-03. No production merge or import is authorized | HM |
| 2026-10-07 | Move B-03 and B-05 to Phase 3; make B-04 the top backlog priority and move B-04 to Phase 1 | HM |

| 2026-10-08 | B-27: use the exact sub-category’s past two months; >75% card/account usage when count is at least 10, otherwise its last-used account. Cash/bank accounts qualify; manual override preserved. PR #51 | HM |
| 2026-10-08 | Freeze further feature commits/merges until repository-wide code review and outstanding errors, CI checks, production migration and security issues are resolved. Stabilisation corrections may be proposed via PR, but no direct production changes or further feature merges without verification and authorisation (recorded by ChatGPT in private #63, not merged there) | HM |
| 2026-10-08 | No log-only PRs: never open a PR just to record another PR's merge, a check result or a status change; the record goes in the next PR that has a real reason to exist. Do only necessary actions, nothing redundant. small Actions budget set | HM |
| 2026-10-08 | CI no longer runs again on `main` after a merge (option B): the PR was just tested, the production Deployment check covers the live result, and CI is run by hand on `main` only when intervening changes invalidate the PR run's evidence, or after a migration, security change, conflict resolution or authorized direct push; post-merge verification covers only the checks that apply (refined after ChatGPT's review) | HM |
| 2026-10-09 | B-30: app code moves to a new public repo `dragon-turtle-ledger-app` built from one clean allowlisted commit; the private repo keeps its name and is not flipped public (history, closed PRs, logs and artifacts can't be reliably scrubbed) | HM |
| 2026-10-09 | Public repo: no license (all rights reserved); outsiders read-only (issues, wiki, projects, discussions off; outside PRs never run workflows without approval) | HM |
| 2026-10-09 | Public repo: Supabase project IDs kept in settings, production web address stays visible; commits use HM's GitHub private (no-reply) email | HM |
| 2026-10-09 | Open PRs #53, #60–63 closed (branches kept); Claude ports #53, #63, #60, #61 to the public repo, #53 and #63 first because staging already has their migrations; #62 dropped | HM |
| 2026-10-09 | Actions disabled entirely in the private repo (zero minutes); no automatic backups. One-off manual backup or account loading by re-enabling Actions there temporarily | HM |
| 2026-10-09 | All work moves to the public repo, including the project docs (tracker, sync rules, RTM, category design) cleaned of family details. The private repo becomes a read-only archive of the raw history data and the full design doc, opened only when the history import (B-03, B-05) needs it | HM |

## Open questions for HM

1. ~~Is B-07 (recurring expenses) already done or scheduled?~~ Answered 2026-10-07: not built; build after B-03.
2. What do Phases 3 and 4 contain in the implementation plan?
3. Package name in `package.json` is still `expensify` (IDs and code name left unchanged on purpose per repo notes). Rename, or leave?
4. ~~Who supplies the SGD amount for a non-SGD ledger paid with an SGD card?~~ Answered 2026-10-06: HM types the SGD amount on each entry.
5. ~~Next build: B-03 (history import) first, or B-04 (dashboard and reports) first?~~ Answered 2026-10-07: HM authorized starting B-03 with a reviewable dry run before any production import. B-07 remains sequenced after B-03.
6. B-21: should Claude test the Dependabot PRs #12 and #13 (Google sign-in on the preview) before Phase 2 starts?
7. ~~B-29: Actions is blocked until 1 Nov, so the nightly production backup is not running. Set a small Actions budget, or accept no backups until 1 Nov?~~ Answered 2026-10-08: HM set a small Actions budget.

## Change log

| Date | Chat | Change |
|---|---|---|
| 2026-10-04 | Project management setup | Created tracker from RTM v0.7.1 and project notes; chat review still pending |
| 2026-10-04 | Sign-in on new address / PR #30 merge | B-06 moved to Done (rename complete); logged PR #30 mascot v0.10.0 as shipped; repo link updated to dragon-turtle-ledger; added open question on package name |
| 2026-10-04 | Deployment status check | Added B-20 (confirm v0.10.0 live in production) and B-21 (open Dependabot PRs #12, #13); PR #30 row reworded to "merged" pending B-20 |
| 2026-10-04 | Production check | B-20 moved to Done: v0.10.0 (b4d722c) confirmed live on production by HM's screenshot; PR #30 row marked live |
| 2026-10-04 | Phase 1 implementation | B-12 moved to Done: PR #31 merged as v0.10.1 (done on its own, not bundled with B-02) |
| 2026-10-04 | Phase 1 implementation | B-02 In progress: PR #32 (v0.10.2) opened by Claude at HM's request, checks green, not merged yet |
| 2026-10-04 | Phase 1 implementation | B-02 moved to Done: PR #32 merged as v0.10.2 on HM's "merge"; next-phase note updated (only B-01 left in Phase 1) |
| 2026-10-05 | B-01 scoping | B-01 scope and PR order recorded; receipt OCR and auto-import folded into B-18; added B-22 to B-25 from HM's feature list; three decisions logged |
| 2026-10-05 | B-01 PR 1 | B-01 In progress: PR #33 (v0.11.0, ledgers) opened, checks green, not merged; three decisions logged (property tag, ledger currency, shared accounts); open question 4 added |
| 2026-10-05 | B-01 PR 1 | Navigation change added to PR #33 on HM's request: Accounts and Ledgers moved under Family; checks green, still not merged |
| 2026-10-05 | B-01 PR 1 | Home change added to PR #33 on HM's request: with a family, Home shows the family name as a link to Family; with no family it already redirects to "Set up your family"; checks green, still not merged |
| 2026-10-06 | B-01 PR 1 | PR #33 merged as v0.11.0 on HM's "merge" (ledgers, ledger currency, Accounts and Ledgers under Family, Home family link); CI, production migration and deployment check green. Open question 4 answered: HM types the SGD amount. Next: B-01 PR 2 (expense entry) |
| 2026-10-06 | B-01 PR 2 | B-01 PR 2 (expense entry, v0.12.0) opened as PR #34, checks green, not merged; added B-26 (multi-currency account balances, refunds); decision logged (merchant optional, foreign fields on demand) |
| 2026-10-06 | B-01 PR 2 | PR #34 merged as v0.12.0 on HM's "merge" (add expense, optional merchant, foreign currency on demand from a 10-currency dropdown: USD GBP EUR MYR CNY, then AUD CAD HKD JPY THB); CI, production migration and deployment check green. Next: PR 3 (recoverable amount and status) |
| 2026-10-06 | B-01 PR 3 | B-01 PR 3 (paid-back part and status on Add expense, v0.13.0) opened as PR #35, checks green, not merged |
| 2026-10-06 | B-01 PR 3 | PR #35 merged as v0.13.0 on HM's "merge" (paid-back part and status; refused entries keep what was typed and mark the field at fault; "Saved" shows once); CI and deployment check green (no database change, so no migration run). Next: PR 4 (income and transfer) |
| 2026-10-06 | B-01 PR 4 | B-01 PR 4 (income and transfer behind an Expense / Income / Transfer switch, v0.14.0) opened as PR #36, checks green, not merged; HM chose one screen with a switch |
| 2026-10-06 | B-01 PR 4 | PR #36 extended on HM's feedback: part paybacks (migration `20261006190000`), cash receipts (`20261006200000`), confirmation for oversize paybacks, Income starts on the Cash account; checks green, still not merged |
| 2026-10-07 | B-01 PR 4 | PR #36 extended: every family starts with a Cash account (migration `20261006210000`, backfills existing families); checks green, still not merged |
| 2026-10-07 | B-01 PR 5 | B-01 PR 5 built as three stacked PRs: #37 records list and delete (v0.15.0), #38 edit (v0.16.0, migration `20261006220000`), #39 last-used defaults (v0.17.0); all open, checks green, not merged; four decisions logged; still open: refunds / linking a refund to ordinary spend (B-26), B-08 placement |
| 2026-10-07 | Project docs to GitHub | Project docs mirrored into `pm/` and `design/` on branch `docs/project-context-sync`; HM made the repo the master copy; rule 1 changed and rule 10 added; decision logged; pushed to `main` directly at HM's explicit request (PR API unavailable) |
| 2026-10-07 | Project docs made slave copies | Project copies of the 5 docs refreshed from `main` with a read-only banner; Project instructions rewritten so every chat fetches the latest from `main` |
| 2026-10-07 | B-01 complete | PRs #36–#41 merged in order on HM's "merge" (v0.14.0–v0.19.0); B-01 moved to Done; B-08 narrowed to the statements bucket (receipts bucket shipped); Claude, docs PR pending |
| 2026-10-07 | Status review | Phase 1 row and "Recommended next phase" brought up to date (B-01 done; B-03 and B-04 unblocked); open questions 5 and 6 added; RTM D1 row and header note updated; Claude, PR #43 |
| 2026-10-07 | B-07 | B-07 moved from Unclear to Open, phase "after B-03" (HM: not built yet, build after B-03); decision logged; open question 1 answered; Claude, PR #44 |
| 2026-10-07 | Sync rule | "Keep GitHub in sync, every chat, every action" rule added to `pm/project-instructions.md`, `pm/SYNC.md` and `CLAUDE.md`; decision logged; Claude, PR #45 |
| 2026-10-07 | B-03 dry run | B-03 In progress: local validator, manifest, report and 16 passing tests prepared in PR #46 (final-head CI green; preview deployed, protected-preview smoke tests skipped); candidates, exclusions and provisional October rows counted (detail in the private archive); actual import still pending. Branch refreshed with main through PRs #44/#45; decision and open question 5 updated; ChatGPT, implementation PR #46 / tracker PR #47 |
| 2026-10-07 | Repo name fix | Old repo name `huiminlatsg/expensify` replaced by `huiminlatsg/dragon-turtle-ledger` in the tracker, `pm/SYNC.md` and `pm/project-instructions.md`; Claude, PR #48 |
| 2026-10-07 | Merges | PRs #46 (B-03 dry run tooling, v0.19.1), #47 (B-03 tracker status) and #48 (repo name fix) merged in that order on HM's "merge"; #46 and #48 reviewed by Claude, #47 conflict with #48 resolved by merging `main` into #48; CI and deployment check green on `main` (`9afcb37`); no database change, no data imported; Claude, PR #49 |
| 2026-10-07 | Recurring and expense defaults | B-07/B-22 In progress and B-27 added In progress at HM’s request. Separate stacked staging PRs #51 (usage, v0.20.0), #52 (templates, v0.21.0), #53 (recurrence, v0.22.0); final-head CI, staging migrations and deployment checks green. 154 unit tests, TypeScript, 19 Python tests and real staging recurrence assertions passed; shared staging reruns fixed and verified, both migrations installed. Protected-preview authenticated UI walkthrough remains for HM; no production changes. Testing guide: docs/STAGING-RECURRING-DEFAULTS.md. ChatGPT, tracker PR #54 |

| 2026-10-07 | Staging acceptance test execution | Recurring and template behaviors passed against live staging with rolled-back fixtures; card/template form interactions passed in disposable local browser fixture; 9 relevant unit tests passed. Signed-in deployed UI walkthrough blocked at Vercel login; no functional failures found, no production changes. Results: docs/STAGING-ACCEPTANCE-RESULTS.md. ChatGPT, PR #54 |
| 2026-10-07 | Phase reprioritization | Moved B-03 and B-05 to Phase 3; moved B-04 to the top of the backlog and into Phase 1. ChatGPT, PR #56 |
| 2026-10-07 | PR #56 merge | PR #56 squash-merged as `360baa6`; B-04 is now Phase 1/top priority and B-03/B-05 are Phase 3. Main deployment verification started and was still pending at time of logging. ChatGPT, PR #57 |
| 2026-10-07 | PR #49 merge | PR #49 (merge log for #46–#48) reviewed by ChatGPT and squash-merged on HM’s "Merge PR49" as `b5659f3`; main CI and production deployment check passed (runs 37606920106 / 37607008448); local ChatGPT tracker reference refreshed. No database migration or history import. ChatGPT, PR #50 |
| 2026-10-07 | PR #54 merge | PR #54 tracker, staging testing guide and acceptance results merged as ef7b31b on HM’s explicit instruction. CI and deployment check green on that main commit; docs-only, no migration. Feature PRs #51–#53 remain unmerged; protected-preview signed-in UI testing remains outstanding. ChatGPT, merge-log PR #55 |
| 2026-10-07 | PR #57 merge | PR #57 squash-merged as `221e949`; tracker merge log is now on main. Main deployment verification started and was still pending at time of logging. ChatGPT, PR #58 |
| 2026-10-08 | Pending PR check | B-21 updated: Dependabot #12 and #13 are merged (not open); production Google sign-in check after the @supabase/ssr bump still to be confirmed by HM; Claude, PR #59 |
| 2026-10-08 | B-27 threshold revision | Updated PR #51 to two-calendar-month, >75% account usage with a 10-purchase threshold and exact sub-category last-used fallback; complete paginated history, active Cash/bank/card accounts and revised tests/text. ChatGPT, PR #51; pending merge and signed-in staging testing |
| 2026-10-08 | Actions minutes | B-29 added (P0): Actions minutes exhausted, workflow changes to cut usage; open question 7 (Actions budget). Claude, PR #64 |
| 2026-10-08 | Actions minutes | B-29: lockfile is committed with each dependency or version change; the automatic lockfile workflow became manual repair (ChatGPT suggestion 6). Claude, PR #64 |
| 2026-10-08 | Actions minutes | B-29: ChatGPT review of PR #64 applied: Vercel builds when there's no earlier deployment, secret scan kept for docs-only changes, end-to-end tests skipped after earlier failures, draft wording narrowed, usage figures labelled as estimates; not yet verified by a real run. Claude, PR #64 |
| 2026-10-08 | Actions minutes | B-29: HM set a small Actions budget (open question 7 answered). Full CI run on this branch passed (one job, about 4 billed minutes); manual production backup succeeded, 30-day artifact kept. Moving the repo to a GitHub organization ruled out: Vercel Hobby can't deploy private organization repos. Claude, PR #64 |
| 2026-10-08 | Sync rule | Log-only PRs ended (decision logged); `pm/SYNC.md` now holds the shared Actions-minutes rules; CI and the docs secret scan no longer re-run on `main` after a merge; the previous merge (#64) is logged here. Claude, PR #65 |
| 2026-10-09 | Public repo plan | B-30 added (P0) with plan `docs/public-repo-migration.md`; five decisions logged; PRs #53 and #60–63 closed; B-07 and B-29 updated (Actions disabled here, no automatic backups); PR #65 merge recorded here. Claude, private #66 |
| 2026-10-09 | Move to public repo | Tracker moved to the public repo, cleaned of family details (B-14, B-16 reworded); B-30 progress; B-29 Done; B-28 added from ChatGPT's private #63 with its freeze decision, updated; B-07 ported as PR #1; decision logged (all work in the public repo, private repo as archive). Claude, PR #3 |
