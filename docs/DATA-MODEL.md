# Data model

How money is recorded and reported. The full design and decisions are in `design/category-design.md`.

## Transactions

One table for money out (`kind = 'expense'`) and money in (`kind = 'income'`). The category decides
the kind. Amounts are always positive; a refund is an income in 回款类 / 退款.

| Field | Meaning |
| --- | --- |
| `ledger_id` | Which ledger (账本). Defaults to the household's daily ledger. |
| `category_id` | Two-level category. Its group's nature drives reports. Required on every expense and income; transfers have none. |
| `account_id` | Card or account used. Required for paybacks (回款类). |
| `merchant` | Shop, school, platform. Used instead of merchant-named categories (课外班 uses it for the class). |
| `property_id` | Which property (房产). Set automatically in a rental ledger; required for 租金. |
| `recoverable_amount` | Part of an expense someone will pay back (AA, claims). 0 for most spend; full amount by default for 代付款. |
| `recovery_status` | `to_submit` → `submitted` → `received` (set when a payback is linked). |
| people (`transaction_people`) | Who the spend was for. Many per transaction. |

**Self-paid amount** = amount − recoverable amount. Reports and budgets use it.
**Min-spend** uses the full card amount; refunds back to the card (退款) count against it; rebates (返现) do not. Card fees and interest (手续费, 卡年费, 滞纳金利息; `categories.counts_to_min_spend = false`) never count, and their waivers (手续费免除) don't either.

## Categories

Top-level groups carry `nature`; children inherit it.

| Nature | Groups | Reports and budgets |
| --- | --- | --- |
| `living` 生活消费 | 住房, 子女教育, 餐饮, 医疗健康, 用车, 买菜日用, 购物, 休闲娱乐, 人情往来, 出行, 其他, 旅行 (trip only) | Counted, budgetable |
| `financial` 财务支出 | 保险理财, 税费, 出租成本 (rental only) | Counted as a separate spend stream, budgetable |
| `pass_through` 过手款 | 代付款 | Only the self-paid part counts; no budgets |
| `real` 真实收入 | 投资收入; 租金收入 (rental ledgers only) | Real income. Rent stays in its property's P&L, never household income |
| `offset` 冲减项 | 回款类, 其他 | Not income; settles spend |

`ledger_type` on a group limits it to one kind of ledger (旅行 → trip; 出租成本 and 租金收入 → property).

## Ledgers

| Type | Counts in household totals | Use |
| --- | --- | --- |
| `daily` | Yes (default ledger) | Everyday spending |
| `trip` | Yes | One per trip; dates and default currency |
| `property` | No — separate P&L | One per rental property; tagged with that property |

Every ledger has a **currency** (`default_currency`, SGD unless chosen): amounts entered in it are in that
currency, and it can't change once the ledger has records. A ledger's type, property and default flag never
change, and the default ledger can't be archived or deleted. Creating a rental ledger (`create_ledger`) also
creates its property tag with the same name: one property, one ledger.

**Amounts on a transaction.** `amount` + `currency` are in the ledger's currency. `amount_sgd` is the SGD amount
(copied from `amount` in SGD ledgers; typed on each entry in other ledgers) and is what reports add up. An entry
can also carry `foreign_amount` + `foreign_currency` when it was paid in a third currency: for information only,
never used in totals, no exchange rates stored. Both are set or both empty, the amount is above zero, and the
currency differs from the transaction's.

**Accounts are shared across ledgers.** A card's balance, statement and min-spend add up spend from every
ledger of the family. Reports group by ledger, so each ledger's spending stays separate.

**Paybacks.** An income in a payback category can be linked to the expenses it settles (`recovery_links`). Each
link has an `amount`: the part of the payback that settles that expense. An expense becomes *Received* only when its
links add up to its recoverable amount; until then it keeps its status and the payback pool counts what is left.

## Accounts and transfers

| Type | Balance | Notes |
| --- | --- | --- |
| `credit_card` | Negative = owed | Statement day, due day or days after statement, credit limit, annual fee month |
| `bank` | Money in the account | Statement reconciliation |
| `debit_card` | — | `funding_account_id` → its bank; spend lands on the bank's balance |
| `stored_value` | Money on the wallet | Topped up by transfer from bank or card |
| `cash` | Optional | |

Every new family is given one `cash` account named 现金 (trigger `households_default_cash`), so cash can be tracked from day one.

A **transfer** (`kind = 'transfer'`, `account_id` → `to_account_id`, no category) moves money between own
accounts: card bill payments, top-ups, cash withdrawals. Spending from stored value is recorded when the
wallet is used, so nothing is counted twice. Each top-up from a credit card has its own
`counts_to_min_spend`, chosen when it's recorded (default: doesn't count). The card-level
`accounts.topups_count_to_min_spend` is no longer set by the app and stays false.

**Names:** `accounts.name` is the official card or account name (unique per family); the optional
`accounts.nickname` is the friendly name shown first in the app.

**Balance** = opening balance + movements after `opening_balance_date` (`v_account_balances`).

## Statements

`statements` (period, opening and closing balance, due date for cards) and `statement_lines` (signed:
negative = money out / card charge). Lines are matched to transactions (`transaction_id`). A statement can
be marked `reconciled` only when every line is matched and the lines add up to closing − opening; its
matched transactions are then locked. Card due dates default from the card's settings.

## Paybacks

A payback is an income in 回款类. Link it to the expenses it settles (`recovery_links`) and they become
`received`; linking to spend with nothing recoverable (e.g. a fee waiver) makes it recoverable up to the
payback amount. Unlinked 报销到账 / 代付款收回 (`counts_against_pool`) still reduce the pool total; unlinked
refunds and waivers do not.

## Views

| View | What |
| --- | --- |
| `v_transactions_report` | One row per transaction with nature, ledger, month (Singapore time) and self-paid SGD |
| `v_monthly_summary` | Totals by ledger, month, kind and nature |
| `v_recovery_pool` | To submit, submitted, unlinked paybacks, outstanding |
| `v_recovery_matches` | Each payback vs the recoverable amounts linked to it |
| `v_min_spend_lines` | Signed card lines for min-spend periods (spend, refunds, top-ups chosen to count) |
| `v_property_pnl` | Monthly income, cost and net per property |
| `v_account_movements` | Each transaction's effect on each account it touches |
| `v_account_balances` | Current balance per account (debit cards roll into their bank) |
| `v_statement_check` | Lines total vs balance change, unmatched lines and transactions |
| `v_card_statement_status` | Amount due, paid until the next statement and by the due date; paid / paid late / part paid / unpaid / overdue |

## Receipt photos

A record can carry one photo: `transactions.receipt_id` → `receipts` (one row per photo, `image_path`). The file lives in
the private Supabase Storage bucket `receipts` at `<family id>/<record id>/<file id>.jpg` (created by migration
`20261007020000_receipt_photos.sql`). Read: any member of the family. Add, replace, remove: members who can write
(not viewers). The browser shrinks photos (longest side 1600 px) before uploading, and the app shows them through
signed links that expire after an hour.
