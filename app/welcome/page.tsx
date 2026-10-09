import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { getMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";
import { CreateFamilyForm } from "./CreateFamilyForm";

export const dynamic = "force-dynamic";

/** First run for an account with no family: start one (first family, or with a new-family invite). */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ fi?: string }> }) {
  const { lang, t } = await getT();
  const { membership } = await getMembership();
  if (membership) redirect("/");
  const familyInvite = (await searchParams).fi ?? "";

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("welcome.title")}</h1>
      <p className="muted">{t("welcome.intro")}</p>
      <CreateFamilyForm
        familyInvite={familyInvite}
        text={{
          familyName: t("welcome.familyName"),
          familyNamePlaceholder: t("welcome.familyNamePlaceholder"),
          yourName: t("welcome.yourName"),
          yourNamePlaceholder: t("welcome.yourNamePlaceholder"),
          familyInvite: t("welcome.familyInvite"),
          create: t("welcome.create"),
          creating: t("welcome.creating"),
          needInvite: t("welcome.needInvite"),
          generic: t("error.generic"),
        }}
      />
      <p className="muted small-print">{t("welcome.joinHint")}</p>
    </main>
  );
}
