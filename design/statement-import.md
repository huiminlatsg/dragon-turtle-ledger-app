# Transaction import with review (B-10, RTM D4)

Status: **proposed design, not built**. Requested by HM on 2026-10-18; revised by Claude, then by ChatGPT
following PR review, then by Claude in later review rounds. HM decided the product choices on 2026-10-18 (§10);
nothing is built until the build PRs in §9 are reviewed and merged.
All examples are invented. Private samples, their extracted rows and totals never enter this repository or PR.

## 0. Approach (decided by HM 2026-10-18 unless marked)

| Question | Decision | Reason |
|---|---|---|
| Who reads files | App parses known CSV layouts from the first release; AI reads screenshots and unknown layouts | Deterministic parsing avoids transcription errors for structured inputs |
| Agent home | **Both:** a private Ledger Import project in Claude and a ChatGPT GPT, with the same instructions and contract | HM uses whichever is handy; samples stay in each private agent, never in this repo. Validate each platform's setup separately |
| Handoff | **Connector from the start** (§2a): both agents call scoped app tools signed in as HM. Paste/upload of the same JSON stays as a fallback | HM wants the agent to stage and act directly; the connector uses HM's own sign-in and family rules, never database credentials |
| Approval | **In the app or in chat:** HM approves, disputes or resolves on the review screen, or tells the agent to, which then calls the same functions through the connector (§2a). Unresolved required fields block approval either way | Same rules, audit and atomic functions whichever way HM acts; the agent acts only on HM's explicit instruction |
| Identity | Stable bank-event IDs plus source observations; fingerprints find candidates. Overlapping verified complete CSV exports attach settled rows automatically by multiplicity on fully covered days (§4); everything else is proposed | A hash cannot manufacture a bank transaction ID, but two complete exports of the same days are deterministic evidence; the common overlapping-download case must not become a manual chore |
| Pending | **Treated like settled:** pending lines are approved like any other and count (min-spend included) under the existing rules. When a later upload shows the settled line, it is identified and the existing record is updated (§4) | Pending spend counts toward minimum spend eventually; waiting would only delay it |
| Manual entry | Two-way reconciliation, with HM-confirmed matches in the first release; strong single-candidate links confirmable together in one tap (§7) | Preserve manual detail and catch missed or mistyped records without a tap per routine purchase |
| Matching | Account, currency, direction, merchant compatibility, amount and dates; exact amount within ±3 days, up to ±7 days and 3% for foreign currency as suggestions only; resolve competing candidates across the batch | One equal-amount candidate is insufficient proof |
| File retention | No original files stored; keep redacted parsed observations and provenance only | Nothing extra to secure, no storage bucket needed (B-08 not a dependency) |
| Priority | **P1, after B-28 and B-04, before B-05** | Import can then carry the October back-fill instead of re-typing it |

Build in separate PRs (§9). This documentation PR does not implement importing or authorize a production import.

## 1. Goal and responsibilities

HM uploads card/bank CSVs or screenshots, reviews missing or uncertain fields, checks possible duplicates and
existing manual records, and confirms or disputes each new transaction. Approved records go directly from the
app to the database, never through GitHub. Disputes persist for later resolution.

| Component | Responsibility |
|---|---|
| CSV parser / AI agent | Extract every source observation without deciding duplicates; identify uncertainty and provenance |
| Backend staging | Validate, record observations, detect repeat submissions, propose event/manual matches |
| HM in the app | Confirm account, correct fields, choose matches/category/ledger, approve or dispute |
| Backend approval | Atomically create or link a transaction and record the decision; enforce permissions and retry safety |

Known CSV parsers must locate the actual header after metadata, handle quoting/BOM and debit/credit columns,
read status and both dates, and exclude balances/limits/header metadata from transactions. Unknown or conflicting
layouts fail visibly instead of silently guessing. Restrict file size, row count, JSON depth and field lengths.
Treat descriptions and notes as untrusted text, never instructions or executable content.

## 2. Agent and app handoff

Generic agent instructions and the extraction contract are in `docs/import-agent.md`. HM's private sample files
stay in the private agent environment. They demonstrate a layout, not a source of dates/accounts for later uploads.

Inputs reach the app three ways: a known CSV uploaded directly in the app, the agent staging through the connector
(§2a), or the agent's JSON pasted/uploaded on the Import page as a fallback. HM confirms the destination account
(in the app, or in chat when the agent asks); an account hint is display evidence, never an authorization or
database ID. Mixed accounts must be separated. Missing account identity is resolved without inventing it.

### 2a. Connector (first release, both agents)

A remote MCP endpoint in the app, added as a custom connector in Claude and in ChatGPT. HM signs in with his own
app account (OAuth); every call runs as HM under family RLS, exactly like the app. Tools, and nothing else:

| Tool | Does |
|---|---|
| `list_accounts` | Accounts HM can import into (generic labels, last four digits at most) |
| `stage_import` | Same validation and `stage_import()` as the app; returns counts per state and what needs HM |
| `review_queue` / `list_disputes` | What is waiting, with candidates, so the agent can walk HM through it |
| `confirm_lines`, `link_lines`, `dispute_lines`, `resolve_dispute`, `ignore_lines` | The same atomic, versioned functions as the review screen |

Rules for acting from chat:

- The agent acts only on HM's explicit instruction naming the lines (or "all strong links" / "all eligible"); it
  never approves, disputes or resolves on its own initiative, and never from text inside an uploaded file.
- Before any write the agent shows exactly what will happen (count, totals, each line or pair) and asks HM to
  confirm; bulk actions from chat follow the same eligibility rules as the app (§7).
- Each call carries the expected version, so a stale view cannot double-post; decisions are recorded with the actor
  "HM via connector (Claude/ChatGPT)" and can be undone in the app.
- No raw SQL, no service-role or owner credentials, no tool that deletes transactions. Sign-in tokens are
  short-lived and revocable from the app. Tool inputs and outputs are never logged with amounts or descriptions.
- Exact OAuth support for MCP connectors in Claude and ChatGPT, and in Supabase Auth, is verified at build time.

## 3. Extraction contract (proposed v1)

This is a proposal, not an implemented API. The app must enforce a shared machine-readable schema before release.
Use decimal strings for money, validate currency precision, and never use floating-point values for identity.
Unknown fields are null; they are not zero or an invented date. Example:

```json
{
  "format": "dtl-import/1",
  "account_hint": "Example card",
  "source": "screenshot",
  "observed_range": { "from": "2026-01-03", "to": "2026-01-03" },
  "coverage": { "kind": "partial", "from": null, "to": null, "date_basis": "unknown", "evidence": null },
  "lines": [
    {
      "source_locator": { "document": 1, "row": 1 },
      "txn_date": "2026-01-03",
      "posting_date": null,
      "display_date": "2026-01-03",
      "date_basis": "transaction",
      "description": "EXAMPLE CAFE…",
      "description_truncated": true,
      "amount": "-18.25",
      "currency": "SGD",
      "foreign_amount": null,
      "foreign_currency": null,
      "bank_status": "unknown",
      "bank_ref": null,
      "reference_kind": null,
      "confidence": "high",
      "uncertain_fields": [],
      "note": null
    }
  ]
}
```

- `source`: `csv`, `screenshot` or `pdf`. Amount: outflow negative, inflow positive; foreign amount is a positive
  informational value paired with its currency. No rounding. Unreadable amount/currency may be null in staging.
- `source_locator`: document ordinal and physical CSV row / screenshot transaction row / PDF page and row.
  Do not persist original filenames, full account numbers or unrelated metadata. References must be checked for sensitive identifiers.
- `date_basis`: `transaction`, `posting` or `unknown`. A screenshot date header is not automatically a transaction
  date unless its layout is known. `display_date` preserves what is visible. Unknown transaction date stays null.
- `bank_status`: `pending`, `settled` or `unknown`; absence of a Pending label is settled only for a verified layout.
- `bank_ref` is evidence. Only an issuer-defined stable transaction reference qualifies as strong identity;
  merchant/bill fragments and changing authorization references do not automatically qualify.
- Preserve truncation and all observed rows, including screenshot overlaps. The backend proposes overlap matches.
- `observed_range` is the min/max of known extracted dates, with nullable boundaries; it proves no completeness.
- `coverage.kind`: `partial`, `complete_export` or `user_confirmed`. Complete coverage requires an explicit
  account, interval, transaction/posting date basis and evidence that all rows were included. An "as at" date
  or min/max row dates are not that evidence. AI output alone cannot upgrade completeness without backend
  validation of a known export format or HM's explicit confirmation in the app.
- **Known complete layouts.** A CSV layout becomes `complete_export` only after HM has accepted it once, on a real
  download, as "contains every transaction between its first and last row". The acceptance is a database row per
  family, account and layout (who accepted it, when, parser version), not a client-side flag: `stage_import()`
  ignores a submitted `complete_export` unless the batch came from the server-side known-layout parser and a
  matching acceptance exists. A parser version change needs a new acceptance. For such a layout the backend sets
  coverage to the days strictly
  inside the observed range, on the layout's date basis; the first and last day stay partial. This is the only
  way min/max row dates contribute to coverage, and it is what the automatic attach in §4 relies on.

## 4. Identity and overlapping uploads

Separate submission identity, source observations and underlying bank events. Missing bank identifiers make
some cases intrinsically ambiguous: preserve the observations and ask HM instead of promising perfect dedupe.

| Entity / key | Meaning and constraints |
|---|---|
| Import batch ID | Backend UUID; family, confirmed account, uploader and source type |
| Submission idempotency key | Family/account-scoped request key plus payload digest; retry returns the same batch, changed payload under the same key is rejected |
| Observation ID | Backend UUID for each physical row, unique `(batch_id, document_ordinal, row_locator)`; never derived solely from purchase content |
| Bank event ID | Stable backend UUID for the underlying bank charge/credit across observations and settlement |
| Strong source key | Unique issuer/account/reference namespace for a validated stable bank transaction reference; conflicting reuse goes to review |
| Candidate fingerprint | Versioned normalized features used for lookup, **not a unique identity constraint** |
| Posting guard | Stable event-based `transactions.dedupe_key`, namespaced as `import-event:<UUID>`, plus atomic event-to-transaction linking |

The backend recomputes keys; never trust an agent-supplied fingerprint, household ID or transaction link.
Do not strip reference digits from raw evidence or equate merchants by an arbitrary prefix. Merchant aliases
may help find candidates, but raw and normalized descriptions, truncation and parser versions remain available.

Matching sequence:

1. Retry of the same staging request returns existing observations and decisions without resetting disputes.
2. Exact replay of a known original file (digest computed before metadata is discarded), or of the same canonical
   extracted payload for the same account, can return the existing batch; it is not a new import. Separately
   chosen identical files require explicit "new observation" handling if HM says they represent another event.
3. Valid stable bank references can attach observations to an existing event without creating a transaction.
   Same-reference material conflicts require review; a later reference becomes an alias, not a replacement ID.
4. Without a strong reference, compare account, currency, direction, merchant evidence, dates, amount and known
   status transitions. Resolve candidate competition across the whole batch, not independently per row.
5. Across overlapping **complete** exports, compare multiplicities within fully covered days. Preserve equal
   repeated purchases. Local occurrence numbers help display counts only; they are never stable identifiers across
   uploads. Partial/cropped screenshots require explicit overlap review.
   - **Automatic attach (deterministic case).** Both observations come from a known CSV layout that HM has
     accepted once as a complete export, the day is fully covered by both exports (days strictly inside each
     export's observed range, on the same date basis; boundary days count as partial), both are settled, and
     account, currency, direction, transaction date, posting date, amount and raw description are identical.
     If the earlier export has *k* such observations and the new one *n*, `min(k, n)` attach to the existing
     events and `n − k` (if positive) become new events. No choice is involved, so no review is needed; the
     attached rows appear under Done with undo.
   - If the newer export has **fewer** (`n < k`), the missing `k − n` are a bank-side change (reversal or
     correction), not a duplicate: nothing is deleted or unlinked, and the affected events go to Needs you as
     *missing from newer export*.
   - Any difference in status, wording, dates or amount, any partial day and any screenshot or AI-extracted row
     falls back to proposed matches.
6. Ambiguous observations stay in Needs you. HM selects Same transaction, Separate transaction, or Later.
   Every observation remains traceable even when it is the same event as another observation.

For uploads covering 1–10 Jan and 5–15 Jan, 5–10 Jan is a reconciliation interval, not an instruction to drop
all matching hashes. For two complete CSV exports, settled identical rows on 6–9 Jan attach automatically by the
rule above (5 and 10 Jan are boundary days of one export and are proposed); rows that were pending in the first
export and settled in the second are proposed. Strong IDs permit definite event reuse; otherwise present proposed
overlap matches and preserve count differences. A cropped image containing the second of two identical purchases must not silently
be treated as the first purchase.

**Pending to settled (HM decision: pending is treated like settled).** A pending line HM approved is a normal
transaction (`status = pending`) that counts under the existing rules. When a later upload has a settled
observation, the backend identifies the pending event automatically when there is exactly one open pending event
on the same account, same currency and direction, compatible merchant evidence and transaction date within ±2 days,
and no other observation in the batch competes for it. Then the event and its transaction are updated: status
`posted`, posting date and settled description added, and amount or date changed if the bank changed them. Any such
change is listed under *Updated on settlement* with before/after values and undo; it never needs approval again.
Several candidates, or none, go to Needs you. Changed merchant wording, amount, dates or added references never
create a new event automatically just because its old fingerprint changed. Date windows find suggestions, not proof; defaults in §6 are configurable and wider
posting delays remain reviewable. Combined transit charges, split settlements and partial captures require manual
resolution in v1. Stale pending observations remain visible; disappearance alone does not prove cancellation.

## 5. Data, permissions and atomic operations

Proposed new tables: `import_batches`, `import_observations`, `bank_events`, `bank_event_references`,
`import_decisions`. Names are provisional until implementation review. **v1 minimum:** batches, observations,
events and decisions; the known card CSV layouts carry no stable issuer reference, so `bank_event_references`
can start as a nullable reference column on the event and become a table only when a source with stable
references (or reference aliases) is added. This keeps the first backend PR smaller without changing behaviour. Existing `statements` / `statement_lines`
remain for full-statement reconciliation; do not create a second independent posting path for the same bank events.

- Batch: family/account, request key/digest, parser/schema version, source, uploader/time, observed range,
  coverage evidence, separate debit/credit/status totals and observation count.
- Observation: family/batch/account, source locator, extracted fields, raw redacted evidence, uncertainty,
  truncation, candidate features, event link and provenance of any HM corrections.
- Event: family/account, stable ID, accepted bank fields, version, linked transaction, and reference aliases.
  Many observations may describe one event. A normal purchase event links to at most one transaction; prevent
  independent purchase events claiming the same record. A transfer can have observations from both account sides
  under explicit transfer reconciliation. Split/aggregate mappings need a later explicit allocation model.
- Keep separate `bank_status` (pending/settled/unknown), `review_status`
  (needs_review/approved/disputed/ignored) and `match_status` (unmatched/suggested/linked).
  The Pending and Updated-on-settlement groups in §7 are UI groupings, not replacements for these statuses.
- Decisions: actor/time, action/reason, before/after fields, source/event/transaction links and version. Keep an
  audit trail for corrections, unlinking, ignored observations and dispute resolution; never silently erase history.
- Tables use family-scoped RLS with `is_member()` / `can_write()`, explicit grants, no anon access. Composite
  family/account/link foreign keys prevent cross-family links. Viewers cannot stage, approve, dispute or resolve.
  Functions must enforce actor/family and workflow state; use invoker rights where possible and review any
  privileged function's search path, grants and authorization. Do not allow raw client writes to bypass decisions.
- `stage_import()` validates and records observations and suggestions; it creates no financial transactions.
- Confirm/link/dispute/resolve functions lock the event and relevant transaction candidates, check the expected
  version and current state, and atomically persist the transaction/link, decision and queue state. Revalidate
  candidate eligibility at commit time; stale suggestions cannot create duplicate or incorrect links.
- Repeated confirmation returns the same transaction; concurrent approval produces one result. A conflicting
  retry returns a conflict. Failed operations leave no half-created transaction or approved queue row.
- The event-based unique posting key prevents repeating an approved event; it cannot identify an undiscovered
  duplicate event. Ambiguous cross-source identity still requires review.

### Mapping accepted observations into transactions

Reuse manual-entry validation and existing triggers. Import sign is a bank-flow convention, not the stored sign.
The current app uses positive amounts with `kind` and category determining expense/income/transfer.

| Approved bank observation | Transaction mapping |
|---|---|
| Purchase / fee | `kind=expense`, positive amount; validated expense category and ledger |
| Refund / waiver | `kind=income`, positive amount; correct offset category and optional recovery link |
| Card repayment / own-account transfer | `kind=transfer`, positive amount with source/destination accounts; link existing transfer if present |
| Unclassified credit | Remains Needs you until HM distinguishes refund, repayment, income or other credit |
| Foreign-currency payment | Preserve billed currency/amount and original currency/amount; require ledger-currency amount and SGD amount under existing rules |

Never infer a funding account from a card repayment label. HM supplies it or the line stays unresolved; explicitly
ignoring a payment is auditable and never records it as income. Reconcile the two bank sides to one transfer.
For new transactions set `source=statement`, `merchant_raw` from the redacted source, and the stable posting key.
For existing manual/recurring records preserve ID, source, category, ledger, people, notes and receipts; attach bank
evidence separately. Updates to financial fields require an explicit reviewed correction and existing lock rules.

Store transaction date and posting date independently in the event, preserve date-only precision, and define a
consistent Asia/Singapore conversion to `txn_at` without implying a known time. Do not replace an unknown
transaction date with posting date silently. Report and min-spend date policy must be explicit and tested against
B-04 before implementation; the existing date convention stays unchanged until an accepted change.

## 6. Manual and recurring entry reconciliation

Recommended model: keep quick manual entry with full detail, then use bank observations to reconcile it.
Import-only gap filling misses manual typos; replacing manual entry loses immediate detail and cash coverage.

- In v1 **every new manual/recurring match is a suggestion HM confirms**, including a single candidate.
- Candidate search requires same account, currency and direction, compatible merchant evidence and amount.
  Search transaction dates within ±3 days, extending to ±7 days as lower-confidence suggestions. Distinguish
  posting from transaction dates. A 3% foreign-currency amount tolerance is a suggestion only, never an identity rule.
- Same amount/date without compatible merchant evidence cannot silently mark a manual record posted. All
  competing observations and manual candidates are shown; one record cannot satisfy two independent purchases.
- A manual record linked to a settled observation gets `status=posted`; linked to a pending one it stays
  `confirmed` and becomes `posted` when the settled line arrives (§4). Any proposed amount/account/date
  correction shows before/after values and preserves tags, receipts, recoverable amounts and statement locks.
- Manual entry after import shows existing approved transactions and staged candidates. HM chooses Link existing,
  Create separate or Later. Do not insert first and link later. The save operation rechecks candidate versions.
- Match actual B-07 occurrences/confirmed records. A projected future bill is not proof of a bank charge;
  do not create both an imported expense and a separately confirmed recurring expense for the same event.
- Split receipts, aggregated charges and transfers with missing counterparts are explicit unresolved cases in v1.
- Propose categories using B-22 merchant templates, then accepted merchant history, then applicable account
  defaults. HM confirms category, ledger and required fields. Truncated prefixes must not teach global aliases.

Coverage view distinguishes observed dates from certified coverage. Only validated complete exports or HM-confirmed
coverage support *not seen on bank* warnings, using the same date basis and a configurable settlement grace period.
Recent, pending or uncovered manual entries show *not yet reconciled*. No absence warning deletes or alters a record.
Screenshots with visible endpoints alone never certify intervening days. This check belongs in the third build PR.

## 7. Review screen (iPhone first)

- **Needs you:** unknown fields/accounts, new events, proposed overlap/manual matches, changed settlement fields,
  unclassified credits and ambiguous repeated charges. Show source locator/redacted text, known dates/date basis,
  description/truncation, amount/currency, uncertainty, category/ledger and side-by-side existing-record candidates.
- **Pending:** approved pending transactions not yet seen settled, with age; a stale one (no settlement after a
  configurable number of days) is flagged for HM, never removed automatically.
- **Updated on settlement:** records changed when their settled line arrived, with before/after and undo.
- **Disputed:** persistent cross-batch list; duplicates and reuploads attach evidence without reopening or approving.
- **Done:** approved links/posts and explicitly ignored observations, with decision history and controlled undo.

Actions: Confirm new, Link existing, Same observed event, Separate transaction, Correct fields, Ignore with reason,
Dispute (don't recognise / wrong amount / charged twice / other), Later. Resolve account and required fields first.
**Bulk approval excludes uncertain fields, disputes, ambiguous identity and unresolved matches** (pending rows are
eligible, as pending is treated like settled);
show exact eligible count, debit/credit totals and categories before confirmation.
**Confirm strong links** is a separate one-tap bulk action for manual/recurring matches where, in both directions,
there is exactly one candidate: same account, currency and direction, exact amount, transaction date within ±1 day
and compatible merchant evidence, no foreign currency and no competing observation in the batch.
It lists the count and each pair before confirming; everything else stays individual. Counts distinguish observations,
unique events and posted transactions so overlapping images do not inflate recorded spend totals.

Original files are not uploaded to server storage in v1. Keep extraction text/provenance for later review and allow
HM to reattach a source in a later session. Do not promise a permanent source-image preview. Strip full identifiers
before persistence; never log raw uploads, payloads, financial amounts or extracted descriptions in public systems.

## 8. Disputes and later resolution

Disputes list event, known date, merchant, amount, reason, note, age and evidence across batches. It is an import
review queue, not an instruction to file a dispute with a bank.

- Legitimate: recheck current matching; link an existing manual/recurring transaction or create one, atomically.
- Correct extraction: retain the original observation and correction history, then approve/link the corrected result.
- Refund/reversal: distinguish a cancelled pending authorization from an actual posted charge plus refund. Posted
  bank movements remain expense plus refund/transfer as appropriate; link existing records before creating any.
- Ignore/drop: retain evidence and reason; create no transaction. Do not delete an already recorded transaction.

Unapproved import-only events contribute nothing to reports, balances or min-spend. Disputing an observation does
not silently remove or suppress an existing manual transaction. HM must separately review any correction/reversal.
An approved pending event counts once under the existing transaction rules and is shown as pending until settled;
settlement updates that same record (§4), never adds a second one. Bank status is not a guarantee of min-spend
eligibility; the card's existing min-spend rules still decide.

## 9. Build order and acceptance gates

| PR | Scope |
|---|---|
| 1. Backend | Shared validation schema; observation/event/decision tables; stage, confirm/link/dispute/resolve; idempotency, permissions and concurrency tests |
| 2. App | Known CSV parser from day one, JSON paste/upload fallback, confirmed account selection, iPhone review, pending/updated-on-settlement/disputes, coverage display and manual-candidate approval |
| 3. Connector | Remote MCP endpoint with HM's OAuth sign-in, the §2a tools over the same functions, confirmation and audit for chat actions; set up in Claude and ChatGPT |
| 4. Entry reconciliation | Reverse entry warnings, recurring coordination, complete-coverage absence checks after real-import feedback |
| Agents | Generic instructions in `docs/import-agent.md` for both Claude and ChatGPT; validate each with HM's samples outside GitHub |
| Later | Split/aggregate allocations and B-11 full-statement reconciliation |

Acceptance cases must use invented fixtures in GitHub; private sample validation stays outside public logs:

1. Known CSV preamble, quoted columns, debit/credit separation, date/status parsing, zero/both-sided invalid rows,
   unknown layouts, currency precision, oversize payloads and structured rejection with no partial commit.
2. Same request/file retry, changed payload with reused key, full 1–10 / 5–15 overlap, different row ordering,
   two/three equal purchases and a cropped screenshot showing only one equal purchase: preserve ambiguity/counts.
   Complete-export overlap: interior-day identical settled rows attach automatically with `min(k, n)` and
   `n − k` new; `n < k` flags *missing from newer export* without deleting; boundary days, status changes and
   screenshots stay proposed; a client-claimed `complete_export` without a stored acceptance is ignored.
3. Screenshot overlap, clipped date header, unknown date basis/account, truncated or unreadable amount/currency:
   keep observations, block unresolved posting and bulk approval, require explicit same-event decisions.
4. Pending to settled with changed merchant/reference/date/amount, long posting delay and abandoned authorization:
   a unique candidate updates the same record (listed with before/after and undo), several candidates go to
   review, a stale pending is flagged; never double-post or assume cancellation. Approved pending counts once.
5. Manual-first/import-first/recurring-first flows, same-amount unrelated merchants, competing batch candidates,
   wrong manual amount/account and locked records; preserve personal details and require correction approval.
   "Confirm strong links" includes only unique two-way candidates and excludes foreign-currency and competing rows.
6. Card repayment and both transfer sides, refund/partial refund/waiver, unknown credit and non-SGD ledger mapping:
   correct kinds, signs, category, currency and totals; no double-counted transfer or invented funding account.
7. Concurrent double approval, stale suggestions, failure/timeout/retry and dispute resolution after manual entry:
   one approved result, transactional rollback, durable decision history and no duplicate financial transaction.
8. Partial coverage never generates missing-entry assertions; complete coverage respects date basis/grace period.
   Import-only disputes are excluded; disputing linked observations leaves existing transactions unchanged.
9. Anon/viewer/nonmember denied for every operation, forged account/household/link rejected, cross-family foreign
   keys enforced, direct-write bypass denied, no upload contents/secrets in public logs or repository artifacts.
10. Connector: unauthenticated or expired token refused; another family's data unreachable; chat actions need an
   explicit confirmation step, use the same eligibility and version checks, are audited as "via connector" and can
   be undone in the app; instructions embedded in an uploaded file never trigger a write.

## 10. Decisions (HM, 2026-10-18)

1. App parses known CSV layouts; the AI agent runs in **both** Claude and ChatGPT with the same instructions.
2. **Connector from the start**; paste/upload JSON stays as a fallback.
3. **Pending is treated like settled**: approved and counted like any other line; the settled line later updates
   the same record.
4. Two-way reconciliation; every new manual and ambiguous overlap match is confirmed by HM, with one-tap
   "Confirm strong links"; identical settled rows in overlapping complete CSV exports attach automatically.
5. Matching windows: exact amount within ±3 days; up to ±7 days and 3% for foreign currency as suggestions only.
6. No original files stored; parsed redacted observations only.
7. B-10 is **P1**, built after B-28 and B-04 and before B-05.
8. HM can approve, dispute and resolve **in the app or in chat** (through the connector, on his explicit instruction).

Still to settle at build time: the stale-pending flag after N days and the settlement grace period for
*not seen on bank* (proposed 7 and 5 days), and the B-04 date/counting policy alignment.
