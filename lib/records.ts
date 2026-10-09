/**
 * Listing, opening and deleting records: wording for one row and the month navigation. Pure functions.
 */
import { formatDay } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toSgtDate } from "@/lib/periods";

export type RecordRow = {
  id: string;
  kind: "expense" | "income" | "transfer";
  to_account_id: string | null;
  txn_at: string;
  amount: number;
  currency: string;
  amount_sgd: number;
  merchant: string | null;
  category_id: string | null;
  ledger_id: string;
  account_id: string | null;
  recoverable_amount: number;
  recovery_status: "to_submit" | "submitted" | "received" | null;
};

/** Columns every record list needs. */
export const RECORD_COLUMNS =
  "id, kind, to_account_id, txn_at, amount, currency, amount_sgd, merchant, category_id, ledger_id, account_id, recoverable_amount, recovery_status";

export type DescribeContext = {
  lang: Lang;
  ledgerById: Map<string, { name: string; is_default: boolean }>;
  accountName: Map<string, string>;
  categoryName: Map<string, string>;
  statusLabel: Record<string, string>;
  kindLabel: Record<string, string>;
  received: Map<string, number>; // paybacks already linked to each expense
  receivedWord: string;
};

/** Text for one record. A bad row shows a short note instead of breaking the whole page. */
export function describeRecord(r: RecordRow, ctx: DescribeContext): { title: string; sub: string; amount: string; amountSgd: string | null } {
  try {
    const currency = r.currency.trim();
    const led = ctx.ledgerById.get(r.ledger_id);
    const account = (id: string | null) => (id ? ctx.accountName.get(id) : null);
    if (r.kind === "transfer") {
      return {
        title: `${account(r.account_id) ?? "—"} → ${account(r.to_account_id) ?? "—"}`,
        sub: [formatDay(toSgtDate(r.txn_at), ctx.lang), ctx.kindLabel.transfer].join(" · "),
        amount: formatMoney(Number(r.amount), currency),
        amountSgd: currency !== "SGD" ? formatMoney(Number(r.amount_sgd), "SGD") : null,
      };
    }
    const got = ctx.received.get(r.id) ?? 0;
    const payback =
      r.kind === "expense" && r.recoverable_amount > 0 && r.recovery_status
        ? `${ctx.statusLabel[r.recovery_status]} ${formatMoney(Number(r.recoverable_amount), currency)}` +
          (got > 0 && r.recovery_status !== "received" ? ` · ${formatMoney(got, currency)} ${ctx.receivedWord}` : "")
        : null;
    // The title is the (sub-)category; the merchant or "from" is tagged beside it. With no category the merchant is the title.
    const category = r.category_id ? (ctx.categoryName.get(r.category_id) ?? null) : null;
    const tag = category ? r.merchant : null;
    const sub = [tag, formatDay(toSgtDate(r.txn_at), ctx.lang), led && !led.is_default ? led.name : null, account(r.account_id), payback].filter(Boolean).join(" · ");
    const sign = r.kind === "income" ? "+" : "";
    return {
      title: category || r.merchant || "—",
      sub,
      amount: sign + formatMoney(Number(r.amount), currency),
      amountSgd: currency !== "SGD" ? sign + formatMoney(Number(r.amount_sgd), "SGD") : null,
    };
  } catch (e) {
    return { title: "—", sub: e instanceof Error ? e.message : String(e), amount: String(r.amount), amountSgd: null };
  }
}

/** "2026-10" as typed in a link, or the current month when it is missing or not a real month. */
export function parseMonth(input: string | undefined, now = new Date()): string {
  if (input && /^\d{4}-(0[1-9]|1[0-2])$/.test(input)) return input;
  return toSgtDate(now).slice(0, 7);
}

/** The month before or after: shiftMonth("2026-01", -1) is "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Start (inclusive) and end (exclusive) of a Singapore calendar month, as timestamps the database understands. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01T00:00:00+08:00`, to: `${shiftMonth(month, 1)}-01T00:00:00+08:00` };
}

/** "October 2026" / "2026年10月". */
export function monthTitle(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-SG" : "en-SG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
