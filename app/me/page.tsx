import { getT } from "@/lib/i18n-server";
import { getMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";
import { SignOutButton } from "../components/SignOutButton";

export const dynamic = "force-dynamic";

/** The signed-in person's own page: who they're signed in as, and sign out. Separate from the family. */
export default async function MePage() {
  const { lang, t } = await getT();
  const { supabase, membership } = await getMembership();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("me.title")}</h1>

      <section className="card">
        {membership && (
          <div className="row">
            <span className="muted">{t("me.name")}</span>
            <span>{membership.displayName}</span>
          </div>
        )}
        <div className="row">
          <span className="muted">{t("me.email")}</span>
          <span data-testid="me-email">{user?.email ?? ""}</span>
        </div>
        {membership && (
          <div className="row">
            <span className="muted">{t("me.family")}</span>
            <span>{membership.familyName}</span>
          </div>
        )}
      </section>

      <div className="signout">
        <SignOutButton label={t("nav.signOut")} />
      </div>
    </main>
  );
}
