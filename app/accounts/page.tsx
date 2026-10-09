import Link from "next/link";
import { ACCOUNT_TYPES, accountLabel, cardSchedule, type AccountListRow } from "@/lib/accounts";
import { formatDay } from "@/lib/format";
import { getT } from "@/lib/i18n-server";
import { formatMoney } from "@/lib/money";
import { toSgtDate } from "@/lib/periods";
import { requireMembership } from "@/lib/session";
import { AccountTile } from "../components/AccountTile";
import { AppHeader } from "../components/AppHeader";

export const dynamic = "force-dynamic";


export default async function AccountsPage() {
  const { lang, t } = await getT();
  const { supabase } = await requireMembership();
  const today = toSgtDate(new Date());

  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, nickname, type, issuer, network, last4, color, currency, statement_day, due_day, due_days_after_statement, funding_account_id, is_active")
      .order("name"),
    supabase.from("v_account_balances").select("account_id, balance"),
  ]);
  const rows = (accounts ?? []) as AccountListRow[];
  const balanceOf = new Map(((balances ?? []) as { account_id: string; balance: number }[]).map((b) => [b.account_id, Number(b.balance)]));
  const nameOf = new Map(rows.map((a) => [a.id, accountLabel(a)]));
  const active = rows.filter((a) => a.is_active);
  const archived = rows.filter((a) => !a.is_active);

  const line = (a: AccountListRow) => {
    const bits: string[] = [];
    // With a nickname the official name goes underneath; the tile already shows the bank.
    if (a.nickname) bits.push(a.name);
    else if (a.issuer) bits.push(a.issuer);
    if (a.last4) bits.push(`•••• ${a.last4}`);
    if (a.type === "debit_card" && a.funding_account_id) bits.push(t("acc.drawsFrom", { bank: nameOf.get(a.funding_account_id) ?? "" }));
    return bits.join(" · ");
  };

  const amount = (a: AccountListRow) => {
    if (a.type === "debit_card") return null;
    const b = balanceOf.get(a.id) ?? 0;
    if (a.type === "credit_card") {
      return b < 0 ? (
        <span>
          <span className="muted small">{t("acc.owed")} </span>
          {formatMoney(-b, a.currency)}
        </span>
      ) : b > 0 ? (
        <span>
          <span className="muted small">{t("acc.inCredit")} </span>
          {formatMoney(b, a.currency)}
        </span>
      ) : (
        formatMoney(0, a.currency)
      );
    }
    return formatMoney(b, a.currency);
  };

  const item = (a: AccountListRow) => {
    const sched = a.type === "credit_card" ? cardSchedule(a, today) : null;
    return (
      <li key={a.id}>
        <Link href={`/accounts/${a.id}`} className="row account-row">
          <span className="account-main">
            <AccountTile account={a} />
            <span>
              <span className="account-name">{accountLabel(a)}</span>
              {line(a) && <span className="muted small block">{line(a)}</span>}
              {sched && (
                <span className="muted small block">
                  {t("acc.nextStatement", { date: formatDay(sched.nextStatement, lang) })}
                  {sched.nextDue && ` · ${t("acc.nextDue", { date: formatDay(sched.nextDue, lang) })}`}
                </span>
              )}
            </span>
          </span>
          <span className="amount">{amount(a)}</span>
        </Link>
      </li>
    );
  };

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <Link href="/family" className="muted small">
        ← {t("nav.family")}
      </Link>
      <h1>{t("accounts.title")}</h1>

      <Link href="/accounts/new" className="primary button-link" data-testid="add-account">
        + {t("accounts.add")}
      </Link>

      {active.length === 0 && <p className="card">{t("accounts.empty")}</p>}

      {ACCOUNT_TYPES.map((type) => {
        const list = active.filter((a) => a.type === type);
        if (!list.length) return null;
        return (
          <section key={type} className="card" aria-label={t(`type.${type}`)}>
            <h2>{t(`type.${type}`)}</h2>
            <ul className="list">{list.map(item)}</ul>
          </section>
        );
      })}

      {archived.length > 0 && (
        <details className="card">
          <summary>{t("accounts.archived", { count: archived.length })}</summary>
          <ul className="list">{archived.map(item)}</ul>
        </details>
      )}
    </main>
  );
}
