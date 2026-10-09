import Link from "next/link";
import { notFound } from "next/navigation";
import { accountLabel, cardSchedule } from "@/lib/accounts";
import { formatDay, monthName } from "@/lib/format";
import { pickMessages } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { formatMoney } from "@/lib/money";
import { addDays, periodFor, progress, toSgtDate, type PeriodKind } from "@/lib/periods";
import { requireMembership } from "@/lib/session";
import { AccountTile } from "../../components/AccountTile";
import { AppHeader } from "../../components/AppHeader";
import { deleteRule, setArchived } from "../actions";
import { DeleteAccount } from "../DeleteAccount";
import { RuleForm } from "../RuleForm";

export const dynamic = "force-dynamic";

type Rule = {
  id: string;
  kind: "min_spend" | "bonus_cap";
  period: PeriodKind;
  amount: number;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
};

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { lang, t } = await getT();
  const { supabase } = await requireMembership();
  const { id } = await params;
  const today = toSgtDate(new Date());

  const { data: a } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();

  const [{ data: balanceRow }, { data: rulesData }, { data: funding }] = await Promise.all([
    supabase.from("v_account_balances").select("balance").eq("account_id", id).maybeSingle(),
    supabase.from("spend_rules").select("id, kind, period, amount, valid_from, valid_to, note").eq("account_id", id).order("valid_from"),
    a.funding_account_id
      ? supabase.from("accounts").select("name").eq("id", a.funding_account_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rules = (rulesData ?? []) as Rule[];
  const isCard = a.type === "credit_card";
  const balance = Number(balanceRow?.balance ?? 0);
  const sched = isCard ? cardSchedule(a, today) : null;

  // Card spend counted toward each current rule's period.
  const current = rules
    .filter((r) => r.valid_from <= today && (!r.valid_to || r.valid_to >= today))
    .filter((r) => r.period === "calendar_month" || a.statement_day)
    .map((r) => ({ rule: r, period: periodFor(r.period, today, a.statement_day) }));
  let spentByRule = new Map<string, number>();
  if (current.length) {
    const from = current.reduce((m, c) => (c.period.start < m ? c.period.start : m), today);
    const to = current.reduce((m, c) => (c.period.end > m ? c.period.end : m), today);
    const { data: lines } = await supabase
      .from("v_min_spend_lines")
      .select("txn_at, amount_sgd")
      .eq("account_id", id)
      .gte("txn_at", `${from}T00:00:00+08:00`)
      .lt("txn_at", `${addDays(to, 1)}T00:00:00+08:00`);
    const dated = ((lines ?? []) as { txn_at: string; amount_sgd: number }[]).map((l) => ({ day: toSgtDate(l.txn_at), amount: Number(l.amount_sgd) }));
    spentByRule = new Map(
      current.map((c) => [
        c.rule.id,
        Math.round(dated.filter((l) => l.day >= c.period.start && l.day <= c.period.end).reduce((s, l) => s + l.amount, 0) * 100) / 100,
      ]),
    );
  }

  const ruleText = pickMessages(lang, ["rule.", "err.", "f.saving"]);
  const deleteText = pickMessages(lang, ["acc.delete", "acc.inUse", "f.cancel"]);
  const money = (n: number) => formatMoney(n, a.currency);

  const details: [string, string][] = [];
  if (a.issuer) details.push([t("f.issuer"), a.issuer]);
  if (a.last4) details.push([t("f.last4"), `•••• ${a.last4}`]);
  if (funding?.name) details.push([t("f.funding"), funding.name]);
  if (isCard && a.statement_day) details.push([t("f.statementDay"), String(a.statement_day)]);
  if (isCard && a.credit_limit) details.push([t("f.creditLimit"), money(Number(a.credit_limit))]);
  if (isCard && a.annual_fee_month) details.push([t("f.annualFeeMonth"), monthName(a.annual_fee_month, lang)]);
  if (a.currency !== "SGD") details.push([t("f.currency"), a.currency]);

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <p className="small">
        <Link href="/accounts">← {t("acc.back")}</Link>
      </p>
      <h1>{accountLabel(a)}</h1>
      <p className="muted">
        {a.nickname ? `${a.name} · ` : ""}
        {t(`typeOne.${a.type as "credit_card"}`)}
      </p>
      <AccountTile account={a} size="large" />
      {!a.is_active && <p className="badge warn">{t("acc.archivedNote")}</p>}

      {a.type !== "debit_card" && (
        <section className="card">
          <div className="row">
            <span>{isCard ? (balance < 0 ? t("acc.owed") : balance > 0 ? t("acc.inCredit") : t("acc.balance")) : t("acc.balance")}</span>
            <span className="amount big" data-testid="balance">
              {money(isCard ? Math.abs(balance) : balance)}
            </span>
          </div>
          {sched && (
            <div className="row">
              <span className="muted">{t("acc.nextStatement", { date: formatDay(sched.nextStatement, lang) })}</span>
              {sched.nextDue && <span className="muted">{t("acc.nextDue", { date: formatDay(sched.nextDue, lang) })}</span>}
            </div>
          )}
          {a.opening_balance_date && (
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              {t("acc.since", { date: formatDay(a.opening_balance_date, lang) })}
            </p>
          )}
        </section>
      )}

      {details.length > 0 && (
        <section className="card">
          {details.map(([k, v]) => (
            <div key={k} className="row">
              <span className="muted">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </section>
      )}

      {isCard && (
        <section className="card" aria-label={t("rule.title")}>
          <h2>{t("rule.title")}</h2>
          <p className="muted hint">{t("rule.hint")}</p>
          {rules.length === 0 && <p className="muted">{t("rule.none")}</p>}
          <ul className="list">
            {rules.map((r) => {
              const cur = current.find((c) => c.rule.id === r.id);
              const spent = spentByRule.get(r.id) ?? 0;
              const p = cur ? progress(cur.period, Number(r.amount), spent, today) : null;
              return (
                <li key={r.id} className="rule">
                  <div className="row">
                    <span>
                      <strong>{t(`rule.${r.kind}`)}</strong> {money(Number(r.amount))} <span className="muted">{t(`rule.${r.period}`)}</span>
                    </span>
                    <form action={deleteRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="account_id" value={id} />
                      <button type="submit" className="link-button danger-text">
                        {t("rule.delete")}
                      </button>
                    </form>
                  </div>
                  {p ? (
                    <>
                      <div className="meter" aria-hidden>
                        <span style={{ width: `${p.percent}%` }} className={p.met ? (r.kind === "bonus_cap" ? "warn-bg" : "ok-bg") : ""} />
                      </div>
                      <p className="small" style={{ margin: "4px 0 0" }}>
                        {t("rule.spent", { spent: money(spent), target: money(Number(r.amount)) })}
                        {" · "}
                        {r.kind === "min_spend"
                          ? p.met
                            ? t("rule.met")
                            : t("rule.toGo", { amount: money(p.remaining), days: p.daysLeft })
                          : p.met
                            ? t("rule.capReached")
                            : t("rule.capLeft", { amount: money(p.remaining) })}
                      </p>
                      <p className="muted small" style={{ margin: 0 }}>
                        {t("rule.window", { start: formatDay(p.period.start, lang), end: formatDay(p.period.end, lang) })}
                        {r.note && ` · ${r.note}`}
                      </p>
                    </>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      {r.valid_from > today
                        ? t("rule.notStarted", { date: formatDay(r.valid_from, lang) })
                        : r.valid_to
                          ? t("rule.ended", { date: formatDay(r.valid_to, lang) })
                          : t("err.needStatementDay")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <RuleForm accountId={id} text={ruleText} />
        </section>
      )}

      <div className="actions" style={{ marginTop: 20 }}>
        <Link href={`/accounts/${id}/edit`} className="primary button-link">
          {t("acc.edit")}
        </Link>
        <form action={setArchived}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={a.is_active ? "false" : "true"} />
          <button type="submit" className="secondary">
            {a.is_active ? t("acc.archive") : t("acc.unarchive")}
          </button>
        </form>
      </div>
      <div style={{ marginTop: 20 }}>
        <DeleteAccount id={id} text={deleteText} />
      </div>
    </main>
  );
}
