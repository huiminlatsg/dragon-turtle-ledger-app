# Transaction import with review (B-10, RTM D4)

Status: **proposed design**, not built. Requested by HM on 2026-10-18, revised the same day for the import agent,
then with Claude's recommended approach (§0). Decisions for HM are listed at the end. All examples here are invented.

## 0. Recommended approach (Claude, 2026-10-18; for HM's review)

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | Who reads the files | **App parses known card/bank CSV layouts itself (no AI). AI agent reads screenshots and any new layout** | CSV is the most common input and is fully structured: a fixed parser is exact, free and instant, and removes AI misreads from the bulk of the data. Screenshots really need vision, so that is where the agent earns its place |
| 2 | Agent home | **Claude, in a separate Project "Ledger Import"**; instructions written to work unchanged as a ChatGPT GPT if ever needed | Claude already runs this project and reads images well; a separate Project keeps bank data out of the development Project and its context. Generic instructions and schema live in `docs/import-agent.md` (no data); HM's samples stay only in that private Project |
| 3 | How the agent's output reaches the app | **Copy and paste into the app's Import page** (file upload also accepted); no connector yet | On iPhone, "copy" in the chat and "paste" in the app is two taps, easier than saving a file. No OAuth, no keys, works with any AI. A connector (option B) is revisited only if pasting becomes the bottleneck |
| 4 | Where approval happens | **Always in the app** | Signed-in, RLS applies, disputes persist, and the same validation as manual entry runs. The agent never writes to the database |
| 5 | Duplicate identity | **Fingerprint in §4** (account, date, amount, merchant key, occurrence), enforced in the database, stored on the confirmed record in `transactions.dedupe_key` | Survives overlapping uploads, pending → settled and truncated screenshot text; the unique index makes double-posting impossible |
| 6 | Pending lines | **Shown under Waiting, not confirmed by default**; can be confirmed early | Pending amounts change (holds, tips, transit fares added up); waiting avoids rework. Confirming early still works: the settled line then links to it, and any amount change comes back for review |
| 7 | Manual entry | **Two-way reconciliation (model 3, §6)** | Keeps quick entry with full detail on iPhone, and the bank download catches missed spend, typos and unknown charges |
| 8 | Matching window | **Auto-link only on exact amount, ±3 days and a single candidate; suggest (never auto-link) up to ±7 days; foreign-currency spend: suggest within 3% of the SGD amount** | Auto-links must be near-certain; wider windows only produce suggestions for HM to tap |
| 9 | Files | **Keep only the parsed lines; do not store uploads** | Nothing extra to secure, no storage bucket needed (B-08 not a dependency) |
| 10 | Priority | **Raise B-10 to P1; build after the B-28 stabilisation gate and B-04, and before B-05** | It improves data correctness and daily use, and the October back-fill (B-05) can then be done by importing that month's downloads and screenshots instead of re-typing them |

Build in three PRs, each reviewed and merged separately (§9). Nothing is built until HM approves this design.

## 1. Goal

HM uploads a card or bank CSV download, or screenshots of the banking app. An AI agent (Claude or ChatGPT) reads
them into one standard format. The app then:

1. drops lines it has already seen (overlapping downloads are normal),
2. links lines that are already recorded (typed by hand, from a recurring bill, or confirmed earlier),
3. shows only what is genuinely new on an approval screen,
4. writes confirmed lines straight into the transactions table, and keeps disputed lines on a list until resolved.

Family transaction data never goes through GitHub. It moves only between HM, the AI chat, the app and the database.
The public repo holds code, schema and invented test data only; HM's sample files live in the private AI project.

## 2. Architecture

```
 CSV / screenshots ──► Import agent (Claude Project or ChatGPT GPT) ──► standard import file (JSON)
                                                                              │
                                     iPhone: Import page in the app ◄─────────┘  (upload, or connector later)
                                              │
                         database function stage_import(): fingerprint, dedupe, match
                                              │
                         Review screen ──► Confirm ──► transactions (source = 'statement')
                                       └─► Dispute ──► dispute list ──► resolve later ──► transactions
```

The work is split on purpose:

| Step | Who | Why |
|---|---|---|
| Read CSV / screenshots, normalise into the import format | AI agent | Formats vary and screenshots need vision; this is what the AI is good at |
| Unique IDs, dedupe, matching with existing records | Database (`stage_import`) | Must be deterministic and repeatable; an AI must not decide what is a duplicate |
| Approve, dispute, choose category | HM in the app | Signed in, family rules (RLS) apply, works on iPhone, disputes persist |
| Write to transactions | App, as HM | Same validation and triggers as manual entry; nothing bypasses RLS |

### 2a. The agent (Claude or ChatGPT; same design for both)

- **Claude:** a Project (or a Skill, so it works in any chat) with instructions, the output schema and HM's sample
  CSVs and screenshots as knowledge. **ChatGPT:** a custom GPT with the same instructions, schema and knowledge files.
- HM's examples teach it each bank's layout: columns, date formats, pending vs settled, credits, card name in the header,
  and the screenshot quirks (date headers off-screen, truncated descriptions, overlaps between screenshots).
- It returns **one JSON file per account** in the format below, plus a short check: line count, total, date range and
  anything it was unsure of (each such line carries `confidence: "low"` and a note).
- It never guesses an account: if the card cannot be identified from the file, it asks.
- Known CSV layouts can later be parsed by the app itself without AI (the same output format), so the agent is
  needed only for screenshots and new layouts.

### 2b. Getting the file into the app (decision 1)

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Paste or upload (recommended)** | HM copies the agent's JSON and pastes it on the app's Import page (or uploads it as a file) | No new login or keys; works with Claude and ChatGPT alike; app does all checks | One copy and paste |
| B. Connector (later) | The app exposes a small MCP endpoint; the agent calls `list_accounts`, `stage_import`, `review_queue`, `list_disputes` | Agent stages directly and can answer "what's still disputed?" | Needs OAuth sign-in for the connector (both Claude and ChatGPT connectors expect it); more to build and secure |
| Not recommended: direct database access (e.g. a generic Supabase connector) | Agent writes SQL | None worth the risk | Bypasses RLS and app validation; a wrong query can damage production data |

With either A or B, **approval always happens in the app**, never by the agent alone.

## 3. Import format (v1)

```json
{
  "format": "dtl-import/1",
  "account_hint": "VISA ...1234",
  "source": "csv | screenshot | pdf",
  "period": { "from": "2026-01-01", "to": "2026-01-10" },
  "lines": [
    {
      "txn_date": "2026-01-03",
      "posting_date": "2026-01-05",
      "description": "EXAMPLE CAFE 12345 SINGAPORE SG",
      "amount": -12.30,
      "currency": "SGD",
      "foreign_amount": null,
      "foreign_currency": null,
      "pending": false,
      "bank_ref": null,
      "confidence": "high",
      "note": null
    }
  ]
}
```

Charges are negative, credits positive. `account_hint` holds at most the last four digits; full card numbers are
never stored. `period` is the date range the download covers (used in §6). Screenshots have no period unless HM
states it; the agent uses the earliest and latest dates it read.

## 4. Unique identity of a bank line (overlapping uploads)

Bank CSVs and screenshots carry no transaction ID, and the same purchase looks slightly different across sources:
a pending line has no reference number, the settled line gains one, and screenshots truncate descriptions. So the
identity is built only from what stays stable.

**Merchant key:** the description in upper case, digits and punctuation removed, first 12 letters.
`EXAMPLE CAFE 12345 SINGAPORE SG` and a screenshot's `EXAMPLE CAFE SING...` both give `EXAMPLECAFES`.

**Base key:** `account · transaction date · amount in cents · merchant key`.

**Occurrence number:** two genuinely identical lines (two equal bus fares on one day) share a base key, so each gets
an occurrence number within its upload: `#1`, `#2`.

**Fingerprint:** hash of `base key · occurrence`. Unique per account in `import_lines`.

How this handles HM's example (upload 1 covers 1–10 Jan, upload 2 covers 5–15 Jan):

- Lines from 5–10 Jan produce the same fingerprints in both uploads → marked *seen before*, not shown again.
- If upload 2 holds three identical fares on 7 Jan and upload 1 held two, only `#3` is new.
- 11–15 Jan lines are new and go to matching.

Edge cases:

| Case | Rule |
|---|---|
| Pending in upload 1, settled in upload 2 | Same base key → the settled line replaces the pending one (state `superseded`); a confirmed record stays linked |
| Settled amount differs from pending (hotel hold, tips, transit fares added up) | Same account and merchant key, date ±1 day, different amount → shown as *amount changed*, HM accepts the new amount |
| Settled date differs by a day | Looked up within ±1 day before treating it as new |
| Screenshot cut too short to give 12 letters | Shorter key used, and the line goes to review rather than being skipped automatically |
| A bank reference number exists (some PDFs) | Used as the identity instead of the fingerprint |

Known CSV layouts are parsed by the app into the same format, so the rules below apply whatever the source.

The confirmed transaction stores the fingerprint in its existing `transactions.dedupe_key` (already unique per
family), so a line can never be posted twice, even if staging is bypassed.

## 5. Data

Builds on columns that already exist on `transactions` (`merchant_raw`, `source` including `'statement'`,
`status` pending/confirmed/posted, `dedupe_key` with a unique index) and the existing `statements` /
`statement_lines` for full statements.

- `import_batches`: family, account, source, uploaded by, uploaded at, period from/to, line count, total.
- `import_lines`: family, batch, account, txn date, posting date, description, merchant key, amount, currency,
  foreign amount/currency, pending, fingerprint, state, linked `transaction_id`, dispute reason and note,
  resolved at/by.
- States: `new` · `seen_before` · `matched` (linked to an existing record) · `confirmed` (record created) ·
  `not_spend` (card payment, payment in) · `disputed` · `superseded` (pending replaced by settled) · `dropped`.
- One transaction links to at most one import line per account.
- RLS with `is_member()` / `can_write()`, no `anon` access, tests in `rls.test.sql` with invented data.
- `stage_import(batch json)` is a database function: it computes keys, inserts only new fingerprints, runs matching
  (§6) and returns counts per state. Running it twice on the same file changes nothing.

## 6. Fit with manual entry

Manual entry stays the quick way to record spend on the go (with category, people, ledger, notes). Import becomes
the **check that nothing was missed or mistyped**. Three possible models:

| Model | How it works | Verdict |
|---|---|---|
| 1. Import only fills gaps | Matching links to manual records; unmatched bank lines go to review | Simple, but a mistyped manual amount is never noticed |
| 2. Import replaces manual entry | Stop typing; everything comes from the bank | Loses category detail at the moment of spend; cash isn't covered; bank lines lag by days |
| **3. Two-way reconciliation (proposed)** | Manual records and bank lines check each other | Catches missed spend, typos and charges HM didn't make |

Model 3 in detail:

- **Bank line → manual record.** Same account, exact amount (small tolerance for foreign currency), date ±3 days,
  not already linked. One clear candidate links automatically (HM can unlink); several are offered to choose from.
  The manual record keeps its category and details and gains `status = posted`.
- **Manual record → bank line.** Once an upload covers a date range for an account (its `period`, settled lines
  only), manual records on that account in that range with no bank line are flagged *not seen on the bank*: wrong
  card, wrong amount, or not yet posted. HM fixes or keeps it.
- **While typing.** When HM adds an expense that matches an unlinked bank line, the Add screen shows it and links
  instead of creating a second record.
- **Recurring bills (B-07)** are matched like manual records.
- **Category for new bank lines** comes from merchant templates (B-22), then the last category used for that
  merchant key, then the account's usage defaults (B-27). HM can change it before confirming.
- **Coverage view.** Per account, the dates covered by uploads so far, so gaps between downloads are visible.

## 7. Review screen (iPhone first)

One batch at a time, three groups:

1. **Needs you:** new lines, suggested matches, amount changes. Each shows date, description, amount, proposed
   category and ledger. Actions: **Confirm**, **It's this record** (link), **Not spend**, **Dispute** (reason:
   don't recognise / wrong amount / charged twice / other, plus a note), **Later**.
2. **Waiting:** pending lines; not counted until settled, but can be confirmed early.
3. **Done:** seen before, matched, not spend; collapsed, tap to check or undo.

Footer: line count and total of the upload, how much of it is now recorded, and the flagged manual records for the
same period. "Confirm all new" asks once more with the count and total.

## 8. Disputes

- A **Disputes** list across all batches: date, merchant, amount, reason, note, days open.
- Resolve as: **Legit after all** → creates the record (same as Confirm); **Reversed or refunded** → link the
  credit line, both recorded as expense plus refund (or neither, if HM chooses); **Drop** → kept for history,
  never posted.
- Disputed amounts are never counted in reports or min-spend until resolved as legit.

## 9. Build order (recommended)

| PR | Scope | Notes |
|---|---|---|
| 1. Database | `import_batches`, `import_lines`, `stage_import()` (fingerprints, dedupe, pending → settled, matching), confirm / dispute / resolve functions, RLS and tests with invented data | Migration; staging first, production only on HM's "merge" |
| 2. App | Import page (paste or upload the agent's JSON; built-in parser for known CSV layouts; account chosen by HM, never taken from the file), review screen, disputes list, coverage view | Server-side schema check and size limits on every import |
| 3. Manual-entry checks | *Not seen on bank* flags, duplicate warning on the Add screen | Small, after a few real imports |
| Agent (no app change) | `docs/import-agent.md`: generic instructions and the JSON schema; HM creates the "Ledger Import" Project and adds his private samples there | Samples never go to GitHub |
| Later | Connector (option B), statement link for reconciliation (B-11) | Only if needed |

## 10. Decisions for HM

Recommended answers are in §0. Please confirm or change:

1. In-app CSV parser plus Claude agent for screenshots (§0 rows 1–2)
2. Paste into the app, no connector yet (row 3)
3. Pending lines wait by default (row 6)
4. Two-way reconciliation with manual entry (row 7)
5. Matching windows (row 8)
6. Keep parsed lines only, no file storage (row 9)
7. B-10 to P1, after B-28 and B-04, before B-05 (row 10)
