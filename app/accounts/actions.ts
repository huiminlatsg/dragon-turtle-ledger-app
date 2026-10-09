"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAccountForm, parseRuleForm } from "@/lib/accounts";
import { toSgtDate } from "@/lib/periods";
import { requireMembership } from "@/lib/session";

export type FormState = { errors: string[]; message?: string } | null;

function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/** Create (no id) or update (id) an account, then open it. */
export async function saveAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, membership } = await requireMembership();
  const parsed = parseAccountForm(fields(form));
  if (!parsed.ok) return { errors: parsed.errors };

  const id = String(form.get("id") ?? "");
  const row = { ...parsed.row, household_id: membership.householdId };
  const result = id
    ? await supabase.from("accounts").update(row).eq("id", id).select("id").single()
    : await supabase.from("accounts").insert(row).select("id").single();

  if (result.error) {
    if (result.error.code === "23505") return { errors: ["err.nameTaken"] };
    return { errors: [], message: result.error.message };
  }
  revalidatePath("/accounts");
  redirect(`/accounts/${result.data.id}`);
}

export async function setArchived(form: FormData) {
  const { supabase } = await requireMembership();
  const id = String(form.get("id"));
  await supabase.from("accounts").update({ is_active: form.get("active") === "true" }).eq("id", id);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
}

/** Deletes an unused account. Accounts with records can only be archived. */
export async function deleteAccount(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireMembership();
  const id = String(form.get("id"));
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { errors: ["acc.inUse"] };
    return { errors: [], message: error.message };
  }
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function addRule(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, membership } = await requireMembership();
  const accountId = String(form.get("account_id"));
  const { data: card } = await supabase.from("accounts").select("statement_day").eq("id", accountId).single();
  const parsed = parseRuleForm(fields(form), { statement_day: card?.statement_day ?? null }, toSgtDate(new Date()));
  if (!parsed.ok) return { errors: parsed.errors };

  const { error } = await supabase
    .from("spend_rules")
    .insert({ ...parsed.row, account_id: accountId, household_id: membership.householdId });
  if (error) return { errors: [], message: error.message };
  revalidatePath(`/accounts/${accountId}`);
  return null;
}

export async function deleteRule(form: FormData) {
  const { supabase } = await requireMembership();
  await supabase.from("spend_rules").delete().eq("id", String(form.get("id")));
  revalidatePath(`/accounts/${String(form.get("account_id"))}`);
}
