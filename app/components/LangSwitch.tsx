"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";

/** Toggles between Chinese and English and remembers the choice for a year. */
export function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  const next: Lang = lang === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      className="link-button"
      data-testid="lang-switch"
      aria-label={next === "zh" ? "切换到中文" : "Switch to English"}
      onClick={() => {
        document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
