import Link from "next/link";
import { notFound } from "next/navigation";
import { accountLabel } from "@/lib/accounts";
import { formatDay } from "@/lib/format";
import { getT } from "@/lib/i18n-server";
import { pickMessages } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { toSgtDate } from "@/lib/periods";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../components/AppHeader";
import { SavedNotice } from "../../add/SavedNotice";
import { DeleteRecord } from "../DeleteRecord";
import { ReceiptPhoto } from "../ReceiptPhoto";

export const dynamic = "force-dynamic";

type Txn = {
  id: string;
  kind: "expense" | "income" | "transfer";
  txn_at: string;
  amount: number;
  currency: string;
  amount_sgd: number;
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
  receipt_id: string | null;
};

type LinkRow = { income_id: string; expense_id: string; amount: number };

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { lang, t } = await getT();
  const { supabase, membership } = await requireMembership();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: txn } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!txn) notFound();
  const r = txn as Txn;
  const currency = r.currency.trim();

  const [{ data: ledger }, { data: accounts }, { data: categories }, { data: linkRows }] = await Promise.all([
    supabase.from("ledgers").select("id, name").eq("id", r.ledger_id).maybeSingle(),
    supabase.from("accounts").select("id, name, nickname, type"),
    supabase.from("categories").select("id, parent_id, name"),
    supabase.from("recovery_links").select("income_id, expense_id, amount").or(`income_id.eq.${id},expense_id.eq.${id}`),
  ]);
  const accountName = new Map(((accounts ?? []) as { id: string; name: string; nickname: string | null; type: string }[]).map((a) => [a.id, accountLabel(a)]));
  const cats = new Map(((categories ?? []) as { id: string; parent_id: string | null; name: string }[]).map((c) => [c.id, c]));
  const cat = r.category_id ? cats.get(r.category_id) : undefined;
  const categoryText = cat ? [cat.parent_id ? cats.get(cat.parent_id)?.name : null, cat.name].filter(Boolean).join(" › ") : null;

  // The receipt photo, if any, as a link that works for an hour.
  let receiptUrl: string | null = null;
  if (r.receipt_id) {
    const { data: receipt } = await supabase.from("receipts").select("image_path").eq("id", r.receipt_id).maybeSingle();
    if (receipt?.image_path) {
      const { data: signed } = await supabase.storage.from("receipts").createSignedUrl(receipt.image_path as string, 3600);
      receiptUrl = signed?.signedUrl ?? null;
    }
  }

  const links = (linkRows ?? []) as LinkRow[];
  const otherIds = links.map((l) => (r.kind === "income" ? l.expense_id : l.income_id));
  const { data: others } = otherIds.length
    ? await supabase.from("transactions").select("id, txn_at, merchant, category_id, currency").in("id", otherIds)
    : { data: [] };
  const otherById = new Map(((others ?? []) as { id: string; txn_at: string; merchant: string | null; category_id: string | null; currency: string }[]).map((o) => [o.id, o]));
  const linkedLines = links.map((l) => {
    const o = otherById.get(r.kind === "income" ? l.expense_id : l.income_id);
    const catName = o?.category_id ? cats.get(o.category_id)?.name : null;
    const name = [catName, o?.merchant].filter(Boolean).join(" · ") || "—";
    return `${name} · ${o ? formatDay(toSgtDate(o.txn_at), lang) : ""} · ${formatMoney(Number(l.amount), (o?.currency ?? currency).trim())}`;
  });
  const got = r.kind === "expense" ? links.reduce((a, l) => a + Number(l.amount), 0) : 0;

  const title = r.kind === "transfer" ? `${accountName.get(r.account_id ?? "") ?? "—"} → ${accountName.get(r.to_account_id ?? "") ?? "—"}` : cat?.name || r.merchant || "—";
  const statusLabel = { to_submit: t("add.toSubmit"), submitted: t("add.submitted"), received: t("add.received") };
  const canChange = membership.role !== "viewer";
  const warning =
    links.length === 0 ? null : r.kind === "income" ? t("rec.deleteIncomeLinked", { n: links.length }) : r.kind === "expense" ? t("rec.deleteExpenseLinked", { n: links.length }) : null;

  const facts: [string, string | null][] = [
    [t("rec.kind"), t(`add.kind.${r.kind}`)],
    [t("rec.amount"), formatMoney(Number(r.amount), currency)],
    [t("rec.amountSgd"), currency !== "SGD" ? formatMoney(Number(r.amount_sgd), "SGD") : null],
    [t("rec.category"), categoryText],
    [r.kind === "transfer" ? t("add.from") : t("rec.account"), r.account_id ? (accountName.get(r.account_id) ?? "—") : r.kind === "transfer" ? "—" : t("add.cash")],
    [t("add.to"), r.to_account_id ? (accountName.get(r.to_account_id) ?? "—") : null],
    [t("rec.ledger"), ledger?.name ?? null],
    [t("rec.when"), `${formatDay(toSgtDate(r.txn_at), lang)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(r.txn_at))}`],
    [t("add.foreignAmount"), r.foreign_amount && r.foreign_currency ? formatMoney(Number(r.foreign_amount), r.foreign_currency) : null],
    [
      t("rec.payback"),
      r.kind === "expense" && r.recoverable_amount > 0 && r.recovery_status
        ? `${statusLabel[r.recovery_status]} · ${t("rec.paybackOf", { received: formatMoney(got, currency), total: formatMoney(Number(r.recoverable_amount), currency) })}`
        : null,
    ],
    [t("rec.notes"), r.notes],
  ];

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <p>
        <Link href="/records">{t("rec.back")}</Link>
      </p>
      <h1 data-testid="record-title">{title}</h1>
      {saved === "1" && <SavedNotice text={t("rec.saved")} />}
      {cat && r.merchant && r.kind !== "transfer" && (
        <p className="muted" data-testid="record-tag">
          {r.merchant}
        </p>
      )}
      <section className="card">
        <dl className="facts">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      {linkedLines.length > 0 && (
        <section className="card" data-testid="linked">
          <h2>{r.kind === "income" ? t("rec.settles") : t("rec.settledBy")}</h2>
          <ul className="list">
            {linkedLines.map((line) => (
              <li key={line} className="row">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" id="receipt" data-testid="receipt">
        <h2>{t("rec.receipt")}</h2>
        <ReceiptPhoto recordId={r.id} householdId={membership.householdId} url={receiptUrl} canChange={canChange} text={pickMessages(lang, ["rec.", "f.", "err."])} />
      </section>

      {canChange && (
        <Link href={`/records/${r.id}/edit`} className="primary button-link" data-testid="edit-record">
          {t("rec.edit")}
        </Link>
      )}
      {canChange && (
        <section className="card">
          <DeleteRecord id={r.id} warning={warning} text={pickMessages(lang, ["rec.", "f.", "err."])} />
        </section>
      )}
    </main>
  );
}
