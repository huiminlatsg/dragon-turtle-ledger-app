import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntryForm } from "@/app/add/EntryForm";
import { loadFormData } from "@/app/add/data";
import { formAmount, nowSgtInput, type EntryInitial, type RecoveryStatus } from "@/lib/expense";
import { getT } from "@/lib/i18n-server";
import { pickMessages } from "@/lib/i18n";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../../components/AppHeader";

export const dynamic = "force-dynamic";

type Txn = {
  id: string;
  kind: "expense" | "income" | "transfer";
  txn_at: string;
  amount: number;
  currency: string;
  amount_sgd: number;
  merchant_raw: string | null;
  merchant: string | null;
  notes: string | null;
  category_id: string | null;
  ledger_id: string;
  account_id: string | null;
  to_account_id: string | null;
  foreign_amount: number | null;
  foreign_currency: string | null;
  recoverable_amount: number;
  recovery_status: "to_submit" | "submitted" | "received" | null;
};

export default async function EditRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lang, t } = await getT();
  const { supabase, membership } = await requireMembership();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (membership.role === "viewer") redirect(`/records/${id}`);

  const { data: txn } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!txn) notFound();
  const r = txn as Txn;
  const currency = r.currency.trim();

  const [form, { data: linkRows }] = await Promise.all([
    loadFormData(supabase, lang, t, { ledgerId: r.ledger_id, categoryId: r.category_id, incomeId: r.kind === "income" ? r.id : undefined, currency, accountIds: [r.account_id, r.to_account_id] }),
    supabase.from("recovery_links").select("income_id, expense_id").or(`income_id.eq.${id},expense_id.eq.${id}`),
  ]);
  const links = (linkRows ?? []) as { income_id: string; expense_id: string }[];

  const initial: EntryInitial = {
    kind: r.kind,
    ledgerId: r.ledger_id,
    amount: formAmount(r.amount),
    amountSgd: currency === "SGD" ? "" : formAmount(r.amount_sgd),
    categoryId: r.category_id ?? "",
    accountId: r.account_id ?? "",
    toAccountId: r.to_account_id ?? "",
    merchant: r.merchant_raw ?? r.merchant ?? "",
    notes: r.notes ?? "",
    when: nowSgtInput(new Date(r.txn_at)),
    recoverable: r.kind === "expense" && Number(r.recoverable_amount) > 0,
    recoverableAmount: Number(r.recoverable_amount) > 0 ? formAmount(r.recoverable_amount) : "",
    status: (r.recovery_status === "submitted" ? "submitted" : "to_submit") satisfies RecoveryStatus,
    hasPaybacks: r.kind === "expense" && links.length > 0,
    foreign: Boolean(r.foreign_amount && r.foreign_currency),
    foreignCurrency: r.foreign_currency ?? "",
    foreignAmount: formAmount(r.foreign_amount),
    linkedClaimIds: r.kind === "income" ? links.map((l) => l.expense_id) : [],
  };

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <p>
        <Link href={`/records/${id}`}>{t("rec.cancelEdit")}</Link>
      </p>
      <h1>{t("rec.editTitle", { kind: t(`add.kind.${r.kind}`) })}</h1>
      {form.ledgers.length > 0 && (
        <EntryForm
          mode="edit"
          recordId={r.id}
          initial={initial}
          savedToken={r.id}
          ledgers={form.ledgers}
          categories={form.categories}
          accounts={form.accounts}
          accountTypes={form.accountTypes}
          claims={form.claims}
          initialKind={r.kind}
          initialLedgerId={r.ledger_id}
          initialWhen={initial.when}
          text={pickMessages(lang, ["add.", "f.", "err.", "type."])}
        />
      )}
    </main>
  );
}
