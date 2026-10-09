import Link from "next/link";
import { formatDay } from "@/lib/format";
import { getT } from "@/lib/i18n-server";
import type { LedgerListRow } from "@/lib/ledgers";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";

export const dynamic = "force-dynamic";

export default async function LedgersPage() {
  const { lang, t } = await getT();
  const { supabase } = await requireMembership();

  const { data } = await supabase
    .from("ledgers")
    .select("id, name, type, default_currency, counts_in_household, start_date, end_date, is_default, is_archived")
    .order("is_default", { ascending: false })
    .order("created_at");
  const rows = (data ?? []) as LedgerListRow[];
  const active = rows.filter((l) => !l.is_archived);
  const archived = rows.filter((l) => l.is_archived);

  const line = (l: LedgerListRow) => {
    const bits = [t(`led.type.${l.type}`), l.default_currency];
    if (l.start_date || l.end_date) {
      bits.push([l.start_date ? formatDay(l.start_date, lang) : "…", l.end_date ? formatDay(l.end_date, lang) : "…"].join(" – "));
    }
    return bits.join(" · ");
  };

  const item = (l: LedgerListRow) => (
    <li key={l.id}>
      <Link href={`/ledgers/${l.id}/edit`} className="row">
        <span>
          <span className="account-name">{l.name}</span>
          <span className="muted small block">{line(l)}</span>
        </span>
        <span>
          {l.is_default && <span className="badge">{t("led.default")}</span>}
          {!l.counts_in_household && <span className="badge">{t("led.separate")}</span>}
        </span>
      </Link>
    </li>
  );

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <Link href="/family" className="muted small">
        ← {t("nav.family")}
      </Link>
      <h1>{t("ledgers.title")}</h1>
      <p className="muted">{t("ledgers.intro")}</p>

      <Link href="/ledgers/new" className="primary button-link" data-testid="add-ledger">
        + {t("ledgers.add")}
      </Link>

      <section className="card" aria-label={t("ledgers.title")}>
        <ul className="list">{active.map(item)}</ul>
      </section>

      {archived.length > 0 && (
        <details className="card">
          <summary>{t("ledgers.archived", { count: archived.length })}</summary>
          <ul className="list">{archived.map(item)}</ul>
        </details>
      )}
    </main>
  );
}
