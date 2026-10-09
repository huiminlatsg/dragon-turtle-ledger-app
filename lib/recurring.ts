import { parsePositiveAmount } from "./expense";
export type RecurringVersion = { id: string; series_id: string; revision: number; effective_from: string; name: string; frequency: "monthly" | "yearly"; start_date: string; end_date: string | null; enabled: boolean; amount: number; amount_sgd: number; ledger_id: string; category_id: string; account_id: string | null; merchant: string | null; notes: string | null };
export type RecurringOccurrence = RecurringVersion & { due_date: string; state: "planned" | "confirmed" | "skipped"; transaction_id: string | null; currency: string };
export function validRepeatDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= "2200-12-31";
}
export function tomorrowSgt(now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(new Date(today + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
}
export function repeatFormErrors(f: Record<string, string>, currency: string, today: string): string[] {
  const errors: string[] = [];
  if (!f.name?.trim() || f.name.trim().length > 100) errors.push("repeat.nameError");
  if (!["monthly", "yearly"].includes(f.frequency) || !validRepeatDate(f.start_date) || (f.end_date && (!validRepeatDate(f.end_date) || f.end_date < f.start_date))) errors.push("repeat.dateError");
  if (f.series_id && (!validRepeatDate(f.effective_from) || f.effective_from <= today)) errors.push("repeat.futureError");
  if (parsePositiveAmount(f.amount) === null || (currency !== "SGD" && parsePositiveAmount(f.amount_sgd) === null)) errors.push("repeat.amountError");
  if ((f.merchant ?? "").length > 100 || (f.notes ?? "").length > 500) errors.push("err.textLong");
  return errors;
}
