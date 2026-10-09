# Changelog

All notable changes are listed here, newest first. Versions follow
[semantic versioning](https://semver.org): new feature → minor (1.**1**.0), fix → patch (1.1.**1**).

## [Unreleased]

## 0.22.1 — 2026-10-09

- Security: the default-category seeder can no longer be called directly by signed-in or anonymous clients; only new-family creation runs it.
- Account and card-rule dates must be real calendar dates (2026-02-30 is refused instead of rolling into March).

## 0.22.0 — 2026-10-09

- Monthly/yearly recurring expenses with amount, first/last dates or no end, account/category/merchant/notes and immutable future-effective revisions. Planned bills are separate from spending; confirm due bills with actual amounts/notes or skip, with atomic replay protection.

## 0.21.0 — 2026-10-07

- Family-scoped merchant/account expense templates, optional category, management under Family and selection on Add. Explicit merchant templates override usage suggestions; manual choices are preserved.

## 0.20.0 — 2026-10-07

- Add expense defaults to the active card/account used for more than 75% of purchases in the exact sub-category over the past two calendar months, when there are at least 10 purchases. With fewer than 10, use that sub-category’s last-used account (including older history). Cash and bank accounts are eligible; manual choices and edits are preserved.

## [0.19.2] — Supabase SSR compatibility

### Fixed
- Preserve refreshed session cookies and Supabase cache-prevention headers across middleware responses and redirects, including OAuth callback success/failure; upgrade @supabase/ssr to 0.12.7.

## [0.19.1] — Historical import dry run

### Added
- B-03 local history validator and review manifest: reconciles screenshot totals,
  checks category mapping and FX rounding, separates settled recoverable spending,
  exclusions and provisional October data, and detects changes to reviewed batches.
- Dedicated CI checks and a documented monthly dry-run report. This tooling does
  not connect to a database or load production history; B-03 remains in progress.

## [0.19.0] — Receipt photos

### Added
- **Attach a receipt photo to a record.** Open a record → Receipt photo → Add a photo (camera or photo library on iPhone). The photo is shrunk on your phone first (longest side 1600 px), so it uploads quickly and stays small.
- After saving a new entry, a link "Add a receipt photo →" opens the record at the photo section.
- Replace or remove a photo any time. Deleting a record deletes its photo.
- Photos are private to your family: stored in a private bucket, one folder per family, shown through short-lived links. Viewers can see photos but not add or remove them.

### Notes
- Migration `20261007020000_receipt_photos.sql` creates the private `receipts` bucket (5 MB per file, JPEG/PNG/WebP) and its access rules; tests added. The free plan's 1 GB of storage holds several thousand shrunk photos.
- Reading text from photos (receipt OCR) is still a later item (B-18).

## [0.18.0] — Refunds on any spend

### Added
- Recording a refund, waiver or other payback now also lists **other recent spend** (under "Refund or waiver for other recent spend"), not only spend marked to be paid back. Tick the purchase it refunds: that part stops counting as your spending in reports, and the purchase shows what was refunded.
- Refunds can arrive in **parts**: a second refund on the same purchase adds to the first, up to the purchase amount.
- Deleting a refund (or taking it off in Edit) puts the purchase back as ordinary spend. It does not turn into a claim waiting for money.

### Notes
- A claim you marked yourself still settles only up to the claim.
- Migration `20261007010000_refunds_on_any_spend.sql` (new column `recoverable_from_link`); tests added for part refunds, deleting refunds, and claims you made yourself.

## [0.17.0] — Smarter starting values

### Changed
- **Add** now starts where you left off: "Paid from" is the account you last paid an expense from, a transfer starts on the accounts you last moved money between, and the form opens on the ledger you last used. Accounts or ledgers that have since been archived are never offered.
- Income still starts on your Cash account (change it per entry).
- "Last" means your own last entry; each person in the family gets their own starting values.

### Notes
- No database change.

## [0.16.0] — Edit records

### Added
- **Edit** any record from its page: expenses, income and transfers. The form opens with the saved values; the type can't be changed (delete and re-add for that). The ledger can be changed to another with the same currency.
- Editing a payback lets you change which claims it settles. Claims it is already linked to stay linked (with the same amounts) unless you untick them; links to claims the form doesn't list are never dropped.
- A spend that already has paybacks keeps its Received / Claimed status from those paybacks; its paid-back amount can't go below what was received (the field is marked with the reason).

### Changed
- The Add form and the Edit form are the same form, so both behave alike (refused entries keep what was typed, the confirmation for a payback larger than its claims, and so on).

### Database
- Migration `20261006220000_edit_records.sql`: a payback can't be made smaller than what it settles, a claim can't expect less than it has received, linked records can't change type, and a claim's status is worked out again when its paid-back amount changes. Tests added.

## [0.15.0] — Records list and delete

### Added
- **Records** page (Home → Records, or "See all records" on Add): every entry of a month, newest first, with earlier / later month links.
- Tap any record (here or under Recent entries) to open it: type, amount, SGD amount, category, accounts, ledger, date, notes, paid-back progress, and the paybacks or claims it is linked to.
- **Delete a record** with a confirmation. If it is linked, the confirmation says what else changes: deleting a payback puts the claims it settled back to Claimed; deleting a claim removes its links and leaves the payback on your records.
- Records on a reconciled statement can't be deleted (the message says to reopen the statement). Viewers see records but have no delete button.

### Changed
- Records show the sub-category as the title, with the merchant (or the payback's "from") tagged beside it, in the list, on the record page and in the claim pickers.
- Buttons side by side (Delete / Cancel and similar) are the same size.

### Notes
- No database change; tests added for deleting linked paybacks and claims.

## [0.14.0] — Income and transfers

### Added
- The Add screen (Home → "+ Add a record") now has a switch: **Expense / Income / Transfer**. One screen, the same
  date, amount and notes everywhere.
- **Income:** ledger, amount, category and sub-category (income categories only; rent only in a rental ledger), the
  account it was received in (required for paybacks and rent), who it is from (optional), date and notes.
- **Paybacks settle expenses:** choosing a payback category (报销到账, 代付款收回, 退款, 手续费免除) lists the expenses
  still waiting to be paid back. Tick the ones it settles and they become Received. Linking is optional.
- **Transfer:** between two of your own accounts (for example paying a card bill or topping up a wallet): from
  account, to account, amount, date and notes. No category. Recorded in the family's default ledger.
- Recent entries show income with a + and transfers as "from → to".
- **Part paybacks:** a payback settles only the part it covers. A S$20 payback against a S$80 claim leaves S$60 still
  to come; the claim becomes Received only when its paybacks add up. Recent entries show "S$20 received" on a
  part-paid claim, and the claim list shows what is left.
- **Warning before saving** a payback bigger than the ticked expenses still wait for; Save anyway or Go back.
- Database: `recovery_links.amount` (the part of a payback that settles each expense). Existing links keep their
  meaning (fully settled). The payback pool counts only what is still to come.

### Changed
- The Add screen is titled "Add a record" and Home's button reads "+ Add a record".
- The empty account choice is now called **Cash** instead of "Cash / not tracked": an expense or income with no
  account was paid or received in cash. Paybacks, refunds and rent can be received in cash too (they used to demand
  an account). Transfers still need two accounts.
- Income starts on your Cash account when you have one (change it to receive into a bank or card instead).
- Every family now starts with a Cash account (现金), including new families and existing ones that had none (migration `20261006210000`). It is an ordinary account: rename, archive or delete it like any other.
- Database: the "needs the account that received the money" rule is no longer enforced.

## [0.13.0] — Paid-back expenses

### Added
- Add expense: tick "Someone will pay part of this back" to record the part that will be repaid (blank = all of it)
  and its status: To claim or Claimed. Hidden until ticked.
- Spend under 代付款 (paying on someone's behalf) starts with this ticked; untick it if the money isn't coming back.
- Recent entries show the paid-back part and its status.
- When Add expense refuses an entry, everything you typed stays, the field at fault is outlined in red with the reason right under it, and the screen scrolls to it.
- "Saved" shows once; refreshing the page clears it.

### Notes
- "Received" isn't chosen here: it is set when the payback is recorded as income (next update).
- No database change: the recoverable amount and status columns already existed.

## [0.12.0] — Add an expense

### Added
- Add expense screen (Home → "+ Add expense"): ledger, amount, category and sub-category, the account paid from,
  date and time (Singapore time, now by default), merchant and notes. The last 10 entries show underneath.
- Merchant is optional. Without one, the list shows the category.
- Ledgers in another currency ask for the amount in that currency and the SGD amount.
- "Paid in a foreign currency" (off by default): tick it to also record the currency (picked from a short list: USD, GBP, EUR, MYR, CNY, then AUD, CAD, HKD, JPY, THB) and amount paid. For
  information only; reports use the ledger and SGD amounts.
- Database: `foreign_amount` and `foreign_currency` on transactions, with checks and tests.

### Changed
- Home's hint now points to adding spending.

## [0.11.0] — Ledgers

### Added
- Ledgers screen (Home → Ledgers): list, add, edit, archive and delete ledgers (账本). Trip ledgers have optional
  dates; a rental-property ledger creates its property tag automatically (one property, one ledger).
- Every ledger has a currency (SGD unless chosen). It is locked once the ledger has records.
- Database guards: a ledger's type, property and default flag never change; the default ledger can't be deleted.

### Changed
- Home shows your family's name as a tappable card that opens the Family page. (Someone with no family is still
  sent to "Set up your family" to create one or use an invite link.)
- Accounts and Ledgers now live under Family (Home → Family), not in the top bar or on Home. Both list pages
  have a "← Family" link back.

### Notes
- Accounts and cards stay shared across ledgers: a card's balance, statement and min-spend add up every ledger,
  while reports stay separate per ledger (now covered by database tests).

## [0.10.2] — New category: 体检

### Added
- 体检 (health check-up) under 医疗健康, right after 中医. Existing families get it automatically and new
  families get it from the seed. Needed before the history import.

## [0.10.1] — Tidy-up: drop unused category flag

### Removed
- The deprecated `categories.is_excluded_from_reports` column (replaced by `nature` in 0.7.x; nothing used it).
  No visible change in the app.

## [0.10.0] — Turtle mascot and app icon

### Added
- An original cute turtle mascot (gold coin-shell, jade body, big friendly eyes) as the app icon: iPhone home
  screen, browser tab, install icon and the top-bar logo. Source is `public/mascot.svg`;
  `scripts/render_icons.py` redraws the PNG icons from it.

### Changed
- Icons are now image files instead of being drawn in code.

## [0.9.5] — Docs: repo renamed

### Changed
- Docs and CLAUDE.md now use the renamed GitHub repo `huiminlatsg/dragon-turtle-ledger`.

## [0.9.4] — New web address

### Changed
- The app's address is now `https://dragon-turtle-ledger.vercel.app`. The old `expensify-pi.vercel.app` keeps working, and both are accepted for
  Google sign-in and by the deployment check.

## [0.9.3] — Renamed to Dragon Turtle Ledger (龙龟账本)

### Changed
- The app is now **Dragon Turtle Ledger** in English and **龙龟账本** in Chinese (page titles, headings, invite
  text, browser tab). The iPhone home-screen label is the short 龙龟账本. Staging versions show
  `Dragon Turtle Ledger-staging`.
- The repo, Supabase and Vercel projects and the web address keep the `expensify` name for now; renaming those is
  a separate step.

## [0.9.2] — Add accounts to production

### Added
- **Production: add accounts** workflow: adds cards to one family in production from JSON. Add-only (nothing is
  cleared or changed), finds the family by exact name plus a member's name and refuses unless exactly one matches
  (no family list, so other families' data is never shown), refuses duplicate official names, checks ownership in
  the same transaction, prints only what it added, and needs the word `production` typed to run.

## [0.9.1] — Load test accounts into staging

### Added
- **Staging: load accounts** workflow: loads cards and their min-spend rules from JSON into the staging database
  (optionally clearing the family's old accounts first), so the staging family can be set up without typing
  each card on a phone. Uses the staging secrets only and cannot reach production.
- Family check: the load needs `expect_member`, a name that must belong to the chosen family, and verifies in
  the same transaction that every account and rule belongs to that family. Otherwise nothing is changed.

## [0.9.0] — Account nicknames

### Added
- An optional **nickname** for every account (for example "DBS_Yuu" for the card officially named "DBS yuu").
  Lists and the account page show the nickname first, with the official name underneath; accounts
  without one look as before. Add it when creating an account or later with Edit.
- Database: `accounts.nickname` (1 to 40 characters, never blank), with tests. No change to who can see what.

## [0.8.0] — Google account picker shows the app's address

### Changed
- On the registered addresses, sign-in goes straight to Google and returns to `/auth/google`, so Google's account
  picker shows `expensify-pi.vercel.app` instead of the long Supabase address. Sign-in still finishes inside the
  home-screen app. Addresses not registered with Google (e.g. other previews) keep the earlier sign-in.

### Added
- A **Me** page (header, next to Family) for the signed-in person: their name, Google account and family, and
  **Sign out**. Sign out moved here from the bottom of the Family page, since it's about you, not the family.
- `/auth/google`: receives Google's signed ID token (after the `#` in the address), checks a one-time state and
  nonce that only our sign-in button made, and signs in to Supabase.

## [0.7.1] — Category required; more database checks

### Changed
- Every expense and income must have a category (transfers still have none), as the design requires.
  Any record saved without one is moved to 其他 / 生活其他, which reports already treated it as.

### Added
- Database checks for rules that were only checked by reading the code: rental-only categories,
  the unsplit historical tax category, real income versus paybacks, reports by ledger, min-spend
  across ledgers, archived ledgers, claim submission dates, and AA paid back directly.

## [0.7.0] — Bank and card picker, account colours

### Added
- Pick the bank or provider from a list when adding an account: Singapore banks (DBS, POSB, OCBC, UOB,
  Standard Chartered, Citi, HSBC, Maybank, American Express, Trust, GXS, MariBank) and, for stored value,
  GrabPay, ShopeePay, EZ-Link, YouTrip, Revolut and Wise. "Other…" takes any name.
- For DBS, UOB, Citi and Standard Chartered credit cards, choose the card (e.g. Citi Rewards, UOB One,
  DBS Altitude); it fills in the name and, where the card has one network, the network. Both stay editable.
- Every account shows a colour tile: bank name top left, card network (Visa, Mastercard…) bottom right as text on a small white pill
  (Mastercard in red-to-yellow, AMEX in blue, Visa in navy),
  and on the account page the last 4 digits bottom left.
  The tile uses the bank's colour by default; pick one of 12 colours to tell cards from the same bank apart.
  No bank logos or card artwork are used.

## [0.6.0] — Phase 1, part 2: accounts and cards

### Added
- Accounts page: credit cards, bank accounts, debit cards, stored value (GrabPay, EZ-Link…) and cash,
  grouped by type with their current balance (cards show the amount owed) and, for cards, the next
  statement date and payment due date.
- Add and edit accounts: name, bank, card network, last 4 digits, currency, who it belongs to; for cards
  the statement day, due date (fixed day or days after the statement), credit limit, annual fee month and
  whether top-ups count to min-spend by default; for debit cards the bank account they draw from; an
  opening balance and start date.
- Card spending rules: minimum spend or bonus cap, per calendar month or billing cycle, with dates. Each
  rule shows this period's progress (spent so far, amount to go, days left).
- Archive accounts you no longer use (hidden when adding records); delete accounts that have no records.

- Test versions are labelled: a yellow **STAGING** badge next to the logo on every page, and the app is
  named "Expensify-staging" (browser tab and home-screen icon). Production shows neither.

### Changed
- Top bar: Home · Accounts · Family. Sign out moved to the bottom of the Family page.
- Whether a credit-card top-up counts to min-spend is chosen on each top-up only; there's no card-level
  default any more.

## [0.5.0] — Phase 1, part 1: Google sign-in and family setup

### Added
- Sign in with Google ("Continue with Google"). Sign-in finishes inside the home-screen app on iPhone;
  only Google accounts listed as test users in the Google Cloud project can sign in. The session stays
  fresh in the background.
- Chinese / English switch on every screen; the first visit follows the phone's language.
- Family setup: create a family (the first family's creator becomes app admin; later families need a
  new-family invite), join a family from an invite link, family page with members and invite links.
- App admin section: new-family invite links and an overview of families (counts only).
- Supabase sign-in settings as code (`supabase/config.toml`), pushed by a new workflow: staging on pull
  request, production on merge. Google's client ID and secret come from GitHub secrets
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; docs/SETUP.md Part 6). Email sign-up is turned off.

### Changed
- Every family member can create invite links (previously only the family's creator).

## [0.4.1] — Fixes from the requirement traceability check

### Changed
- Rent is not household income: 租金收入 can only be used in a rental-property ledger, so each rental
  shows its full income and costs in its own profit-and-loss.

### Added
- Card fees: new 税费 categories 卡年费 (annual fee) and 滞纳金利息 (late fee / interest). Fees charged to a
  card never count to min-spend; a later 手续费免除 linked to the fee cancels it as spend without
  changing min-spend.

### Fixed
- Card statement status counts every payment until the next statement and shows paid late or overdue,
  instead of leaving a late-paid statement unpaid.
- The payback pool is reduced only by unlinked 报销到账 and 代付款收回; refunds and fee waivers reduce
  it only when linked to the spend they settle.
- Linking a fee waiver or refund to spend with nothing recoverable now makes that spend recoverable,
  instead of refusing the link.

## [0.4.0] — Payment methods

### Added
- Account types: credit card, bank account, debit card (spends from its bank account), stored value, cash.
  Every account has a currency (one per account) and an opening balance.
- Credit cards: due date as a fixed day of the month or N days after the statement, credit limit,
  annual fee month, and a default for whether top-ups from the card count to min-spend (no).
- Transfers between your own accounts (card bill payments, top-ups, cash withdrawals) as a third
  transaction kind; they never count as spending or income. A top-up from a credit card records whether
  it counts to that card's min-spend.
- Statements and statement lines for any account, matched to transactions; a statement can only be
  marked reconciled when every line matches and the lines add up, and then its transactions are locked.
- Views: account movements and balances, statement check, card statement payment status.

### Changed
- Account type values renamed (credit → credit_card, debit → debit_card, ewallet → stored_value;
  paynow and other are folded into bank and cash).

## [0.3.0] — Data model: categories, income, paybacks and ledgers

### Added
- New default categories (Chinese names) from three years of household history: 16 expense groups
  (including trip-only 旅行 and rental-only 出租成本) and 4 income groups, 104 categories in total.
- Category nature on each group: living, financial or pass-through spend; real or offset income.
- Income in the same transactions table as spend (`kind`), always with positive amounts.
- Recoverable amount on spend (AA meals, claims, pass-through) with a status (to submit / submitted /
  received), and links from a payback to the spend it settles.
- Ledgers (账本): a default daily ledger, plus trip and rental-property ledgers; rental ledgers are a
  separate profit-and-loss and stay out of household totals by default.
- Properties and people (who the spend was for) tags; budgets can be set per ledger.
- Report views: per-transaction self-paid amount, monthly summary, payback pool and matches,
  min-spend lines (refunds to a card count against it, rebates do not), property P&L.

### Changed
- Negative amounts are no longer allowed; a refund is an income in the 退款 category.
- `categories.is_excluded_from_reports` is deprecated in favour of nature (drop in a later release).

## [0.2.0] — Several families

### Added
- One app can now hold several families. Each family sees only its own expenses, cards, categories and
  bills; a person belongs to one family.
- New families join by invite only: an app admin creates a one-time family invite link (valid 14 days).
  The first person to create a family becomes the app admin.
- Admin overview: per family, its name, member count, number of transactions and last activity.
  No amounts, merchants or other expense details.

## [0.1.0] — Phase 0: skeleton and pipeline

### Added
- Next.js app installable to the iPhone home screen, with a status card (version, environment, database).
- Database schema for households, members, invites, cards, optional min-spend and bonus-cap rules,
  two-level categories (12 defaults), merchant rules, transactions, receipts, budgets and ingest tokens.
- Row-level security: household members see everything in their household and nothing outside it;
  viewers are read-only; anonymous visitors get nothing.
- Min-spend period maths (calendar month and statement cycle) and amount parsing, with unit tests.
- CI on every pull request: unit tests, build, type check, end-to-end tests on an iPhone-sized screen,
  database security tests on plain Postgres and on a real local Supabase stack, and a secret scan.
- Automatic database migrations (staging on pull request, production on merge), nightly encrypted
  backups, post-deploy checks, and weekly dependency updates.
