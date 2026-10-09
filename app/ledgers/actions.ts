"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseLedgerForm, type LedgerType } from "@/lib/ledgers";
import { requireMembership } from "@/lib/session";

export type LedgerFormState = { errors: string[]; message?: string } | null;

function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

/** Turns a database error into a message key where we know the cause. */
function explain(error: { code?: string; message: string }): LedgerFormState {
  if (error.code === "23505") return { errors: ["err.ledgerNameTaken"] };
  if (error.message.includes("currency cannot change")) return { errors: ["led.currencyLocked"] };
  return { errors: [], message: error.message };
}

/**
 * Create (no id) or update (id) a ledger. Creating goes through create_ledger, which makes a
 * rental ledger's property tag in the same step. Editing keeps the saved type.
 */
export async function saveLedger(_prev: LedgerFormState, form: FormData): Promise<LedgerFormState> {
  const { supabase } = await requireMembership();
  const id = String(form.get("id") ?? "");

  if (id) {
    const { data: saved } = await supabase.from("ledgers").select("type").eq("id", id).maybeSingle();
    if (!saved) return { errors: ["err.ledgerType"] };
    const parsed = parseLedgerForm(fields(form), saved.type as LedgerType);
    if (!parsed.ok) return { errors: parsed.errors };
    const { name, currency, start_date, end_date } = parsed.row;
    const { error } = await supabase
      .from("ledgers")
      .update({ name, default_currency: currency, start_date, end_date })
      .eq("id", id);
    if (error) return explain(error);
  } else {
    const parsed = parseLedgerForm(fields(form));
    if (!parsed.ok) return { errors: parsed.errors };
    const { name, type, currency, start_date, end_date } = parsed.row;
    const { error } = await supabase.rpc("create_ledger", {
      p_name: name,
      p_type: type,
      p_currency: currency,
      p_start: start_date,
      p_end: end_date,
    });
    if (error) return explain(error);
  }
  revalidatePath("/ledgers");
  redirect("/ledgers");
}

/** Archive or restore. The default ledger can't be archived (the database refuses). */
export async function setLedgerArchived(form: FormData) {
  const { supabase } = await requireMembership();
  const id = String(form.get("id"));
  await supabase.from("ledgers").update({ is_archived: form.get("archived") === "true" }).eq("id", id);
  revalidatePath("/ledgers");
  redirect("/ledgers");
}

/** Deletes an empty ledger. Ledgers with records can only be archived. */
export async function deleteLedger(_prev: LedgerFormState, form: FormData): Promise<LedgerFormState> {
  const { supabase } = await requireMembership();
  const id = String(form.get("id"));
  const { error } = await supabase.from("ledgers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { errors: ["led.inUse"] };
    if (error.message.includes("default ledger")) return { errors: ["led.defaultLocked"] };
    return { errors: [], message: error.message };
  }
  revalidatePath("/ledgers");
  redirect("/ledgers");
}
