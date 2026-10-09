import { describe, expect, it } from "vitest";
import { categoryCardDefaults, twoMonthsAgo, type CardUse } from "@/lib/card-defaults";
const use = (account_id: string | null, category_id = "dinner", status = "confirmed"): CardUse => ({ account_id, category_id, status, kind: "expense" });
const active = new Set(["card", "bank", "cash"]);
const rows = (n: number, account: string) => Array.from({ length: n }, () => use(account));
describe("sub-category account defaults", () => {
  it("requires strictly over 75% at ten or more purchases", () => {
    expect(categoryCardDefaults([...rows(8, "bank"), ...rows(2, "card")], active).dinner.accountId).toBe("bank");
    expect(categoryCardDefaults([...rows(9, "card"), ...rows(3, "bank")], active)).toEqual({});
    expect(categoryCardDefaults([...rows(7, "card"), ...rows(3, "cash")], active)).toEqual({});
  });
  it("uses the latest account, not the majority, for 1–9 purchases", () => {
    for (const count of [1, 2, 9]) {
      const result = categoryCardDefaults([use("cash"), ...rows(count - 1, "card")], active);
      expect(result.dinner).toEqual({ accountId: "cash", uses: 1, total: count, reason: "last-used" });
    }
  });
  it("uses older sub-category history when the recent count is zero", () => {
    expect(categoryCardDefaults([], active, [use("bank")]).dinner).toEqual({ accountId: "bank", uses: 0, total: 0, reason: "last-used" });
    expect(categoryCardDefaults([], active)).toEqual({});
  });
  it("keeps exact sub-categories separate and accepts cash/bank majorities", () => {
    const result = categoryCardDefaults([...rows(10, "cash"), ...rows(10, "bank").map(r => ({ ...r, category_id: "fuel" }))], active);
    expect(result.dinner.accountId).toBe("cash");
    expect(result.fuel.accountId).toBe("bank");
  });
  it("counts unavailable accounts but never selects them or substitutes older accounts", () => {
    expect(categoryCardDefaults([...rows(7, "card"), ...rows(3, "inactive")], active)).toEqual({});
    expect(categoryCardDefaults([use("inactive"), use("card")], active)).toEqual({});
    expect(categoryCardDefaults(rows(10, "inactive"), active)).toEqual({});
  });
  it("ignores pending, income and uncategorised entries", () => {
    expect(categoryCardDefaults([use("card", "dinner", "pending"), { ...use("card"), kind: "income" }, { ...use("card"), category_id: null }], active)).toEqual({});
  });
  it("clamps calendar month ends and uses Singapore dates across UTC midnight", () => {
    expect(twoMonthsAgo(new Date("2026-04-30T10:00:00Z"))).toBe("2026-02-28T10:00:00.000Z");
    expect(twoMonthsAgo(new Date("2026-10-07T16:30:00Z"))).toBe("2026-08-07T16:30:00.000Z");
    expect(twoMonthsAgo(new Date("2024-04-30T10:00:00Z"))).toBe("2024-02-29T10:00:00.000Z");
  });
});
