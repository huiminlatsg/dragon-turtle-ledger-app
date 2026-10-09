/**
 * Accounts and cards: form parsing (shared by create and edit) and card dates.
 * Pure functions, no database access, so they can be unit-tested.
 */
import { isHexColor } from "@/lib/banks";
import { roundCents } from "@/lib/money";
import { addDays, periodFor } from "@/lib/periods";

export const ACCOUNT_TYPES = ["credit_card", "bank", "debit_card", "stored_value", "cash"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** What to call an account in lists: its nickname if it has one, else its official name. */
export const accountLabel = (a: { name: string; nickname?: string | null }) => a.nickname?.trim() || a.name;

/** Columns the account list and detail pages read. */
export type AccountListRow = {
  id: string;
  name: string;
  nickname: string | null;
  type: AccountType;
  issuer: string | null;
  network: string | null;
  last4: string | null;
  color: string | null;
  currency: string;
  statement_day: number | null;
  due_day: number | null;
  due_days_after_statement: number | null;
  funding_account_id: string | null;
  is_active: boolean;
};

export const NETWORKS = ["visa", "mastercard", "amex", "unionpay", "jcb", "other"] as const;

export type AccountErrorKey =
  | "err.name"
  | "err.nickname"
  | "err.last4"
  | "err.day"
  | "err.dueDays"
  | "err.amount"
  | "err.funding"
  | "err.currency"
  | "err.date";

/** The columns an account form writes. Card-only settings are null for other types. */
export interface AccountRow {
  type: AccountType;
  /** The official card or account name. */
  name: string;
  /** Friendly name shown first (optional). */
  nickname: string | null;
  issuer: string | null;
  network: (typeof NETWORKS)[number] | null;
  last4: string | null;
  /** Tile colour (#RRGGBB); null means the bank's colour. */
  color: string | null;
  currency: string;
  holder_user_id: string | null;
  statement_day: number | null;
  due_day: number | null;
  due_days_after_statement: number | null;
  credit_limit: number | null;
  annual_fee_month: number | null;
  /** Always false: whether a top-up counts to min-spend is chosen on each top-up, not on the card. */
  topups_count_to_min_spend: false;
  funding_account_id: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
}

type Fields = Record<string, string | undefined>;

const blank = (v: string | undefined) => (v ?? "").trim();
const orNull = (v: string | undefined) => blank(v) || null;

function intIn(v: string | undefined, min: number, max: number): number | null | "bad" {
  const s = blank(v);
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "bad";
  const n = Number(s);
  return n >= min && n <= max ? n : "bad";
}

function money(v: string | undefined): number | null | "bad" {
  const s = blank(v).replace(/,/g, "").replace(/^S?\$/i, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return "bad";
  return roundCents(Number(s));
}

/** Reject impossible dates; Date.parse alone normalizes e.g. Feb 30 into March. */
const isDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith("0000-")) return false;
  const timestamp = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === s;
};

/**
 * Turns form fields into a row, or the list of problems to show.
 * For credit cards the person types the amount owed (positive); it is stored negative.
 */
export function parseAccountForm(f: Fields): { ok: true; row: AccountRow } | { ok: false; errors: AccountErrorKey[] } {
  const errors: AccountErrorKey[] = [];
  const type = (ACCOUNT_TYPES as readonly string[]).includes(blank(f.type)) ? (blank(f.type) as AccountType) : "credit_card";
  const isCard = type === "credit_card";

  const name = blank(f.name);
  if (!name || name.length > 60) errors.push("err.name");

  const nickname = orNull(f.nickname);
  if (nickname && nickname.length > 40) errors.push("err.nickname");

  const last4 = orNull(f.last4);
  if (last4 && !/^\d{4}$/.test(last4)) errors.push("err.last4");

  const currency = (blank(f.currency) || "SGD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("err.currency");

  const network = (NETWORKS as readonly string[]).includes(blank(f.network)) ? (blank(f.network) as AccountRow["network"]) : null;

  let statement_day: number | null = null;
  let due_day: number | null = null;
  let due_days_after_statement: number | null = null;
  let credit_limit: number | null = null;
  let annual_fee_month: number | null = null;

  if (isCard) {
    const sd = intIn(f.statement_day, 1, 31);
    if (sd === "bad") errors.push("err.day");
    else statement_day = sd;

    if (blank(f.due_mode) === "after") {
      const n = intIn(f.due_value, 1, 60);
      if (n === "bad") errors.push("err.dueDays");
      else due_days_after_statement = n;
    } else if (blank(f.due_mode) === "day") {
      const n = intIn(f.due_value, 1, 31);
      if (n === "bad") errors.push("err.day");
      else due_day = n;
    }

    const cl = money(f.credit_limit);
    if (cl === "bad" || (cl !== null && cl <= 0)) errors.push("err.amount");
    else credit_limit = cl;

    const fm = intIn(f.annual_fee_month, 1, 12);
    annual_fee_month = fm === "bad" ? null : fm;
  }

  const funding_account_id = type === "debit_card" ? orNull(f.funding_account_id) : null;
  if (type === "debit_card" && !funding_account_id) errors.push("err.funding");

  let opening_balance = 0;
  let opening_balance_date: string | null = null;
  if (type !== "debit_card") {
    const ob = money(f.opening_balance);
    if (ob === "bad") errors.push("err.amount");
    else opening_balance = ob === null ? 0 : isCard ? -Math.abs(ob) : ob;

    const od = blank(f.opening_balance_date);
    if (od && !isDate(od)) errors.push("err.date");
    else opening_balance_date = od || null;
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    row: {
      type,
      name,
      nickname,
      issuer: orNull(f.issuer),
      network: type === "credit_card" || type === "debit_card" ? network : null,
      last4: type === "credit_card" || type === "debit_card" ? last4 : null,
      color: isHexColor(blank(f.color)) ? blank(f.color).toUpperCase() : null,
      currency,
      holder_user_id: orNull(f.holder_user_id),
      statement_day,
      due_day,
      due_days_after_statement,
      credit_limit,
      annual_fee_month,
      topups_count_to_min_spend: false,
      funding_account_id,
      opening_balance,
      opening_balance_date,
    },
  };
}

/** Due date for a statement dated `statementDate`, from the card's settings (same rule as the database). */
export function dueDateFor(
  statementDate: string,
  card: { due_day: number | null; due_days_after_statement: number | null },
): string | null {
  if (card.due_days_after_statement) return addDays(statementDate, card.due_days_after_statement);
  if (!card.due_day) return null;
  const [y, m] = statementDate.split("-").map(Number);
  const clamp = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm - 1, Math.min(card.due_day!, last))).toISOString().slice(0, 10);
  };
  const same = clamp(y, m);
  if (same > statementDate) return same;
  return m === 12 ? clamp(y + 1, 1) : clamp(y, m + 1);
}

/**
 * The next statement date, and the next payment due on or after today
 * (the last statement's if it isn't due yet, otherwise the coming one's).
 */
export function cardSchedule(
  card: { statement_day: number | null; due_day: number | null; due_days_after_statement: number | null },
  today: string,
): { nextStatement: string; nextDue: string | null } | null {
  if (!card.statement_day) return null;
  const cycle = periodFor("statement_cycle", today, card.statement_day);
  const lastStatement = addDays(cycle.start, -1);
  const lastDue = dueDateFor(lastStatement, card);
  const nextDue = lastDue && lastDue >= today ? lastDue : dueDateFor(cycle.end, card);
  return { nextStatement: cycle.end, nextDue };
}

export type RuleErrorKey = "err.amount" | "err.date" | "err.needStatementDay";

export interface RuleRow {
  kind: "min_spend" | "bonus_cap";
  period: "calendar_month" | "statement_cycle";
  amount: number;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

/** A min-spend or bonus-cap rule. A billing-cycle rule needs the card's statement day. */
export function parseRuleForm(
  f: Fields,
  card: { statement_day: number | null },
  today: string,
): { ok: true; row: RuleRow } | { ok: false; errors: RuleErrorKey[] } {
  const errors: RuleErrorKey[] = [];
  const kind = blank(f.kind) === "bonus_cap" ? "bonus_cap" : "min_spend";
  const period = blank(f.period) === "statement_cycle" ? "statement_cycle" : "calendar_month";
  if (period === "statement_cycle" && !card.statement_day) errors.push("err.needStatementDay");

  const amount = money(f.amount);
  if (amount === "bad" || amount === null || amount <= 0) errors.push("err.amount");

  const from = blank(f.valid_from) || today;
  const to = blank(f.valid_to) || null;
  if (!isDate(from) || (to && (!isDate(to) || to < from))) errors.push("err.date");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    row: { kind, period, amount: amount as number, valid_from: from, valid_to: to, note: orNull(f.note) },
  };
}
