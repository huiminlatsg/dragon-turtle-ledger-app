import "server-only";
import { accountLabel, type AccountType } from "@/lib/accounts";
import { monthName } from "@/lib/format";
import { pickMessages, type Lang } from "@/lib/i18n";
import { toSgtDate } from "@/lib/periods";
import type { createClient } from "@/lib/supabase/server";
import type { AccountFormValues } from "./AccountForm";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Everything the account form needs besides the values: banks, family members, month names, text. */
export async function formContext(supabase: Supabase, householdId: string, lang: Lang, excludeId?: string) {
  const [{ data: banks }, { data: members }] = await Promise.all([
    supabase.from("accounts").select("id, name, nickname").eq("type", "bank").eq("is_active", true).order("name"),
    supabase.from("members").select("user_id, display_name").eq("household_id", householdId).order("created_at"),
  ]);
  return {
    banks: ((banks ?? []) as { id: string; name: string; nickname: string | null }[]).map((b) => ({ id: b.id, name: accountLabel(b) })).filter((b) => b.id !== excludeId),
    members: (members ?? []) as { user_id: string; display_name: string }[],
    months: Array.from({ length: 12 }, (_, i) => monthName(i + 1, lang)),
    text: pickMessages(lang, ["f.", "err.", "typeOne."]),
  };
}

export function emptyValues(type: AccountType): AccountFormValues {
  return {
    type,
    name: "",
    nickname: "",
    issuer: "",
    network: "",
    last4: "",
    color: "",
    currency: "SGD",
    holder_user_id: "",
    statement_day: "",
    due_mode: "",
    due_value: "",
    credit_limit: "",
    annual_fee_month: "",
    funding_account_id: "",
    opening_balance: "0",
    opening_balance_date: toSgtDate(new Date()),
  };
}

// The row comes from an untyped Supabase query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function valuesFromRow(a: any): AccountFormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const ob = Number(a.opening_balance ?? 0);
  return {
    id: a.id,
    type: a.type,
    name: str(a.name),
    nickname: str(a.nickname),
    issuer: str(a.issuer),
    network: str(a.network),
    last4: str(a.last4),
    color: str(a.color),
    currency: str(a.currency) || "SGD",
    holder_user_id: str(a.holder_user_id),
    statement_day: str(a.statement_day),
    due_mode: a.due_days_after_statement ? "after" : a.due_day ? "day" : "",
    due_value: str(a.due_days_after_statement ?? a.due_day),
    credit_limit: str(a.credit_limit),
    annual_fee_month: str(a.annual_fee_month),
    funding_account_id: str(a.funding_account_id),
    opening_balance: String(a.type === "credit_card" ? Math.abs(ob) : ob),
    opening_balance_date: str(a.opening_balance_date),
  };
}
