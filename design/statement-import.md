# Transaction import with review (B-10, RTM D4)

Status: **proposed design**, not built. Requested by HM on 2026-10-18. Open decisions are listed at the end.

This replaces the original D4 idea ("statement PDF/CSV import and auto-matching") with a wider one: any download
of card or bank transactions can be brought in, read by AI where needed, matched against what is already recorded,
and nothing becomes an expense until HM has checked it.

## 1. Goal

- Manual entry on iPhone stays the main way to record spend. Import is a **catch-up and check**: it finds what was
  missed, confirms what was entered, and flags anything HM does not recognise.
- No duplicates: an imported line that is already recorded (by hand, by an earlier import or by a recurring bill)
  is linked to that record, not added again.
- Nothing is posted automatically. Every new line waits in a review list until HM confirms it as real.

## 2. Inputs

| Source | How it is read | Notes |
|---|---|---|
| Bank/card CSV download (transaction history) | Fixed parser per bank format, no AI | Most reliable; covers pending and settled lines, transaction and posting dates |
| Screenshots of the banking app | AI reads the image into lines | Usually several overlapping screenshots; date headers can be cut off |
| Statement PDF | Text extraction first, AI only if the layout needs it | A full statement also feeds reconciliation (B-11) |

Every input ends up in the same shape: one **import line** per transaction with account, transaction date, posting
date (if known), description as printed, signed amount (charge negative, credit positive), currency, and
pending/settled. AI output is never trusted blindly: the review screen shows the line next to its source, and the
batch shows the sum of the lines so HM can compare it with the bank's own total.

The account is chosen once per batch (or detected from the card name in the file). Card numbers are never stored;
at most the last four digits are used to pick the account.

## 3. Data (new, alongside the existing `statements` / `statement_lines`)

- `import_batches`: family, account, source type (csv / screenshot / pdf), uploaded by, created at, line count,
  total, optional link to a `statements` row when the batch is a full statement.
- `import_lines`: family, batch, account, transaction date, posting date, raw description, normalised merchant,
  amount, currency, pending flag, fingerprint, **state**, linked `transaction_id`, match score.
- States: `new` → `confirmed` (expense or other record created) · `matched` (linked to an existing record) ·
  `duplicate` (same line seen in an earlier batch) · `ignored` (not spend, e.g. a card payment) ·
  `disputed` (HM does not recognise it) · `waiting` (pending; wait for it to settle).
- One transaction links to at most one import line per account (same rule as `statement_lines` today).
- RLS, grants and tests as for every other family table. Raw files are not kept unless HM decides otherwise
  (decision 3); the parsed lines are enough.

## 4. Matching, in order

1. **Same line imported before.** Fingerprint = account + transaction date + amount + normalised description, plus
   an occurrence number for identical lines on the same day (two equal bus fares on one day are two lines).
   Overlapping downloads and overlapping screenshots therefore never double-count.
2. **Pending became settled.** A settled line with the same account and amount whose transaction date is within
   ±1 day of an earlier pending line replaces it (the description often gains a reference number and the posting
   date appears). If the amount changed (hotel pre-authorisation, tips, FX), the line keeps both amounts and goes
   back to review.
3. **Already recorded.** Candidates: records on the same account, same amount (exact; small tolerance only for
   foreign-currency spend), date within ±3 days, not already linked to another line. Merchant similarity breaks
   ties.
   - exactly one strong candidate → `matched` automatically (HM can unlink)
   - several or weak candidates → suggested, HM picks
   - none → `new`
   Matching is one-to-one, so three equal records can match only three equal lines.
4. **Not spend.** Card bill payments, payments in (e.g. paid at a payment kiosk), interest and fee reversals are
   proposed as `ignored`, or as the matching transfer if one is recorded. A credit that looks like a refund is
   proposed as a refund linked to the original spend.

The reverse check also runs on manual entry: when HM adds an expense that matches an unconfirmed import line, the
Add screen says so and links them instead of creating a second record.

## 5. Review screen (iPhone first)

One batch at a time, newest first, in three groups:

1. **Needs you** (`new`, suggested matches, changed amounts). Each line shows date, description, amount and the
   proposed category and ledger (from merchant templates, B-22, then last used for that merchant). Actions:
   **Confirm** (creates the record), **It's this one** (pick a match), **Not spend** (ignore), **I don't recognise
   this** (disputed; stays visible until resolved), **Later**.
2. **Waiting** (pending lines). Shown, not counted; they come back when they settle. HM can still confirm one now.
3. **Already recorded / duplicates** (collapsed). Tap to check or unlink.

Batch footer: number of lines, total, and the difference against what is now recorded for the period, so HM can
see at a glance whether everything is accounted for. "Confirm all new" exists but asks once more and lists the
count and total.

## 6. Where AI runs (decision 1)

- **Option A, in the app:** an API route sends screenshots/PDF pages to a free-tier vision model (Gemini, as
  already allowed for B-18) and gets structured lines back. Smooth on iPhone; the free tier may use the content for
  training and has rate limits.
- **Option B, outside the app:** HM gives the file or screenshots to Claude or ChatGPT, which returns a standard CSV;
  the app imports only CSV. No AI cost or keys in the app, but one extra step.
- CSV downloads need no AI in either option.

## 7. Fit with other items

- Uses the merchant templates (B-22) and usage-based defaults (B-27) for proposed categories and ledgers.
- Recurring bills (B-07) are matched like any other record.
- A batch marked as a full statement links to `statements`; the existing check and lock (R10.7–R10.9) then do the
  reconciliation, which is what B-11 needs.
- Statement storage bucket (B-08) is needed only if raw files are kept (decision 3).
- B-18 (automated bank feeds, receipt OCR) stays separate and later; it would feed the same review list.

## 8. Build order (proposal)

1. Tables, fingerprints, matching rules and tests (database only).
2. CSV import for HM's main card format plus the review screen.
3. Screenshot/PDF reading (per decision 1).
4. Manual-entry duplicate warning; statement link for B-11.

## 9. Open decisions for HM

1. Where AI reads screenshots and PDFs: in the app (A) or outside it (B)?
2. Pending lines: wait until settled by default (proposed), or confirm straight away?
3. Keep the uploaded files (needs the statements bucket, B-08) or keep only the parsed lines (proposed)?
4. Priority: B-10 is P2 in Phase 5. Raise it to P1 and start it after B-04?
5. Matching window: ±3 days and exact amount (proposed), or wider?
