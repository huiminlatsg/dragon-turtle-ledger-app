import "server-only";
import { ACCOUNT_TYPES, accountLabel } from "@/lib/accounts";
import { settleCapacity, type CategoryOption } from "@/lib/expense";
import { formatDay } from "@/lib/format";
import type { Lang, Translate } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toSgtDate } from "@/lib/periods";
import type { createClient } from "@/lib/supabase/server";
import type { AccountOption, ClaimOption, LedgerOption } from "./EntryForm";

type Db = Awaited<ReturnType<typeof createClient>>;
export type EntryFormData = {
  ledgers: LedgerOption[];
  categories: CategoryOption[];
  allCategories: (CategoryOption & { is_archived: boolean })[];
  accounts: AccountOption[];
  accountTypes: string[];
  claims: ClaimOption[];
  statusLabel: Record<"to_submit" | "submitted" | "received", string>;
  received: Map<string, number>;
};

/**
 * Everything the entry form offers: ledgers, categories, accounts and the claims a payback can settle.
 * When editing, `editing` keeps the record's own (possibly archived) ledger and category selectable, and
 * lists the claims its payback already settles with that payback's own share left out of what they have received.
 */
export async function loadFormData(
  supabase: Db,
  lang: Lang,
  t: Translate,
  editing?: { ledgerId?: string; categoryId?: string | null; incomeId?: string; currency?: string; accountIds?: (string | null)[] },
): Promise<EntryFormData> {
  const ledgerQuery = supabase.from("ledgers").select("id, name, type, default_currency, is_default");
  const ledgerRowsQuery = (editing?.ledgerId ? ledgerQuery.or(`is_archived.eq.false,id.eq.${editing.ledgerId}`) : ledgerQuery.eq("is_archived", false)).order("created_at");
  const [{ data: ledgerRows }, { data: categoryRows }, { data: accountRows }, { data: linkRows }] = await Promise.all([
    ledgerRowsQuery,
    supabase.from("categories").select("id, parent_id, name, kind, ledger_type, nature, requires_account, requires_property, is_recovery, sort_order, is_archived").order("sort_order"),
    supabase.from("accounts").select("id, name, nickname, type, is_active").order("name"),
    supabase.from("recovery_links").select("income_id, expense_id, amount"),
  ]);

  let ledgerList = (ledgerRows ?? []) as { id: string; name: string; type: string; default_currency: string; is_default: boolean }[];
  if (editing?.currency) ledgerList = ledgerList.filter((l) => l.default_currency.trim() === editing.currency || l.id === editing.ledgerId);
  const ledgers: LedgerOption[] = [...ledgerList].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map((l) => ({ id: l.id, name: l.name, type: l.type, currency: l.default_currency }));

  const allCategories = (categoryRows ?? []) as (CategoryOption & { is_archived: boolean })[];
  const keepCategory = editing?.categoryId ? new Set([editing.categoryId, allCategories.find((c) => c.id === editing.categoryId)?.parent_id].filter(Boolean) as string[]) : new Set<string>();
  const categories = allCategories.filter((c) => !c.is_archived || keepCategory.has(c.id));

  const accountList = ((accountRows ?? []) as { id: string; name: string; nickname: string | null; type: string; is_active: boolean }[]).filter((a) => a.is_active || (editing?.accountIds ?? []).includes(a.id));
  const accounts: AccountOption[] = accountList.map((a) => ({ id: a.id, label: accountLabel(a), type: a.type }));

  const links = (linkRows ?? []) as { income_id: string; expense_id: string; amount: number }[];
  const received = new Map<string, number>();
  const ownShare = new Map<string, number>(); // what the payback being edited already settles, per claim
  for (const l of links) {
    received.set(l.expense_id, (received.get(l.expense_id) ?? 0) + Number(l.amount));
    if (editing?.incomeId && l.income_id === editing.incomeId) ownShare.set(l.expense_id, Number(l.amount));
  }

  const statusLabel = { to_submit: t("add.toSubmit"), submitted: t("add.submitted"), received: t("add.received") };
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const claimColumns = "id, txn_at, currency, merchant, category_id, amount, recoverable_amount, recovery_status, recoverable_from_link";
  const ownIds = [...ownShare.keys()];
  const [{ data: open }, { data: own }, { data: spend }] = await Promise.all([
    supabase.from("transactions").select(claimColumns).eq("kind", "expense").in("recovery_status", ["to_submit", "submitted"]).order("txn_at", { ascending: false }).limit(30),
    ownIds.length ? supabase.from("transactions").select(claimColumns).in("id", ownIds) : Promise.resolve({ data: [] }),
    // Other recent spend a refund or waiver can be linked to: ordinary spend and spend already refunded.
    supabase.from("transactions").select(claimColumns).eq("kind", "expense").or("recovery_status.is.null,recovery_status.eq.received").order("txn_at", { ascending: false }).limit(40),
  ]);
  type ClaimRow = {
    id: string;
    txn_at: string;
    currency: string;
    merchant: string | null;
    category_id: string | null;
    amount: number;
    recoverable_amount: number;
    recovery_status: "to_submit" | "submitted" | "received" | null;
    recoverable_from_link: boolean;
  };
  const seen = new Set<string>();
  const claims: ClaimOption[] = [...((own ?? []) as ClaimRow[]), ...((open ?? []) as ClaimRow[]), ...((spend ?? []) as ClaimRow[])]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .flatMap((c): ClaimOption[] => {
      const currency = c.currency.trim();
      const others = (received.get(c.id) ?? 0) - (ownShare.get(c.id) ?? 0); // paid back by other paybacks
      // A claim the person made settles up to the claim; other spend (or spend made recoverable by a refund) up to its amount.
      const { isClaim, cap } = settleCapacity(c);
      const left = Math.max(cap - others, 0);
      if (left <= 0) return [];
      const name = [c.category_id ? categoryName.get(c.category_id) : null, c.merchant].filter(Boolean).join(" · ") || "—";
      const day = formatDay(toSgtDate(c.txn_at), lang);
      if (isClaim && c.recovery_status && c.recovery_status !== "received") {
        return [{ id: c.id, currency, remaining: left, group: "claim", label: [name, day, statusLabel[c.recovery_status], t("add.left", { amount: formatMoney(left, currency) })].join(" · ") }];
      }
      return [
        {
          id: c.id,
          currency,
          remaining: left,
          group: "spend",
          label: [name, day, formatMoney(Number(c.amount), currency), others > 0 ? `${formatMoney(others, currency)} ${t("add.refundedWord")}` : null].filter(Boolean).join(" · "),
        },
      ];
    });

  return { ledgers, categories, allCategories, accounts, accountTypes: [...ACCOUNT_TYPES], claims, statusLabel, received };
}
