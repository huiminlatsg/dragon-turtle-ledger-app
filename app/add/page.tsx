import type { ExpenseTemplate } from "@/lib/expense-templates";
import { categoryCardDefaults, twoMonthsAgo, type CardUse } from "@/lib/card-defaults";
import Link from "next/link";
import { ENTRY_KINDS, nowSgtInput, pickDefaults, type EntryKind, type RecentUse } from "@/lib/expense";
import { getT } from "@/lib/i18n-server";
import { pickMessages } from "@/lib/i18n";
import { RECORD_COLUMNS, describeRecord, type RecordRow } from "@/lib/records";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";
import { SavedNotice } from "./SavedNotice";
import { EntryForm } from "./EntryForm";
import { loadFormData } from "./data";

export const dynamic = "force-dynamic";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ type?: string; ledger?: string; saved?: string; rec?: string }> }) {
  const { lang, t } = await getT();
  const { supabase, userId } = await requireMembership();
  const { type: wantedType, ledger: wantedLedger, saved, rec } = await searchParams;
  const savedId = rec && /^[0-9a-f-]{36}$/i.test(rec) ? rec : null;
  const initialKind: EntryKind = ENTRY_KINDS.find((k) => k === wantedType) ?? "expense";

  const [form, { data: recentRows }, { data: mineRows }] = await Promise.all([
    loadFormData(supabase, lang, t),
    supabase.from("transactions").select(RECORD_COLUMNS).order("created_at", { ascending: false }).limit(10),
    // What this person entered last decides what the form starts with.
    supabase.from("transactions").select("kind, account_id, to_account_id, ledger_id").eq("spent_by", userId).order("created_at", { ascending: false }).limit(30),
  ]);
  const { ledgers, categories, allCategories, accounts, accountTypes, claims, statusLabel, received } = form;
  const recent = (recentRows ?? []) as RecordRow[];

  const now = new Date();
  const since = twoMonthsAgo(now);
  const usageRows: CardUse[] = [];
  // Page through all actual purchases; a family-wide cap would distort percentages.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("transactions").select("category_id, account_id, kind, status")
      .eq("kind", "expense").in("status", ["confirmed", "posted"])
      .gte("txn_at", since).lte("txn_at", now.toISOString())
      .order("txn_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    usageRows.push(...(data ?? []) as CardUse[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  const totals = new Map<string, number>();
  for (const row of usageRows) if (row.category_id) totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + 1);
  const lastUses = await Promise.all(categories.filter((c) => (totals.get(c.id) ?? 0) < 10).map(async (category) => {
    const { data, error } = await supabase.from("transactions").select("category_id, account_id, kind, status")
      .eq("kind", "expense").in("status", ["confirmed", "posted"]).eq("category_id", category.id)
      .lte("txn_at", now.toISOString()).order("txn_at", { ascending: false })
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
    if (error) throw error;
    return (data ?? []) as CardUse[];
  }));
  const cashId = accounts.find((a) => a.type === "cash")?.id ?? null;
  const withCash = (row: CardUse): CardUse => ({ ...row, account_id: row.account_id ?? cashId });
  const cardDefaults = categoryCardDefaults(usageRows.map(withCash), new Set(accounts.map((a) => a.id)), lastUses.flat().map(withCash));
  const { data: templateRows } = await supabase.from("expense_templates").select("id, merchant, account_id, category_id").order("merchant");
  const templates = ((templateRows ?? []) as ExpenseTemplate[]).filter((t) => accounts.some((a) => a.id === t.account_id) && (!t.category_id || categories.some((c) => c.id === t.category_id)));
  const defaults = pickDefaults((mineRows ?? []) as RecentUse[], { accountIds: new Set(accounts.map((a) => a.id)), ledgerIds: new Set(ledgers.map((l) => l.id)) });
  const initialLedgerId = ledgers.find((l) => l.id === wantedLedger)?.id ?? ledgers.find((l) => l.id === defaults.ledgerId)?.id ?? ledgers[0]?.id ?? "";
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));
  const ledgerById = new Map(ledgers.map((l, i) => [l.id, { name: l.name, is_default: i === 0 }]));
  const accountName = new Map(accounts.map((a) => [a.id, a.label]));
  const kindLabel = { expense: t("add.kind.expense"), income: t("add.kind.income"), transfer: t("add.kind.transfer") };
  const text = pickMessages(lang, ["add.", "tpl.", "f.", "err.", "type."]);

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("add.title")}</h1>
      {saved === "1" && <SavedNotice text={t("add.saved")} also={["rec"]} link={savedId ? { href: `/records/${savedId}#receipt`, text: t("add.addReceipt") } : undefined} />}
      {ledgers.length > 0 && (
        <EntryForm
          savedToken={recent[0]?.id ?? "none"}
          ledgers={ledgers}
          categories={categories}
          accounts={accounts}
          accountTypes={accountTypes}
          claims={claims}
          initialKind={initialKind}
          initialLedgerId={initialLedgerId}
          initialWhen={nowSgtInput()}
          defaults={defaults}
          cardDefaults={cardDefaults}
          templates={templates}
          text={text}
        />
      )}

      <p><Link href="/templates">{t("tpl.title")}</Link> · <Link href="/recurring">{t("repeat.title")}</Link></p>
      <h2>{t("add.recent")}</h2>
      {recent.length === 0 ? (
        <p className="muted">{t("add.recentEmpty")}</p>
      ) : (
        <ul className="list card" data-testid="recent">
          {recent.map((r) => {
            const v = describeRecord(r, { lang, ledgerById, accountName, categoryName, statusLabel, kindLabel, received, receivedWord: t("add.receivedWord") });
            return (
              <li key={r.id}>
                <Link href={`/records/${r.id}`} className="row" data-testid="recent-row">
                  <span>
                    <span className="account-name">{v.title}</span>
                    <span className="muted small block">{v.sub}</span>
                  </span>
                  <span>
                    {v.amount}
                    {v.amountSgd && <span className="muted small block">{v.amountSgd}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <p>
          <Link href="/records" data-testid="see-all">
            {t("rec.seeAll")}
          </Link>
        </p>
      )}
    </main>
  );
}
