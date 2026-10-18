# Transaction import with review (B-10, RTM D4)

Status: **proposed design, not built**. Requested by HM on 2026-10-18; revised by Claude, then by ChatGPT
following PR review. Implementation, priority and product choices below still require HM's decision.
All examples are invented. Private samples, their extracted rows and totals never enter this repository or PR.

## 0. Recommended approach (for HM's review)

| Question | Recommendation | Reason |
|---|---|---|
| Who reads files | App parses known CSV layouts from the first release; AI reads screenshots and unknown layouts | Deterministic parsing avoids transcription errors for structured inputs |
| Agent home | Separate private Ledger Import project in Claude, or a ChatGPT agent with the same extraction contract | Samples teach layouts; keep financial inputs separate from development context. Validate each platform's setup separately |
| Handoff | Paste or upload standard JSON into the signed-in app; connector later | The first release needs no agent database credentials |
| Approval | HM approves in the app; unresolved required fields block approval | Review is durable and uses family permissions |
| Identity | Stable bank-event IDs plus source observations; fingerprints find candidates | A hash cannot manufacture a bank transaction ID when the source supplies none |
| Pending | Waiting by default; explicit early confirmation allowed after validation | Settlement can change dates, descriptions and amounts |
| Manual entry | Two-way reconciliation, with HM-confirmed matches in the first release | Preserve manual detail and catch missed or mistyped records |
| Matching | Account, currency, direction, merchant compatibility, amount and dates; resolve competing candidates across the batch | One equal-amount candidate is insufficient proof |
| File retention | No server-side original uploads initially; retain redacted parsed observations and provenance | Enables review without adding a storage dependency; later original-file retention is a separate choice |
| Priority | Recommend P1 after B-28 and B-04, before B-05; **not yet accepted** | Import could reduce back-fill effort; existing priority remains unchanged |

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

First release: known CSV directly to the app, or AI JSON pasted/uploaded to Import. The app always asks HM to
confirm the destination account; an account hint is display evidence, never an authorization or database ID.
Mixed accounts must be separated. Missing account identity can be resolved in the app without inventing it.

Later: a connector may expose scoped `list_accounts`, `stage_import`, `review_queue` and `list_disputes` tools
with user authentication and family authorization. Approval remains in the app. Generic privileged SQL access
is not recommended: service-role/owner credentials can bypass RLS; normal authorized access need not bypass it.
Never give the agent privileged database credentials. Verify platform connector/auth requirements when building.

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
5. Across overlapping **complete** exports, compare multiplicities within fully covered days and suggest the
   overlapping events. Preserve equal repeated purchases. Local occurrence numbers help display counts only;
   they are never stable identifiers across uploads. Partial/cropped screenshots require explicit overlap review.
6. Ambiguous observations stay in Needs you. HM selects Same transaction, Separate transaction, or Later.
   Every observation remains traceable even when it is the same event as another observation.

For uploads covering 1–10 Jan and 5–15 Jan, 5–10 Jan is a reconciliation interval, not an instruction to drop
all matching hashes. Strong IDs permit definite event reuse; otherwise present proposed overlap matches and
preserve count differences. A cropped image containing the second of two identical purchases must not silently
be treated as the first purchase.

Pending-to-settled observations attach to the same event only on adequate identity evidence or HM's confirmation.
Changed merchant wording, amount, dates or added references never create a new event automatically just because
its old fingerprint changed. Date windows find suggestions, not proof; defaults in §6 are configurable and wider
posting delays remain reviewable. Combined transit charges, split settlements and partial captures require manual
resolution in v1. Stale pending observations remain visible; disappearance alone does not prove cancellation.

## 5. Data, permissions and atomic operations

Proposed new tables: `import_batches`, `import_observations`, `bank_events`, `bank_event_references`,
`import_decisions`. Names are provisional until implementation review. Existing `statements` / `statement_lines`
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
  Waiting is a UI grouping, not a mutually exclusive replacement for disputed or linked.
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
- Confirmed settlement links may set `status=posted`; pending matches do not. Any proposed amount/account/date
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
- **Waiting:** pending observations (including age); approval still needs all required fields and an explicit
  early-confirmation action. Pending is a bank status, separate from HM's acceptance.
- **Disputed:** persistent cross-batch list; duplicates and reuploads attach evidence without reopening or approving.
- **Done:** approved links/posts and explicitly ignored observations, with decision history and controlled undo.

Actions: Confirm new, Link existing, Same observed event, Separate transaction, Correct fields, Ignore with reason,
Dispute (don't recognise / wrong amount / charged twice / other), Later. Resolve account and required fields first.
**Bulk approval excludes uncertain fields, pending rows, disputes, ambiguous identity and unresolved matches**;
show exact eligible count, debit/credit totals and categories before confirmation. Counts distinguish observations,
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
Any early-confirmed pending event counts once under the existing transaction rules, is labelled provisional, and
settlement revises that record only after review. Bank status is not a guarantee of min-spend eligibility.

## 9. Build order and acceptance gates

| PR | Scope |
|---|---|
| 1. Backend | Shared validation schema; observation/event/decision tables; stage, confirm/link/dispute/resolve; idempotency, permissions and concurrency tests |
| 2. App | Known CSV parser from day one, JSON handoff, confirmed account selection, iPhone review, waiting/disputes, coverage display and manual-candidate approval |
| 3. Entry reconciliation | Reverse entry warnings, recurring coordination, complete-coverage absence checks after real-import feedback |
| Agent | Generic instructions in `docs/import-agent.md`; validate the chosen private agent setup with HM's samples outside GitHub |
| Later | Scoped connector, retained originals if requested, split/aggregate allocations and B-11 full-statement reconciliation |

Acceptance cases must use invented fixtures in GitHub; private sample validation stays outside public logs:

1. Known CSV preamble, quoted columns, debit/credit separation, date/status parsing, zero/both-sided invalid rows,
   unknown layouts, currency precision, oversize payloads and structured rejection with no partial commit.
2. Same request/file retry, changed payload with reused key, full 1–10 / 5–15 overlap, different row ordering,
   two/three equal purchases and a cropped screenshot showing only one equal purchase: preserve ambiguity/counts.
3. Screenshot overlap, clipped date header, unknown date basis/account, truncated or unreadable amount/currency:
   keep observations, block unresolved posting and bulk approval, require explicit same-event decisions.
4. Pending to settled with changed merchant/reference/date/amount, long posting delay and abandoned authorization:
   preserve event ID/history; do not double-post or assume cancellation.
5. Manual-first/import-first/recurring-first flows, same-amount unrelated merchants, competing batch candidates,
   wrong manual amount/account and locked records; preserve personal details and require correction approval.
6. Card repayment and both transfer sides, refund/partial refund/waiver, unknown credit and non-SGD ledger mapping:
   correct kinds, signs, category, currency and totals; no double-counted transfer or invented funding account.
7. Concurrent double approval, stale suggestions, failure/timeout/retry and dispute resolution after manual entry:
   one approved result, transactional rollback, durable decision history and no duplicate financial transaction.
8. Partial coverage never generates missing-entry assertions; complete coverage respects date basis/grace period.
   Import-only disputes are excluded; disputing linked observations leaves existing transactions unchanged.
9. Anon/viewer/nonmember denied for every operation, forged account/household/link rejected, cross-family foreign
   keys enforced, direct-write bypass denied, no upload contents/secrets in public logs or repository artifacts.

## 10. Product decisions still open for HM

1. Known CSV parser plus private AI agent for images; choose initial agent platform after a private extraction trial.
2. Paste/upload first; scoped connector later if useful.
3. Pending wait by default, with explicit validated early confirmation.
4. Two-way reconciliation, all new manual and ambiguous overlap matches confirmed by HM in v1.
5. Suggested date/FX search windows and settlement grace period; B-04 date/counting policy alignment.
6. Parsed redacted evidence only initially, no original-file storage; reattach originals when needed.
7. Raise B-10 to P1 after B-28/B-04 and before B-05 (recommendation only; tracker priority unchanged).
