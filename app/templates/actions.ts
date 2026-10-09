"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/session";

export async function saveTemplate(form: FormData) {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") redirect("/templates?error=1");
  const id = String(form.get("id") ?? "");
  const op = String(form.get("op") ?? "save");
  if (op === "delete") {
    const { error } = await supabase.from("expense_templates").delete().eq("id", id).eq("household_id", membership.householdId);
    if (error) redirect("/templates?error=1");
  } else {
    const row = { household_id: membership.householdId, merchant: String(form.get("merchant") ?? "").trim(), account_id: String(form.get("account_id") ?? ""), category_id: String(form.get("category_id") ?? "") || null };
    const query = id ? supabase.from("expense_templates").update(row).eq("id", id).eq("household_id", membership.householdId) : supabase.from("expense_templates").insert(row);
    const { error } = await query;
    if (error) redirect("/templates?error=1");
  }
  revalidatePath("/templates");
  revalidatePath("/add");
  redirect("/templates?saved=1");
}
