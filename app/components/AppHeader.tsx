import Link from "next/link";
import { env } from "@/lib/env";
import type { Lang, Translate } from "@/lib/i18n";
import { LangSwitch } from "./LangSwitch";

/** Top bar: app name, navigation (when signed in), language switch. */
export function AppHeader({ lang, t, signedIn }: { lang: Lang; t: Translate; signedIn: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label={t("app.name")}>
        <span className="logo small" aria-hidden>
          {/* The mascot is a plain static file, so a regular img is right here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot.svg" alt="" width={32} height={32} />
        </span>
        {env.appEnv !== "production" && (
          <span className="env-badge" data-testid="env-badge">
            {env.appEnv.toUpperCase()}
          </span>
        )}
      </Link>
      <nav className="topnav">
        {signedIn && (
          <>
            <Link href="/">{t("nav.home")}</Link>
            <Link href="/family">{t("nav.family")}</Link>
            <Link href="/me">{t("nav.me")}</Link>
          </>
        )}
        <LangSwitch lang={lang} label={t("lang.switch")} />
      </nav>
    </header>
  );
}
