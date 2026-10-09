import "server-only";
import { cookies, headers } from "next/headers";
import { isLang, LANG_COOKIE, langFromAcceptLanguage, translator, type Lang } from "@/lib/i18n";

/** The visitor's language: their saved choice, else their browser's preference. */
export async function getLang(): Promise<Lang> {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(saved)) return saved;
  return langFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}
