import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { getT } from "@/lib/i18n-server";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "./components/AppHeader";
import { StatusCard } from "./components/StatusCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { lang, t } = await getT();

  // Without a database (local build, CI) show the status page only.
  if (!isSupabaseConfigured) {
    return (
      <main>
        <AppHeader lang={lang} t={t} signedIn={false} />
        <h1>{t("app.name")}</h1>
        <p className="muted">{t("tagline")}</p>
        <StatusCard t={t} />
        <p className="muted small-print">{t("status.install")}</p>
      </main>
    );
  }

  const { membership } = await requireMembership();

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("home.hello", { name: membership.displayName })}</h1>
      <section className="card" aria-label={t("home.family")}>
        <Link href="/family" className="row" data-testid="family-link">
          <span>
            <span className="muted small block">{t("home.family")}</span>
            <span className="account-name" data-testid="family-name">
              {membership.familyName}
            </span>
          </span>
          <span className="muted">→</span>
        </Link>
      </section>
      <Link href="/add" className="primary button-link" data-testid="add-expense">
        {t("add.button")}
      </Link>
      <Link href="/records" className="secondary button-link" data-testid="all-records">
        {t("rec.title")}
      </Link>
      <Link href="/recurring" className="secondary button-link">{t("repeat.title")}</Link>
      <StatusCard t={t} />
    </main>
  );
}
