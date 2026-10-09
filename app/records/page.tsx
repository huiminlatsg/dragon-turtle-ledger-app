import Link from "next/link";
import { accountLabel } from "@/lib/accounts";
import { getT } from "@/lib/i18n-server";
import { RECORD_COLUMNS, describeRecord, monthBounds, monthTitle, parseMonth, shiftMonth, type RecordRow } from "@/lib/records";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";
import { SavedNotice } from "../add/SavedNotice";

export const dynamic = "force-dynamic";

const LIMIT = 300;

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ month?: string; deleted?: string }> }) {
  const { lang, t } = await getT();
  const { supabase } = await requireMembership();
  const { month: wanted, deleted } = await searchParams;
  const month = parseMonth(wanted);
  const { from, to } = monthBounds(month);

  const [{ data: rows }, { data: ledgerRows }, { data: accountRows }, { data: categoryRows }, { data: linkRows }] = await Promise.all([
    supabase.from("transactions").select(RECORD_COLUMNS).gte("txn_at", from).lt("txn_at", to).order("txn_at", { ascending: false }).limit(LIMIT),
    supabase.from("ledgers").select("id, name, is_default"),
    supabase.from("accounts").select("id, name, nickname, type"),
    supabase.from("categories").select("id, name"),
    supabase.from("recovery_links").select("expense_id, amount"),
  ]);

  const records = (rows ?? []) as RecordRow[];
  const ctx = {
    lang,
    ledgerById: new Map(((ledgerRows ?? []) as { id: string; name: string; is_default: boolean }[]).map((l) => [l.id, l])),
    accountName: new Map(((accountRows ?? []) as { id: string; name: string; nickname: string | null; type: string }[]).map((a) => [a.id, accountLabel(a)])),
    categoryName: new Map(((categoryRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name])),
    statusLabel: { to_submit: t("add.toSubmit"), submitted: t("add.submitted"), received: t("add.received") },
    kindLabel: { expense: t("add.kind.expense"), income: t("add.kind.income"), transfer: t("add.kind.transfer") },
    received: new Map<string, number>(),
    receivedWord: t("add.receivedWord"),
  };
  for (const l of (linkRows ?? []) as { expense_id: string; amount: number }[]) {
    ctx.received.set(l.expense_id, (ctx.received.get(l.expense_id) ?? 0) + Number(l.amount));
  }

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("rec.title")}</h1>
      {deleted === "1" && <SavedNotice param="deleted" text={t("rec.deleted")} />}
      <div className="month-nav">
        <Link href={`/records?month=${shiftMonth(month, -1)}`} data-testid="month-prev">
          {t("rec.prevMonth")}
        </Link>
        <strong data-testid="month-title">{monthTitle(month, lang)}</strong>
        <Link href={`/records?month=${shiftMonth(month, 1)}`} data-testid="month-next">
          {t("rec.nextMonth")}
        </Link>
      </div>

      {records.length === 0 ? (
        <p className="muted">{t("rec.empty")}</p>
      ) : (
        <ul className="list card" data-testid="records">
          {records.map((r) => {
            const v = describeRecord(r, ctx);
            return (
              <li key={r.id}>
                <Link href={`/records/${r.id}`} className="row" data-testid="record-row">
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
      <p>
        <Link href="/add" className="primary button-link">
          {t("add.button")}
        </Link>
      </p>
    </main>
  );
}
