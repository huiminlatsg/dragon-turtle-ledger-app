"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isReceiptPathFor } from "@/lib/receipt";
import { requireMembership } from "@/lib/session";

export type RecordState = { errors: string[]; message?: string } | null;

/** Deletes one record. Paybacks linked to it are unlinked by the database, and claims go back to Claimed. */
export async function deleteRecord(_prev: RecordState, form: FormData): Promise<RecordState> {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") return { errors: ["err.noPermission"] };

  const id = String(form.get("id") ?? "");
  const { data: before } = await supabase.from("transactions").select("receipt_id").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("transactions").delete().eq("id", id).select("id");
  if (error) {
    if (error.message.includes("reconciled statement")) return { errors: ["err.locked"] };
    return { errors: [], message: error.message };
  }
  if (!data || data.length === 0) return { errors: ["err.noPermission"] }; // nothing deleted: not allowed, or already gone

  if (before?.receipt_id) await dropReceipt(supabase, before.receipt_id as string); // the photo goes with its record

  revalidatePath("/records");
  revalidatePath("/add");
  redirect("/records?deleted=1");
}

type Db = Awaited<ReturnType<typeof requireMembership>>["supabase"];

/** Removes a receipt photo: the file in storage and its row. Best effort; a leftover file is harmless and private. */
async function dropReceipt(supabase: Db, receiptId: string) {
  const { data: receipt } = await supabase.from("receipts").select("image_path").eq("id", receiptId).maybeSingle();
  if (receipt?.image_path) await supabase.storage.from("receipts").remove([receipt.image_path as string]);
  await supabase.from("receipts").delete().eq("id", receiptId);
}

/**
 * Attaches an uploaded photo to a record. The browser has already put the file in storage (the family's own folder,
 * checked by the storage policies); this ties it to the record and replaces any earlier photo.
 */
export async function attachReceipt(recordId: string, path: string): Promise<RecordState> {
  const { supabase, userId, membership } = await requireMembership();
  if (membership.role === "viewer") return { errors: ["err.noPermission"] };
  if (!isReceiptPathFor(path, membership.householdId, recordId)) return { errors: ["err.receipt"] };

  const { data: record } = await supabase.from("transactions").select("id, receipt_id").eq("id", recordId).maybeSingle();
  if (!record) return { errors: ["err.noPermission"] };

  const { data: receipt, error } = await supabase
    .from("receipts")
    .insert({ household_id: membership.householdId, image_path: path, created_by: userId })
    .select("id")
    .single();
  if (error) return { errors: [], message: error.message };
  const { error: linkError } = await supabase.from("transactions").update({ receipt_id: receipt.id }).eq("id", recordId);
  if (linkError) {
    await dropReceipt(supabase, receipt.id as string);
    return { errors: [], message: linkError.message };
  }
  if (record.receipt_id) await dropReceipt(supabase, record.receipt_id as string); // replaced

  revalidatePath(`/records/${recordId}`);
  return null;
}

export async function removeReceipt(recordId: string): Promise<RecordState> {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") return { errors: ["err.noPermission"] };
  const { data: record } = await supabase.from("transactions").select("id, receipt_id").eq("id", recordId).maybeSingle();
  if (!record) return { errors: ["err.noPermission"] };
  if (record.receipt_id) {
    const { error } = await supabase.from("transactions").update({ receipt_id: null }).eq("id", recordId);
    if (error) return { errors: [], message: error.message };
    await dropReceipt(supabase, record.receipt_id as string);
  }
  revalidatePath(`/records/${recordId}`);
  return null;
}
