/**
 * Ledgers (账本): form parsing and labels. Pure functions, no database access.
 *
 * Every family has one default daily ledger (created automatically). People add trip,
 * rental-property and other ledgers. A ledger has a currency: amounts entered in it are in
 * that currency. A rental ledger carries a property tag of the same name (one property,
 * one ledger), created together with it.
 */

/** Types a person can create. The daily ledger is automatic. */
export const CREATABLE_LEDGER_TYPES = ["trip", "property", "other"] as const;
export type LedgerType = "daily" | (typeof CREATABLE_LEDGER_TYPES)[number];

/** Currencies offered first in the picker; any 3-letter code is accepted. */
export const COMMON_CURRENCIES = ["SGD", "CNY", "USD", "MYR", "JPY", "EUR", "GBP", "HKD", "AUD", "THB", "IDR", "KRW"] as const;

export type LedgerListRow = {
  id: string;
  name: string;
  type: LedgerType;
  default_currency: string;
  counts_in_household: boolean;
  start_date: string | null;
  end_date: string | null;
  is_default: boolean;
  is_archived: boolean;
};

export type LedgerErrorKey = "err.ledgerName" | "err.ledgerType" | "err.currency" | "err.ledgerDates";

export type LedgerInput = {
  name: string;
  type: LedgerType;
  currency: string;
  start_date: string | null;
  end_date: string | null;
};

type Fields = Record<string, string | undefined>;
const blank = (v: string | undefined) => (v ?? "").trim();

const isIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Reads the ledger form. When creating, the type comes from the form (trip, rental or other).
 * When editing, pass the saved ledger's type: it can't change, so the form field is ignored.
 * Dates only apply to trips.
 */
export function parseLedgerForm(
  f: Fields,
  existingType?: LedgerType,
): { ok: true; row: LedgerInput } | { ok: false; errors: LedgerErrorKey[] } {
  const errors: LedgerErrorKey[] = [];

  const name = blank(f.name);
  if (!name || name.length > 60) errors.push("err.ledgerName");

  const asked = blank(f.type);
  const type: LedgerType | null =
    existingType ?? ((CREATABLE_LEDGER_TYPES as readonly string[]).includes(asked) ? (asked as LedgerType) : null);
  if (!type) errors.push("err.ledgerType");

  const currency = (blank(f.currency) || "SGD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("err.currency");

  let start_date: string | null = null;
  let end_date: string | null = null;
  if (type === "trip") {
    const s = blank(f.start_date);
    const e = blank(f.end_date);
    if ((s && !isIsoDate(s)) || (e && !isIsoDate(e)) || (s && e && e < s)) errors.push("err.ledgerDates");
    else {
      start_date = s || null;
      end_date = e || null;
    }
  }

  if (errors.length || !type) return { ok: false, errors };
  return { ok: true, row: { name, type, currency, start_date, end_date } };
}
