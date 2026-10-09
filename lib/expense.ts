/**
 * Adding an entry (expense, income or transfer): form parsing and small helpers. Pure functions, no database access.
 *
 * Amounts: `amount` is in the ledger's currency. `amount_sgd` is the SGD amount: the same number for
 * SGD ledgers, typed by the person for other currencies. A foreign amount (information only) is only
 * recorded when the person says the payment was made in another currency.
 */

export type ExpenseErrorKey =
  | "err.amount"
  | "err.amountSgd"
  | "err.category"
  | "err.ledger"
  | "err.when"
  | "err.foreignCurrency"
  | "err.foreignAmount"
  | "err.textLong"
  | "err.recoverable"
  | "err.fromAccount"
  | "err.toAccount"
  | "err.sameAccount";

export type ExpenseRow = {
  ledger_id: string;
  amount: number;
  currency: string;
  amount_sgd: number;
  category_id: string;
  account_id: string | null; // null = cash
  merchant_raw: string | null;
  notes: string | null;
  txn_at: string;
  foreign_amount: number | null;
  foreign_currency: string | null;
  /** Part that will be paid back, in the ledger currency; 0 = none. */
  recoverable_amount: number;
  recovery_status: RecoveryStatus | null;
};

/** Statuses offered when adding an expense. "Received" is set later, when the payback is recorded. */
export const ENTRY_RECOVERY_STATUSES = ["to_submit", "submitted"] as const;
export type RecoveryStatus = (typeof ENTRY_RECOVERY_STATUSES)[number];

type Fields = Record<string, string | undefined>;
const blank = (v: string | undefined) => (v ?? "").trim();

/** Currencies offered for "paid in a foreign currency": the family's usual five first, then five more A to Z. */
export const FOREIGN_CURRENCIES = ["USD", "GBP", "EUR", "MYR", "CNY", "AUD", "CAD", "HKD", "JPY", "THB"] as const;

/** The list to show for a ledger: never the ledger's own currency. */
export function foreignCurrencyOptions(ledgerCurrency: string): string[] {
  return FOREIGN_CURRENCIES.filter((c) => c !== ledgerCurrency);
}

const MAX_AMOUNT = 9_999_999_999.99;

/** A positive amount with at most 2 decimals ("1,234.50", "S$12"), or null. */
export function parsePositiveAmount(input: string | undefined): number | null {
  const text = blank(input).replace(/,/g, "").replace(/^S?\$/i, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= MAX_AMOUNT ? n : null;
}

/** "2026-10-06T14:30" (as typed in Singapore) → "2026-10-06T14:30:00+08:00"; null if not a real date and time. */
export function sgtDateTimeToIso(input: string | undefined): string | null {
  const m = blank(input).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  const ok =
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d) &&
    date.getUTCHours() === Number(h) &&
    date.getUTCMinutes() === Number(mi);
  return ok ? `${y}-${mo}-${d}T${h}:${mi}:00+08:00` : null;
}

/** The current moment as "YYYY-MM-DDTHH:mm" in Singapore, for a datetime-local field. */
export function nowSgtInput(now = new Date()): string {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return s.replace(" ", "T");
}

export type EntryKind = "expense" | "income" | "transfer";
export const ENTRY_KINDS: readonly EntryKind[] = ["expense", "income", "transfer"];

export type CategoryOption = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "expense" | "income";
  ledger_type: string | null;
  nature: string | null; // top-level rows only
  requires_account: boolean; // no longer enforced: no account means cash
  requires_property: boolean; // rent: only in a rental ledger
  is_recovery: boolean; // paybacks that settle recoverable spend
  sort_order: number;
};

/** Whether spend in this top-level category is normally paid back (代付款), so the form starts with that ticked. */
export const isPassThrough = (category: { nature: string | null } | undefined) => category?.nature === "pass_through";

/** Sub-categories usable in a ledger of this type (rent only in a rental ledger, when a type is given). */
export function childCategories(categories: CategoryOption[], parentId: string, ledgerType?: string): CategoryOption[] {
  return categories
    .filter((c) => c.parent_id === parentId && (ledgerType === undefined || !c.requires_property || ledgerType === "property"))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Top-level categories of this kind offered in a ledger of this type: unscoped ones plus ones made for that type,
 * leaving out any whose sub-categories can't be used there.
 */
export function topCategoriesFor(categories: CategoryOption[], ledgerType: string, kind: "expense" | "income" = "expense"): CategoryOption[] {
  return categories
    .filter((c) => c.parent_id === null && c.kind === kind && (c.ledger_type === null || c.ledger_type === ledgerType))
    .filter((c) => !categories.some((k) => k.parent_id === c.id) || childCategories(categories, c.id, ledgerType).length > 0)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Reads the add-expense form. `ledger` is the saved ledger the form points at (its currency decides
 * how the amounts are read). The category sent is the sub-category when there is one, else the top level.
 */
export function parseExpenseForm(
  f: Fields,
  ledger: { id: string; currency: string },
): { ok: true; row: ExpenseRow } | { ok: false; errors: ExpenseErrorKey[] } {
  const errors: ExpenseErrorKey[] = [];
  const currency = ledger.currency.toUpperCase();

  const amount = parsePositiveAmount(f.amount);
  if (amount === null) errors.push("err.amount");

  let amountSgd: number | null = amount;
  if (currency !== "SGD") {
    amountSgd = parsePositiveAmount(f.amount_sgd);
    if (amountSgd === null) errors.push("err.amountSgd");
  }

  const category = blank(f.category_id);
  if (!category) errors.push("err.category");

  const txnAt = sgtDateTimeToIso(f.txn_at);
  if (!txnAt) errors.push("err.when");

  const merchant = blank(f.merchant_raw);
  const notes = blank(f.notes);
  if (merchant.length > 100 || notes.length > 500) errors.push("err.textLong");

  let foreignAmount: number | null = null;
  let foreignCurrency: string | null = null;
  if (f.is_foreign === "on") {
    foreignCurrency = blank(f.foreign_currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(foreignCurrency) || foreignCurrency === currency) {
      errors.push("err.foreignCurrency");
      foreignCurrency = null;
    }
    foreignAmount = parsePositiveAmount(f.foreign_amount);
    if (foreignAmount === null) errors.push("err.foreignAmount");
  }

  // Paid back: ticked, an amount (blank = all of it, never more than the amount) and a status.
  let recoverable = 0;
  let recoveryStatus: RecoveryStatus | null = null;
  if (f.is_recoverable === "on" && amount !== null) {
    recoverable = blank(f.recoverable_amount) ? (parsePositiveAmount(f.recoverable_amount) ?? -1) : amount;
    const status = blank(f.recovery_status) || "to_submit";
    if (recoverable <= 0 || recoverable > amount || !(ENTRY_RECOVERY_STATUSES as readonly string[]).includes(status)) {
      errors.push("err.recoverable");
      recoverable = 0;
    } else {
      recoveryStatus = status as RecoveryStatus;
    }
  }

  if (errors.length || amount === null || amountSgd === null || !txnAt) return { ok: false, errors };

  return {
    ok: true,
    row: {
      ledger_id: ledger.id,
      amount,
      currency,
      amount_sgd: amountSgd,
      category_id: category,
      account_id: blank(f.account_id) || null,
      merchant_raw: merchant || null,
      notes: notes || null,
      txn_at: txnAt,
      foreign_amount: foreignAmount,
      foreign_currency: foreignCurrency,
      recoverable_amount: recoverable,
      recovery_status: recoveryStatus,
    },
  };
}

export type IncomeRow = {
  ledger_id: string;
  kind: "income";
  amount: number;
  currency: string;
  amount_sgd: number;
  category_id: string;
  account_id: string | null; // null = cash
  merchant_raw: string | null;
  notes: string | null;
  txn_at: string;
};

export type TransferRow = {
  ledger_id: string;
  kind: "transfer";
  amount: number;
  currency: string;
  amount_sgd: number;
  account_id: string; // from
  to_account_id: string;
  notes: string | null;
  txn_at: string;
};

/** The amount, SGD amount, date and notes that every kind of entry shares. */
function readCommon(f: Fields, currency: string, errors: ExpenseErrorKey[]) {
  const amount = parsePositiveAmount(f.amount);
  if (amount === null) errors.push("err.amount");
  let amountSgd: number | null = amount;
  if (currency !== "SGD") {
    amountSgd = parsePositiveAmount(f.amount_sgd);
    if (amountSgd === null) errors.push("err.amountSgd");
  }
  const txnAt = sgtDateTimeToIso(f.txn_at);
  if (!txnAt) errors.push("err.when");
  return { amount, amountSgd, txnAt, notes: blank(f.notes), merchant: blank(f.merchant_raw) };
}

/** Reads the income form. No account means the money was received in cash. */
export function parseIncomeForm(
  f: Fields,
  ledger: { id: string; currency: string },
): { ok: true; row: IncomeRow } | { ok: false; errors: ExpenseErrorKey[] } {
  const errors: ExpenseErrorKey[] = [];
  const currency = ledger.currency.toUpperCase();
  const c = readCommon(f, currency, errors);
  const categoryId = blank(f.category_id);
  if (!categoryId) errors.push("err.category");
  const account = blank(f.account_id);
  if (c.merchant.length > 100 || c.notes.length > 500) errors.push("err.textLong");
  if (errors.length || c.amount === null || c.amountSgd === null || !c.txnAt) return { ok: false, errors };
  return {
    ok: true,
    row: {
      ledger_id: ledger.id,
      kind: "income",
      amount: c.amount,
      currency,
      amount_sgd: c.amountSgd,
      category_id: categoryId,
      account_id: account || null,
      merchant_raw: c.merchant || null,
      notes: c.notes || null,
      txn_at: c.txnAt,
    },
  };
}

/** Reads the transfer form: money moved between two of the family's own accounts. */
export function parseTransferForm(
  f: Fields,
  ledger: { id: string; currency: string },
): { ok: true; row: TransferRow } | { ok: false; errors: ExpenseErrorKey[] } {
  const errors: ExpenseErrorKey[] = [];
  const currency = ledger.currency.toUpperCase();
  const c = readCommon(f, currency, errors);
  const from = blank(f.account_id);
  const to = blank(f.to_account_id);
  if (!from) errors.push("err.fromAccount");
  if (!to) errors.push("err.toAccount");
  if (from && to && from === to) errors.push("err.sameAccount");
  if (c.notes.length > 500) errors.push("err.textLong");
  if (errors.length || c.amount === null || c.amountSgd === null || !c.txnAt) return { ok: false, errors };
  return {
    ok: true,
    row: {
      ledger_id: ledger.id,
      kind: "transfer",
      amount: c.amount,
      currency,
      amount_sgd: c.amountSgd,
      account_id: from,
      to_account_id: to,
      notes: c.notes || null,
      txn_at: c.txnAt,
    },
  };
}

/**
 * Splits a payback across the expenses it settles, in the order given: each takes what it still waits for,
 * until the payback runs out. Expenses left with nothing are skipped.
 */
export function allocatePayback(incomeAmount: number, claims: { id: string; remaining: number }[]): { id: string; amount: number }[] {
  let left = Math.round(incomeAmount * 100);
  const out: { id: string; amount: number }[] = [];
  for (const c of claims) {
    const take = Math.min(left, Math.round(c.remaining * 100));
    if (take > 0) {
      out.push({ id: c.id, amount: take / 100 });
      left -= take;
    }
  }
  return out;
}

/**
 * The claims an edited payback ends up linked to: those it had that the form did not offer
 * (so could not be ticked or unticked) plus the ones ticked now. Claims offered and unticked are dropped.
 */
export function mergeLinkIds(before: string[], listed: string[], ticked: string[]): string[] {
  const out = before.filter((id) => !listed.includes(id));
  for (const id of ticked) if (!out.includes(id)) out.push(id);
  return out;
}

/** True when both lists hold the same ids, in any order. */
export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** True when the payback is more than the selected expenses still wait for (worth a confirmation). */
export function paybackExceeds(incomeAmount: number, remaining: number[]): boolean {
  return remaining.length > 0 && Math.round(incomeAmount * 100) > Math.round(remaining.reduce((a, b) => a + b, 0) * 100);
}

/** The account a receipt starts on: the family's Cash account if it has one (else none, which also means cash). */
export function defaultReceiptAccount(accounts: { id: string; type: string }[]): string {
  return accounts.find((a) => a.type === "cash")?.id ?? "";
}

/** The two category choices behind one saved category: its top level and, when it has a parent, itself as the sub-category. */
export function splitCategory(categories: { id: string; parent_id: string | null }[], categoryId: string | null): { topId: string; subId: string } {
  const c = categories.find((x) => x.id === categoryId);
  if (!c) return { topId: "", subId: "" };
  return c.parent_id ? { topId: c.parent_id, subId: c.id } : { topId: c.id, subId: "" };
}

/** A stored amount as the form shows it: "12.5" → "12.50". */
export function formAmount(n: number | string | null | undefined): string {
  return n === null || n === undefined || n === "" ? "" : Number(n).toFixed(2);
}

/** Values an existing record fills the form with when it is edited. */
export type EntryInitial = {
  kind: EntryKind;
  ledgerId: string;
  amount: string;
  amountSgd: string;
  categoryId: string;
  accountId: string; // "" = cash (expense, income)
  toAccountId: string;
  merchant: string;
  notes: string;
  when: string; // "YYYY-MM-DDTHH:mm" in Singapore time
  recoverable: boolean;
  recoverableAmount: string;
  status: RecoveryStatus;
  /** The spend already has paybacks linked: it stays recoverable and its status follows the paybacks. */
  hasPaybacks: boolean;
  foreign: boolean;
  foreignCurrency: string;
  foreignAmount: string;
  /** Claims this payback currently settles. */
  linkedClaimIds: string[];
};

export type RecentUse = { kind: EntryKind; account_id: string | null; to_account_id: string | null; ledger_id: string };

export type EntryDefaults = {
  /** Account the last expense was paid from ("" = cash, also when that account is no longer available). */
  expenseAccount: string;
  transferFrom: string;
  transferTo: string;
  /** Ledger of the last expense or income; "" when there is none or it can't be used now. */
  ledgerId: string;
};

/**
 * What the Add form starts with, from this person's latest entries (newest first): the account they last paid
 * from, the accounts they last moved money between, and the ledger they last used. Accounts and ledgers that
 * are no longer available (archived or removed) are never offered. Income keeps starting on the Cash account.
 */
export function pickDefaults(recent: RecentUse[], available: { accountIds: Set<string>; ledgerIds: Set<string> }): EntryDefaults {
  const account = (id: string | null) => (id && available.accountIds.has(id) ? id : "");
  const lastExpense = recent.find((r) => r.kind === "expense");
  const lastTransfer = recent.find((r) => r.kind === "transfer");
  const lastSpend = recent.find((r) => r.kind !== "transfer" && available.ledgerIds.has(r.ledger_id));
  return {
    expenseAccount: account(lastExpense?.account_id ?? null),
    transferFrom: account(lastTransfer?.account_id ?? null),
    transferTo: account(lastTransfer?.to_account_id ?? null),
    ledgerId: lastSpend?.ledger_id ?? "",
  };
}

/**
 * How much a payback can settle on an expense in all. A claim the person made (a recoverable amount they set)
 * settles up to that amount. Ordinary spend, and spend made recoverable only by a refund linked to it, settles up
 * to its full amount: further refunds can still arrive.
 */
export function settleCapacity(e: { amount: number | string; recoverable_amount: number | string; recoverable_from_link: boolean }): { isClaim: boolean; cap: number } {
  const recoverable = Number(e.recoverable_amount);
  const isClaim = recoverable > 0 && !e.recoverable_from_link;
  return { isClaim, cap: isClaim ? recoverable : Number(e.amount) };
}
