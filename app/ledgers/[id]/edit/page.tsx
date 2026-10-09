import { notFound } from "next/navigation";
import { pickMessages } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import type { LedgerType } from "@/lib/ledgers";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../../components/AppHeader";
import { DeleteLedger } from "../../DeleteLedger";
import { LedgerForm } from "../../LedgerForm";
import { setLedgerArchived } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { lang, t } = await getT();
  const { supabase } = await requireMembership();
  const { id } = await params;

  const { data: ledger } = await supabase
    .from("ledgers")
    .select("id, name, type, default_currency, start_date, end_date, is_default, is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!ledger) notFound();

  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("ledger_id", id);
  const hasRecords = (count ?? 0) > 0;
  const text = pickMessages(lang, ["f.", "err.", "led."]);

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("led.editTitle")}</h1>
      <LedgerForm
        values={{
          id: ledger.id as string,
          name: ledger.name as string,
          type: ledger.type as LedgerType,
          currency: ledger.default_currency as string,
          start_date: (ledger.start_date as string | null) ?? "",
          end_date: (ledger.end_date as string | null) ?? "",
        }}
        text={text}
        cancelHref="/ledgers"
        typeFixed
        currencyLocked={hasRecords}
      />

      <section className="card">
        {ledger.is_default ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("led.defaultLocked")}
          </p>
        ) : (
          <>
            <form action={setLedgerArchived}>
              <input type="hidden" name="id" value={ledger.id as string} />
              <input type="hidden" name="archived" value={ledger.is_archived ? "false" : "true"} />
              <button type="submit" className="secondary">
                {ledger.is_archived ? t("led.unarchive") : t("led.archive")}
              </button>
              <p className="muted hint">{t("led.archiveHint")}</p>
            </form>
            {!hasRecords && <DeleteLedger id={ledger.id as string} text={text} />}
            {hasRecords && <p className="muted hint">{t("led.inUse")}</p>}
          </>
        )}
      </section>
    </main>
  );
}
