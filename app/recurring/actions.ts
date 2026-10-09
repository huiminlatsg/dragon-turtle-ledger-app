"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePositiveAmount, nowSgtInput } from "@/lib/expense";
import { repeatFormErrors } from "@/lib/recurring";
import { requireMembership } from "@/lib/session";
export type RepeatState = { errors: string[] } | null;
export async function saveRecurring(_prev: RepeatState, form: FormData): Promise<RepeatState> {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") return { errors: ["err.noPermission"] };
  const f = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const { data: ledger } = await supabase.from("ledgers").select("default_currency").eq("id", f.ledger_id ?? "").eq("is_archived", false).maybeSingle();
  if (!ledger) return { errors: ["err.ledger"] };
  const currency = String(ledger.default_currency).trim();
  const errors = repeatFormErrors(f, currency, nowSgtInput().slice(0, 10));
  if (errors.length) return { errors };
  const { error } = await supabase.rpc("save_recurring", { p_series: f.series_id || null, p_expected: f.expected || null, p_effective: f.series_id ? f.effective_from : f.start_date, p_name: f.name.trim(), p_frequency: f.frequency, p_start: f.start_date, p_end: f.end_date || null, p_enabled: f.enabled === "on", p_amount: parsePositiveAmount(f.amount), p_amount_sgd: currency === "SGD" ? parsePositiveAmount(f.amount) : parsePositiveAmount(f.amount_sgd), p_ledger: f.ledger_id, p_category: f.category_id, p_account: f.account_id || null, p_merchant: f.merchant ?? "", p_notes: f.notes ?? "" });
  if (error) return { errors: [error.message.includes("schedule changed") ? "repeat.changed" : error.message.includes("future") ? "repeat.futureError" : "repeat.saveError"] };
  revalidatePath("/recurring"); revalidatePath("/");
  redirect("/recurring?saved=1");
}
export async function confirmRecurring(_prev: RepeatState, form: FormData): Promise<RepeatState> {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") return { errors: ["err.noPermission"] };
  const skip = form.get("op") === "skip";
  const amount = parsePositiveAmount(String(form.get("amount") ?? ""));
  const sgd = parsePositiveAmount(String(form.get("amount_sgd") ?? ""));
  const notes = String(form.get("notes") ?? "");
  if (!skip && (amount === null || (form.get("currency") !== "SGD" && sgd === null) || notes.length > 500)) return { errors: ["repeat.amountError"] };
  const { error } = await supabase.rpc("confirm_recurring", { p_version: String(form.get("version")), p_due: String(form.get("due")), p_skip: skip, p_amount: amount, p_amount_sgd: sgd, p_notes: notes });
  if (error) return { errors: ["repeat.confirmError"] };
  for (const path of ["/recurring", "/records", "/add", "/accounts", "/"]) revalidatePath(path);
  redirect("/recurring?saved=1");
}
