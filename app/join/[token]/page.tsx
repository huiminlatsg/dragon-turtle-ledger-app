import { getT } from "@/lib/i18n-server";
import { getMembership } from "@/lib/session";
import { AppHeader } from "../../components/AppHeader";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

/** Opened from a family invite link: /join/<token>. Sign-in happens first (middleware). */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { lang, t } = await getT();
  const { token } = await params;
  const { membership } = await getMembership();

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("join.title")}</h1>
      {membership ? (
        <p className="card">{t("join.already")}</p>
      ) : (
        <>
          <p className="muted">{t("join.intro")}</p>
          <JoinForm
            token={token}
            text={{
              yourName: t("welcome.yourName"),
              yourNamePlaceholder: t("welcome.yourNamePlaceholder"),
              join: t("join.button"),
              joining: t("join.joining"),
              invalid: t("join.invalid"),
              generic: t("error.generic"),
            }}
          />
        </>
      )}
    </main>
  );
}
