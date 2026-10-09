import { getT } from "@/lib/i18n-server";
import { pickMessages } from "@/lib/i18n";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../components/AppHeader";
import { LedgerForm } from "../LedgerForm";

export const dynamic = "force-dynamic";

export default async function NewLedgerPage() {
  const { lang, t } = await getT();
  await requireMembership();

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("led.new")}</h1>
      <LedgerForm
        values={{ name: "", type: "trip", currency: "SGD", start_date: "", end_date: "" }}
        text={pickMessages(lang, ["f.", "err.", "led."])}
        cancelHref="/ledgers"
      />
    </main>
  );
}
