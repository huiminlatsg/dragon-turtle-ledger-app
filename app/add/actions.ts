"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { ENTRY_KINDS, allocatePayback, mergeLinkIds, sameIds, parseExpenseForm, parseIncomeForm, parseTransferForm, settleCapacity, type EntryKind } from "@/lib/expense";
import { requireMembership } from "@/lib/session";

export type AddState = { errors: string[]; message?: string } | null;

/** Saves one entry (expense, income or transfer), then reopens the form with a "Saved" note. */
export async function saveEntry(_prev: AddState, form: FormData): Promise<AddState> {
  let done: { kind: EntryKind; ledgerId: string; id: string };
  try {
    done = await insertEntry(form);
  } catch (e) {
    if (e instanceof EntryInputError) return { errors: e.errors };
    unstable_rethrow(e); // sign-in redirects and other framework signals
    return { errors: [], message: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/add");
  redirect(`/add?type=${done.kind}&ledger=${done.ledgerId}&saved=1&rec=${done.id}`);
}

class EntryInputError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(","));
  }
}

/** Database messages the person can act on, matched to the form's own wording. */
function dbProblem(message: string): string[] | null {
  if (message.includes("can only be used in")) return ["err.categoryLedger"];
  if (message.includes("needs a property")) return ["err.categoryProperty"];
  if (message.includes("reconciled statement")) return ["err.locked"];
  if (message.includes("cannot be less than what has already been received")) return ["err.recoverablePaid"];
  return null;
}

function fail(message: string): never {
  const problem = dbProblem(message);
  throw problem ? new EntryInputError(problem) : new Error(message);
}

/** Validates and inserts. Throws EntryInputError for problems the person can fix. */
async function insertEntry(form: FormData): Promise<{ kind: EntryKind; ledgerId: string; id: string }> {
  const { supabase, userId, membership } = await requireMembership();

  const f: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") f[k] = v;
  });
  const kind = ENTRY_KINDS.find((k) => k === f.kind) ?? "expense";

  // Transfers aren't spend: they sit in the family's default ledger. Everything else uses the chosen ledger.
  const ledgerQuery = supabase.from("ledgers").select("id, default_currency, is_archived");
  const { data: ledger } = await (kind === "transfer" ? ledgerQuery.eq("is_default", true) : ledgerQuery.eq("id", f.ledger_id ?? "")).maybeSingle();
  if (!ledger || ledger.is_archived) throw new EntryInputError(["err.ledger"]);
  const ledgerRef = { id: ledger.id as string, currency: ledger.default_currency as string };

  const base = { household_id: membership.householdId, spent_by: userId, source: "manual" };
  let incomeId: string | null = null;
  let newId = "";
  let incomeAmount = 0;
  let linkIds: string[] = [];

  if (kind === "expense") {
    const parsed = parseExpenseForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    const { data, error } = await supabase.from("transactions").insert({ ...parsed.row, ...base, kind: "expense" }).select("id").single();
    if (error) fail(error.message);
    newId = data.id as string;
  } else if (kind === "income") {
    const { data: category } = await supabase
      .from("categories")
      .select("id, kind, is_recovery")
      .eq("id", f.category_id ?? "")
      .maybeSingle();
    if (!category || category.kind !== "income") throw new EntryInputError(["err.category"]);
    const parsed = parseIncomeForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    const { data, error } = await supabase
      .from("transactions")
      .insert({ ...parsed.row, ...base })
      .select("id")
      .single();
    if (error) fail(error.message);
    incomeId = data.id as string;
    newId = incomeId;
    incomeAmount = parsed.row.amount;
    if (category.is_recovery) linkIds = form.getAll("link_expense").filter((v): v is string => typeof v === "string" && v !== "");
  } else {
    const parsed = parseTransferForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    const { data, error } = await supabase.from("transactions").insert({ ...parsed.row, ...base }).select("id").single();
    if (error) fail(error.message);
    newId = data.id as string;
  }

  // A payback settles the expenses ticked, each up to what it still waits for, until the payback runs out.
  if (incomeId && linkIds.length > 0) {
    try {
      await settleLinks(supabase, membership.householdId, incomeId, incomeAmount, linkIds);
    } catch (e) {
      await supabase.from("transactions").delete().eq("id", incomeId); // don't leave a half-saved entry behind
      throw e;
    }
  }

  return { kind, ledgerId: ledgerRef.id, id: newId };
}

type Db = Awaited<ReturnType<typeof requireMembership>>["supabase"];

/**
 * Links a payback to the expenses ticked, each up to what it still waits for, until the payback runs out.
 * The database marks an expense Received only once its paybacks add up to its recoverable amount.
 */
async function settleLinks(supabase: Db, householdId: string, incomeId: string, incomeAmount: number, linkIds: string[]) {
  const [{ data: claimRows }, { data: linkRows }] = await Promise.all([
    supabase.from("transactions").select("id, amount, recoverable_amount, recoverable_from_link").in("id", linkIds),
    supabase.from("recovery_links").select("expense_id, amount").in("expense_id", linkIds),
  ]);
  const settled = new Map<string, number>();
  for (const l of (linkRows ?? []) as { expense_id: string; amount: number }[]) {
    settled.set(l.expense_id, (settled.get(l.expense_id) ?? 0) + Number(l.amount));
  }
  const remaining = new Map(
    // A claim the person made settles up to the claim; other spend (or spend made recoverable by a refund) up to its amount.
    ((claimRows ?? []) as { id: string; amount: number; recoverable_amount: number; recoverable_from_link: boolean }[]).map((c) => [
      c.id,
      settleCapacity(c).cap - (settled.get(c.id) ?? 0),
    ]),
  );
  const allocation = allocatePayback(
    incomeAmount,
    linkIds.map((id) => ({ id, remaining: remaining.get(id) ?? 0 })),
  );
  for (const a of allocation) {
    const { error } = await supabase
      .from("recovery_links")
      .insert({ household_id: householdId, income_id: incomeId, expense_id: a.id, amount: a.amount });
    if (error) throw new Error(error.message);
  }
}

/** Saves changes to an existing record, then shows it again. The record's type never changes. */
export async function updateEntry(_prev: AddState, form: FormData): Promise<AddState> {
  let id: string;
  try {
    id = await changeEntry(form);
  } catch (e) {
    if (e instanceof EntryInputError) return { errors: e.errors };
    unstable_rethrow(e);
    return { errors: [], message: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/records");
  revalidatePath(`/records/${id}`);
  revalidatePath("/add");
  redirect(`/records/${id}?saved=1`);
}

async function changeEntry(form: FormData): Promise<string> {
  const { supabase, membership } = await requireMembership();
  if (membership.role === "viewer") throw new EntryInputError(["err.noPermission"]);

  const f: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") f[k] = v;
  });
  const id = f.id ?? "";

  const { data: current } = await supabase.from("transactions").select("id, kind, ledger_id, currency").eq("id", id).maybeSingle();
  if (!current) throw new EntryInputError(["err.noPermission"]);
  const kind = current.kind as EntryKind;
  const currency = String(current.currency).trim();

  // The ledger may change to another one with the same currency; a transfer stays where it is.
  const wantedLedger = kind === "transfer" ? (current.ledger_id as string) : (f.ledger_id ?? "");
  const { data: ledger } = await supabase.from("ledgers").select("id, default_currency, is_archived").eq("id", wantedLedger).maybeSingle();
  if (!ledger || (ledger.is_archived && ledger.id !== current.ledger_id) || String(ledger.default_currency).trim() !== currency) throw new EntryInputError(["err.ledger"]);
  const ledgerRef = { id: ledger.id as string, currency };

  let linkIds: string[] = [];
  let snapshot: { income_id: string; expense_id: string; amount: number }[] = [];
  let patch: Record<string, unknown>;
  let incomeAmount = 0;
  let unchanged = false; // same claims and the payback still covers them: keep the old link amounts

  if (kind === "expense") {
    const parsed = parseExpenseForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    const { count } = await supabase.from("recovery_links").select("expense_id", { count: "exact", head: true }).eq("expense_id", id);
    const row: Record<string, unknown> = { ...parsed.row, merchant: parsed.row.merchant_raw, property_id: null };
    // With paybacks linked, the status follows the paybacks, not the form.
    if ((count ?? 0) > 0) delete row.recovery_status;
    patch = row;
  } else if (kind === "income") {
    const { data: category } = await supabase.from("categories").select("id, kind, is_recovery").eq("id", f.category_id ?? "").maybeSingle();
    if (!category || category.kind !== "income") throw new EntryInputError(["err.category"]);
    const parsed = parseIncomeForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    patch = { ...parsed.row, merchant: parsed.row.merchant_raw, property_id: null };
    incomeAmount = parsed.row.amount;
    const { data: links } = await supabase.from("recovery_links").select("income_id, expense_id, amount").eq("income_id", id);
    snapshot = (links ?? []) as typeof snapshot;
    // Claims the form did not offer keep their link; only claims shown and left unticked are let go.
    const strings = (name: string) => form.getAll(name).filter((v): v is string => typeof v === "string" && v !== "");
    if (category.is_recovery) linkIds = mergeLinkIds(snapshot.map((l) => l.expense_id), strings("claims_listed"), strings("link_expense"));
    unchanged = sameIds(linkIds, snapshot.map((l) => l.expense_id)) && Math.round(incomeAmount * 100) >= Math.round(snapshot.reduce((a, l) => a + Number(l.amount), 0) * 100);
  } else {
    const parsed = parseTransferForm(f, ledgerRef);
    if (!parsed.ok) throw new EntryInputError(parsed.errors);
    patch = { ...parsed.row, counts_to_min_spend: null }; // follows the new source account
  }

  // A payback's links are worked out again from the claims ticked now; if anything fails the old links come back.
  const relink = kind === "income" && (snapshot.length > 0 || linkIds.length > 0);
  const restore = async () => {
    await supabase.from("recovery_links").delete().eq("income_id", id);
    if (snapshot.length > 0) await supabase.from("recovery_links").insert(snapshot.map((l) => ({ ...l, household_id: membership.householdId })));
  };
  if (relink) {
    const { error } = await supabase.from("recovery_links").delete().eq("income_id", id);
    if (error) throw new Error(error.message);
  }
  try {
    const { data, error } = await supabase.from("transactions").update(patch).eq("id", id).select("id");
    if (error) fail(error.message);
    if (!data || data.length === 0) throw new EntryInputError(["err.noPermission"]);
    if (relink && unchanged) await restore();
    else if (relink && linkIds.length > 0) await settleLinks(supabase, membership.householdId, id, incomeAmount, linkIds);
  } catch (e) {
    if (relink) await restore();
    throw e;
  }
  return id;
}
