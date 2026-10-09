# Requirement traceability matrix — Expensify v0.7.1

> Public copy, cleaned of family details (2026-10-09, B-30). Historical figures behind D5, D6 and D9–D13 are in the private archive repo.

- Checked: 2026-10-03, against `main` @ `d20ec60` (v0.4.0). **Updated** after v0.4.1 (`b2097c7`, PR #17) was deployed: gaps G1, G2, G3 and G5 closed; card-fee requirements added.
- **Updated 2026-10-04** for v0.7.1 (PR #23, `9637018`, deployed to production): G4 closed; the eight requirements without a dedicated test now have one (136 checks). v0.5.0–v0.7.0 shipped sign-in, family setup and accounts screens (part of D1).
- **Updated 2026-10-04 (history data)**: D5 and D6 revised; D9–D14 added after the 2024–2026 monthly history was cleaned and stored (in the private archive repo).
- **Updated 2026-10-07** for v0.19.0: D1 screens complete (PRs #33–#41); G6 receipts bucket created in v0.19.0 (PR #41, migration `20261007020000_receipt_photos.sql`), statements bucket still open (B-08). Requirement rows and test counts above are as of v0.7.1 and not re-verified.
- Design of record: `design/category-design.md` (public summary of v8) plus decisions taken in chat; the full v8 with historical figures is in the private archive
- Method: read the deployed migrations; loaded them into a scratch Postgres, created a family and compared the seeded
  categories, ledger and views with the design; ran the database suite (105 checks at v0.4.0, 115 at v0.4.1, 136 at v0.7.1); probed edge cases the suite does not cover.

**Implementation files**
- M1 `20261002000001_initial_schema.sql` (v0.1) · M2 `20261003000001_multi_family.sql` (v0.2)
- M3 `20261003120000_category_redesign_ledgers.sql` (v0.3) · M4 `20261003150000_payment_methods.sql` (v0.4)
- M5 `20261003200000_rtm_fixes.sql` (v0.4.1) · M6 `20261003230000_members_can_invite.sql` (v0.5)
- M7 `20261004000001_category_required.sql` (v0.7.1)
- T = `supabase/tests/rls.test.sql` (check name quoted)

**Status:** ✅ implemented and tested · ☑️ implemented, not covered by a test · ⚠️ partial / gap found · ⏳ deferred by design (later phase) · 📄 documentation only

## Summary

| Status | Requirements |
|---|---|
| ✅ Implemented and tested | 77 |
| ☑️ Implemented, no dedicated test | 0 |
| ⚠️ Partial — gap open | 1 requirement (G6 — storage buckets, Phase 1/5) |
| ⏳ Deferred by design | 1 requirement + 14 later items (D1–D14) |
| 📄 Documentation only | 1 requirement + baseline and decision log |
| **Total requirements traced** | **80** |

Every in-scope data-model requirement is in production. Gaps G1, G2, G3 and G5 were closed in v0.4.1 and G4 in v0.7.1; only G6 is open.

## 1. Principles (§1)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R1.1 | Categories describe purpose only; merchant, card, person, property are separate fields | `transactions.merchant`, `account_id`, `transaction_people`, `property_id` (M1, M3); seed has no merchant-named categories | Seed dump | ✅ |
| R1.2 | Two levels: group → category, for expense and income | `categories.parent_id` + `tg_categories_two_levels` (M1, M3); child inherits `kind` | T "categories are at most two levels", "sub-categories share their parent's kind" | ✅ |
| R1.3 | Each group has a nature (spend: living / financial / pass-through; income: real / offset) | `categories.nature` + `categories_nature_on_top_level`, `categories_nature_matches_kind` (M3) | Seed dump; T "report shows the parent category's nature" | ✅ |
| R1.4 | Recoverable part recorded per expense; pool holds only that part; min-spend uses full amount | `recoverable_amount`, `v_recovery_pool`, `v_min_spend_lines` (M3) | T "pool holds only the recoverable parts", "min-spend counts card spend in full…" | ✅ |

## 2. Expense categories (§2)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R2.1 | 14 expense groups with the exact categories in §2 (incl. 住房/维修装修) | `seed_default_categories` (M3) | Seed dump matches §2 row for row | ✅ |
| R2.2 | Natures: 保险理财, 税费 = financial; 代付款 = pass-through; other 11 = living (其他 = living) | Seed values (M3) | Seed dump | ✅ |
| R2.3 | Trip-only group 旅行 (机票 · 住宿 · 签证保险 · 门票活动 · 伴手礼), living | Seed with `ledger_type = 'trip'`; trigger check (M3) | T "trip-only categories cannot be used in the daily ledger" | ✅ |
| R2.4 | Rental-only group 出租成本 (中介费 · 家具电器 · 清洁保养 · 租客杂费 · 出租其他), financial | Seed with `ledger_type = 'property'` (M3) | T "rental-only categories cannot be used in the daily ledger", "…in a trip ledger", "rental costs are financial spend tagged with the property" | ✅ |
| R2.5 | 课外班 one category; class identified by merchant | Seed + `merchant` field | Seed dump | ✅ |
| R2.6 | 超市 one category; store identified by merchant | Seed + `merchant` field | Seed dump | ✅ |
| R2.7 | Names in Chinese only | Seed (M3) | Seed dump | ✅ |
| R2.8 | 税费（历史未拆分）for imported history only | Seeded category (M3) | T "unsplit historical tax sits under 税费 as financial spend"; hiding it from new entries is an entry-screen rule | ✅ |
| R2.10 | Card fee categories 税费 / 卡年费 and 滞纳金利息 | Seed + backfill for existing families (M5) | T "new household gets 86 sub-categories" | ✅ |
| R2.9 | 代付款 classified by scenario (trip/advance meals and transport go here) | Seeded sub-categories (M3); classification is a user choice | — | 📄 |

## 3. Income categories (§3)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R3.1 | 4 income groups: 投资收入, 租金收入 (real; rental ledgers only); 回款类, 其他 (offset) | Seed (M3); 租金收入 `ledger_type = 'property'` (M5) | Seed dump; T "new household gets 4 income top-level categories" | ✅ |
| R3.2 | 回款类 includes 返现 (credit-card cash rebate) | Seed (M3) | Seed dump | ✅ |
| R3.3 | Every 回款类 income must name the receiving account | `requires_account` flag + trigger (M3) | T "paybacks need an account" | ✅ |
| R3.4 | Rent only in a rental ledger, carrying its property; never household income | `ledger_type = 'property'` on 租金收入 (M5); `requires_property` + ledger auto-tag (M3) | T "rent can only be recorded in a rental ledger (not household income)" | ✅ |
| R3.5 | Income and spend share one table; amounts always positive | `transactions.kind`, `transactions_amount_positive` (M3) | T "kind follows the category", "amounts must be positive" | ✅ |
| R3.6 | Offset income excluded from real income | `nature` on report view (M3) | T "household real income excludes paybacks and rent", "paybacks are reported separately as offsets" | ✅ |

## 4. Ledgers (§3a)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R4.1 | Every transaction belongs to a ledger; default 日常账本 per family | `ledgers`, `transactions.ledger_id`, trigger `households_default_ledger` (M3) | T "new household gets a default daily ledger", "transactions go to the default ledger", "invited family gets its own default ledger" | ✅ |
| R4.2 | Types daily / trip / property; trip has dates and default currency | `ledgers.type`, `start_date`, `end_date`, `default_currency` (M3) | T trip ledger insert | ✅ |
| R4.3 | Rental ledger is a separate P&L, excluded from household totals by default | `counts_in_household` default via `tg_ledgers_defaults` (M3) | T "rental ledgers are a separate P&L by default", "trip ledgers count in the household by default" | ✅ |
| R4.4 | Rental ledger requires a property and auto-tags its transactions | Check `type <> 'property' or property_id`; trigger sets `property_id` (M3) | T "property ledgers need a property", "property P&L nets rent against costs, tagged from the ledger" | ✅ |
| R4.5 | Ledger-specific categories | `categories.ledger_type` + trigger (M3) | T as R2.3, R2.4 | ✅ |
| R4.6 | Reports by one ledger, daily only, or all counted ledgers | `ledger_id`, `counts_in_household` in `v_transactions_report`, `v_monthly_summary` (M3) | T "report for one ledger shows only that ledger", "daily-only report leaves out the trip ledger", "household totals cover daily and trip ledgers", "household totals leave out the rental ledger" | ✅ |
| R4.7 | Budgets per ledger | `budgets.ledger_id` + unique key (M3) | T budget insert | ✅ |
| R4.8 | Min-spend counts a card across all ledgers | `v_min_spend_lines` has no ledger filter (M3/M4) | T "min-spend counts card spend in trip ledgers too" | ✅ |
| R4.9 | Archive ledgers | `ledgers.is_archived`; default ledger cannot be archived (M3) | T "a trip ledger can be archived", "an archived ledger keeps its records in reports", "the default ledger cannot be archived" | ✅ |

## 5. Tags (§4)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R5.1 | Property tag (single) on housing costs and rent | `properties`, `transactions.property_id` (M3) | T property P&L | ✅ |
| R5.2 | Per-property net = rent − housing costs | `v_property_pnl` (M3) | T "property P&L nets rent against costs…" | ✅ |
| R5.3 | Member tag: multi-valued field, values configured later; kids allowed | `people` (optional `user_id`), `transaction_people` (M3) | T "transactions can be tagged with people" | ✅ |

## 6. Record fields (§5)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R6.1 | Amount, date, category, merchant, card, people, property, notes | `transactions` columns (M1, M3) | T inserts | ✅ |
| R6.2 | Category required on every record | `transactions_category_required`: expense and income need a category, transfers have none (M7) | T "spend needs a category", "income needs a category", "a category cannot be removed from a record" | ✅ |
| R6.3 | Recoverable amount optional, default 0, 0 ≤ x ≤ amount | `recoverable_amount` + `transactions_recoverable_range` (M3) | T "ordinary spend has nothing recoverable", "recoverable amount cannot exceed the amount" | ✅ |
| R6.4 | Self-paid = amount − recoverable, computed not stored | `self_amount_sgd` in `v_transactions_report` (M3) | T "report counts only the self-paid part" | ✅ |
| R6.5 | Recovery status required when recoverable > 0; three values | `recovery_status` + `transactions_recovery_status_when_recoverable` (M3) | T "recoverable spend starts as to_submit" | ✅ |
| R6.6 | Submission date | `recovery_submitted_at` (M3) | T "a claim records its submission date" | ✅ |
| R6.7 | Income cannot have a recoverable amount | `transactions_recoverable_expense_only` (M3) | T "income cannot have a recoverable amount" | ✅ |
| R6.8 | 代付款 group defaults recoverable = full amount | `tg_transactions_defaults` (M3, M4) | T "pass-through spend defaults to fully recoverable" | ✅ |

## 7. Paybacks (§6)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R7.1 | Status flow 待提交 → 已提交待到账 → 已到账 | `recovery_status`; link sets `received` (M3) | T "linking a payback marks the expense received" | ✅ |
| R7.2 | Pool = recoverable amounts of submitted spend; 待提交 shown separately | `v_recovery_pool.submitted_sgd`, `to_submit_sgd` (M3) | T "pool holds only the recoverable parts" | ✅ |
| R7.3 | Link a payback to zero or many expenses | `recovery_links` (M3) | T link insert | ✅ |
| R7.4 | Removing a link restores the expense to submitted | `tg_recovery_links_removed` (M3) | T "removing the link puts the expense back to submitted" | ✅ |
| R7.5 | Unlinked 报销到账 / 代付款收回 reduce the pool total; unlinked refunds and waivers don't | `counts_against_pool`, `v_recovery_pool` (M3, M5) | T "pool drops by the linked amount and keeps no tail", "unlinked refunds and fee waivers do not reduce the payback pool" | ✅ |
| R7.6 | Shortfall / overpayment shown on the payback | `v_recovery_matches.difference_sgd` (M3) | T "payback matches the linked recoverable amount" | ✅ |
| R7.7 | Linking a payback to spend with nothing recoverable makes it recoverable (up to the payback) and received | `tg_recovery_links_check` (M5) | T "linking a waiver to a fee makes the fee recoverable and received", "a waived fee is no longer counted as spend" | ✅ |
| R7.8 | Refunds, fee waivers, advances repaid use the same mechanism | `is_recovery`, `counts_against_pool` (M3, M5) | As R7.5, R7.7 (G2, G3 closed in v0.4.1) | ✅ |
| R7.9 | AA repaid directly can start as 已提交待到账 | Status is settable on insert (M3) | T "AA paid back directly can start as submitted", "AA started as submitted goes straight into the payback pool" | ✅ |

## 8. Reporting rules (§7)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R8.1 | All spend reports and budgets use self-paid amount | `self_amount_sgd` (M3) | T "report counts only the self-paid part" | ✅ |
| R8.2 | Living, financial, pass-through self-paid part reported separately | `v_monthly_summary` grouped by nature (M3) | View definition | ✅ |
| R8.3 | Pass-through spend cannot be budgeted; income cannot be budgeted | `tg_budgets_check` (M3) | T "pass-through spend cannot be budgeted" | ✅ |
| R8.4 | Household real income = investment income; rent only in its property's P&L (HM decision) | Nature `real`; 租金收入 rental-only (M5); rental ledgers excluded from household totals (M3) | T rent rule (R3.4), "property P&L nets rent against costs…", "household real income excludes paybacks and rent" | ✅ |
| R8.5 | Transfers never count as spend or income | Nature `transfer` in `v_transactions_report` (M4) | T "reports mark transfers separately from spend", "bill payment moves money…, not counted as spend" | ✅ |
| R8.6 | Month bucketing in Singapore time | `month` column (M3) | View definition | ✅ |

## 9. Min-spend and cards (§7, §11)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R9.1 | Min-spend = full card spend − refunds to that card; rebates excluded | `v_min_spend_lines` (M3, M4) | T "min-spend counts card spend in full, minus refunds, ignoring rebates" | ✅ |
| R9.2 | Min-spend rules per calendar month or billing cycle, with category/merchant exclusions | `spend_rules` (M1); period maths `lib/periods.ts` | Unit tests `periods.test.ts`; aggregation over periods is app code | ⏳ Phase 2 |
| R9.3 | Card settings: statement day, due day or N days after statement, credit limit, annual fee month | `accounts` columns + checks (M1, M4) | T "due dates are only for credit cards" | ✅ |
| R9.4 | Card → stored value top-up: per-transfer choice to count toward min-spend, default from card (no) | `counts_to_min_spend`, `topups_count_to_min_spend`, trigger (M4) | T "card top-ups do not count to min-spend by default", "min-spend counts card spend and only the top-up chosen to count" | ✅ |
| R9.5 | Statement due date defaults from card settings | `tg_statements_defaults` (M4) | T "statement due date comes from the card's due day" | ✅ |
| R9.6 | Card statement status: amount due, paid until next statement and by due date; paid / paid late / part paid / unpaid / overdue | `v_card_statement_status` (M4, M5) | T "card statement starts unpaid", "a bill payment transfer marks the statement paid", "a payment after the due date shows as paid late, not unpaid", "later payments do not change an earlier statement" (G1 closed) | ✅ |
| R9.8 | Card fees and interest (手续费, 卡年费, 滞纳金利息) charged to a card never count to min-spend | `categories.counts_to_min_spend` + trigger (M5) | T "card fees never count to min-spend", "min-spend unchanged by the annual fee", "late fees and interest never count to min-spend" | ✅ |
| R9.9 | A later waiver (手续费免除) linked to the fee cancels it as spend, leaves min-spend unchanged, and nets out on the card balance | M5 (link rule) + M3 (`reduces_min_spend` false for waivers) | T "a waived annual fee is no longer counted as spend", "the waiver does not change min-spend either", "fee and waiver cancel out on the card balance" | ✅ |
| R9.7 | No supplementary cards; one currency per account | `accounts.currency` (M4); no supplementary field | — | ✅ |

## 10. Accounts, transfers, balances, statements (§11)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R10.1 | Types: credit card, bank, debit card, stored value, cash | `accounts_type_check` (M4) | T account inserts | ✅ |
| R10.2 | Debit card draws on a bank account | `funding_account_id` + `tg_accounts_check` (M4) | T "a debit card must draw on a bank account" | ✅ |
| R10.3 | Transfers: from/to account, no category, never same account | `kind = 'transfer'`, `to_account_id`, checks + trigger (M4) | T "a transaction with a destination account is a transfer", "transfers have no category", "cannot transfer to the same account" | ✅ |
| R10.4 | Stored-value spend recorded when used; top-up is a transfer (no double count) | Model + `v_account_balances` (M4) | T "stored value = top-ups minus spend" | ✅ |
| R10.5 | Opening balance and running balance; card balance negative = owed | `opening_balance(_date)`, `v_account_movements`, `v_account_balances` (M4) | T "card balance is what is owed…", "debit card spend comes out of its bank account" | ✅ |
| R10.6 | Statements for bank and card: period, opening/closing, file | `statements` (M4) | T statement insert | ✅ |
| R10.7 | Lines matched to transactions on the same account | `statement_lines` + `tg_statement_lines_check` (M4) | T "a line cannot match a transaction on another account" | ✅ |
| R10.8 | Check: unmatched lines, unmatched transactions, totals | `v_statement_check` (M4) | T "statement check shows what is still unmatched" | ✅ |
| R10.9 | Reconcile only when all matched and totals agree; then lock | `tg_statements_defaults`, `tg_transactions_reconciled_lock` (M4) | T "cannot reconcile with unmatched lines", "reconciled transactions are locked" | ✅ |
| R10.10 | Bill payments logged by hand as transfers (for now) | Transfer model (M4) | T bill payment | ✅ |
| R10.11 | Statement files stored privately | `statements.file_path` column only; no storage bucket created | — | ⚠️ G6 |

## 11. Families, security, pipeline (cross-cutting)

| ID | Requirement | Implementation | Verification | Status |
|---|---|---|---|---|
| R11.1 | Each family sees only its own data, incl. new tables and views | RLS policies on all new tables; views `security_invoker` (M3, M4) | T "other household sees none of our report rows / recovery pool / balances / statements", "outsider sees no ledgers" | ✅ |
| R11.2 | Viewers read-only | `can_write` policies (M1, M3, M4) | T "viewer cannot add ledgers" | ✅ |
| R11.3 | Anonymous visitors get nothing | `revoke … from anon` (M3, M4) | T "anonymous cannot read transactions" | ✅ |
| R11.4 | Every new family gets the new categories and a default ledger, incl. invite-only families | Seed + trigger (M2, M3) | T "invited family gets its own default categories / ledger" | ✅ |
| R11.5 | Changes ship through PR → staging → production with green checks | PRs #14–#17, #21, #23; all runs green | GitHub Actions | ✅ |

## 12. Deferred by design

| ID | Requirement | Planned |
|---|---|---|
| D1 | Screens: sign-in, family invite, accounts, expense/income/transfer entry, ledgers | Phase 1 — sign-in, family invite and accounts shipped (v0.5.0–v0.7.0); ledgers, expense / income / transfer entry, records list, edit, delete, refunds and receipt photos shipped (v0.11.0–v0.19.0, PRs #33–#41). Screens for D1 are complete |
| D2 | Min-spend dashboard, reports, CSV export | Phase 2 |
| D3 | Due-date and annual-fee reminders, low-balance alerts, budgets UI | Phase 5 |
| D4 | Statement PDF/CSV import and auto-matching | Phase 5 |
| D5 | Historical import using the old → new mapping (§8). **Revised 2026-10-04:** no per-transaction export is needed. The input is the cleaned monthly category summary (2024 to 2026), kept in the private archive repo, converted at one fixed historical rate (2026-10 re-screenshotted before go-live and converted at that day's rate). Rows with `treatment` transfer, duplicate, waived_fee, replaced or one_time are not imported as spend; pass_through and reimbursed rows import with recoverable = full amount, status received. Needed the category 医疗健康 / 体检 in the seed (R2.1; done in v0.10.2) | After the entry screens (D1); design §2b, §2c |
| D6 | ~~Split historical 税费（历史未拆分）~~ **Done in the history data (2026-10-04):** tax rows now use the actual bank debits per month for 2024-01 to 2026-09, replacing the old app's fixed amount | Done |
| D7 | Member tag values | Configure when needed |
| D8 | Drop deprecated `categories.is_excluded_from_reports` | Next release that touches categories |
| D9 | One household expense changed its recording method in March 2026 and is no longer recorded separately. HM decision: it will be handled later as a bank account transfer, so no separate recording now. Historical rows stay as imported | Later, with bank accounts |
| D10 | Fund flows between bank accounts and investment accounts: a transfer, not spend or income, but it changes bank balances and needs balance management. A few historical investment transfers mis-recorded as spend are excluded from spend | Late-phase backlog (HM); needs an investment account type or a transfer kind |
| D11 | Back-fill 2026-10 history when the data exists: the recurring bank debits listed in the private archive. Re-screenshot 2026-10 and convert at that day's rate | Before go-live (HM will update then) |
| D12 | Bank statement reconciliation will resolve known history gaps: bank-account spend recorded monthly since March 2026, a card top-up of a stored-value card recorded as spend (really a transfer), a month with no utilities record, and any other missing recurring debits in 2024–2025 (detail in the private archive) | With statement reconciliation (Phase 5) |
| D13 | Design how to record a one-time loan repayment: not spend for now, excluded from reports (treatment one_time) | Design only, later |
| D14 | Income side: keep the 投资基金 category for now; when income is built, include dividend income (股息分红) | With the income screens |
| 📄 | Historical baseline figures (§2, §2c) and decision log (§10) | Documentation only |

## Gaps found

| ID | Gap | Effect | Fix / status |
|---|---|---|---|
| G1 | Card statement status counts only payments made **after the statement date and on or before the due date**. A late payment, or one made before the statement date, never marks it paid. | Late-paid statements stay "unpaid" | ✅ **Closed in v0.4.1**: payments counted until the next statement; states paid late and overdue added |
| G2 | Any unlinked refund (退款) lowers the payback pool, even a refund for an ordinary purchase. | Pool understates what is owed | ✅ **Closed in v0.4.1**: only unlinked 报销到账 / 代付款收回 reduce the pool |
| G3 | A fee waiver (手续费免除) can only be linked after the fee is edited to be recoverable. | Extra step | ✅ **Closed in v0.4.1**: linking sets the recoverable amount automatically |
| G4 | The database accepts records without a category (the design says required). | Uncategorised spend counts as living | ✅ **Closed in v0.7.1**: the database requires a category on every expense and income; any existing uncategorised record moves to 其他 / 生活其他. Future auto-capture will need to pick a category or use a holding category |
| G5 | Real income includes rent, but rental ledgers are excluded from household totals. | Household income could miss rent | ✅ **Closed in v0.4.1**: HM decided rent stays only in the property P&L; 租金收入 is rental-ledger only |
| G6 | `statements.file_path` refers to a private storage bucket that does not exist yet (same for receipts). | No impact until uploads | Open — create private buckets with family-scoped policies in Phase 1/5 |
