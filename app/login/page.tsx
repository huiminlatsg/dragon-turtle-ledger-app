import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getT } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "../components/AppHeader";
import { StatusCard } from "../components/StatusCard";
import { GoogleButton } from "./GoogleButton";

export const dynamic = "force-dynamic";

function safeNext(next: string | undefined) {
  // Only same-site paths, never another site.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { lang, t } = await getT();
  const params = await searchParams;
  const next = safeNext(params.next);

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next);
  }

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn={false} />
      <h1>{t("app.name")}</h1>
      <p className="muted">{t("tagline")}</p>

      {isSupabaseConfigured && (
        <section className="card" aria-label={t("login.title")}>
          <h2>{t("login.title")}</h2>
          <p className="muted hint">{t("login.hint")}</p>
          <GoogleButton next={next} label={t("login.google")} busyLabel={t("login.opening")} failed={t("login.failed")} />
          {params.error && (
            <p className="error" role="alert">
              {t("login.cancelled")}
            </p>
          )}
        </section>
      )}

      <StatusCard t={t} />
      <p className="muted small-print">{t("status.install")}</p>
    </main>
  );
}
