import type { Lang } from "@/lib/i18n";

const locale = (lang: Lang) => (lang === "zh" ? "zh-SG" : "en-SG");

/** "2026-11-25" → "25 Nov" / "11月25日" (with the year when it isn't this year). */
export function formatDay(date: string, lang: Lang, thisYear = new Date().getUTCFullYear()): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    ...(d.getUTCFullYear() !== thisYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(d);
}

/** 1 → "January" / "一月". */
export function monthName(month: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 1)));
}
