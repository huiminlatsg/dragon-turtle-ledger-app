import { describe, expect, it } from "vitest";
import { langFromAcceptLanguage, messages, translator } from "@/lib/i18n";

describe("messages", () => {
  it("has every key in both languages, none empty", () => {
    const en = Object.keys(messages.en).sort();
    const zh = Object.keys(messages.zh).sort();
    expect(zh).toEqual(en);
    for (const lang of ["en", "zh"] as const) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
      }
    }
  });

  it("uses the same {placeholders} in both languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(messages.en) as (keyof typeof messages.en)[]) {
      expect(vars(messages.zh[key]), key).toEqual(vars(messages.en[key]));
    }
  });
});

describe("translator", () => {
  it("fills in variables", () => {
    expect(translator("en")("home.hello", { name: "Alex" })).toBe("Hi, Alex");
    expect(translator("zh")("home.hello", { name: "Alex" })).toBe("你好，Alex");
  });
});

describe("langFromAcceptLanguage", () => {
  it.each([
    ["zh-CN,zh;q=0.9,en;q=0.8", "zh"],
    ["en-SG,en;q=0.9,zh-Hans;q=0.8", "en"],
    ["zh-Hans-SG", "zh"],
    ["fr-FR", "en"],
    [null, "en"],
  ] as const)("%s → %s", (header, lang) => {
    expect(langFromAcceptLanguage(header)).toBe(lang);
  });
});
