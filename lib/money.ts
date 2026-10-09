/**
 * Money helpers. Amounts are kept as plain numbers rounded to cents in the app,
 * and as numeric(12,2) in the database.
 */

/** Round to 2 decimal places without floating-point drift (e.g. 1.005 → 1.01). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Parse an amount typed by a person or sent by Apple Wallet / a bank alert.
 * Accepts "12.50", "S$12.50", "SGD 1,234.56", "$0.99", "-5", "USD 20".
 * Returns null when no usable number is found or the amount is zero.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) && input !== 0 ? roundCents(input) : null;
  }
  const text = input.trim();
  if (!text) return null;

  const negative = /^\s*[-−(]/.test(text) || /\)\s*$/.test(text);
  const match = text.replace(/,/g, "").match(/\d+(?:\.\d+)?|\.\d+/);
  if (!match) return null;

  const value = roundCents(Number(match[0]));
  if (!Number.isFinite(value) || value === 0) return null;
  return negative ? -value : value;
}

/** Detect a 3-letter currency code in text like "USD 20.00"; "S$" and "$" mean SGD. */
export function detectCurrency(input: string, fallback = "SGD"): string {
  const text = input.toUpperCase();
  if (/S\$/.test(text)) return "SGD";
  // A code right before or after the number, so words like "BOX" in a merchant name don't count.
  const code = text.match(/\b([A-Z]{3})\s?-?[\d.]/) ?? text.match(/[\d.]\s?([A-Z]{3})\b/);
  return code ? code[1] : fallback;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Format for display, e.g. 1234.5 → "S$1,234.50". */
export function formatMoney(amount: number, currency = "SGD"): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-SG", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f.format(amount);
}
