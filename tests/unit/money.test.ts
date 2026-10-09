import { describe, expect, it } from "vitest";
import { detectCurrency, formatMoney, parseAmount, roundCents } from "@/lib/money";

describe("parseAmount", () => {
  it.each([
    ["12.50", 12.5],
    ["S$12.50", 12.5],
    ["SGD 1,234.56", 1234.56],
    ["$0.99", 0.99],
    ["12", 12],
    [".5", 0.5],
    ["-5", -5],
    ["(8.20)", -8.2],
    ["USD 20.00", 20],
    ["1.005", 1.01],
    [7.456, 7.46],
  ] as const)("parses %j as %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "0", "0.00", null, undefined, Number.NaN])("rejects %j", (input) => {
    expect(parseAmount(input as string)).toBeNull();
  });
});

describe("detectCurrency", () => {
  it("reads codes next to the amount", () => {
    expect(detectCurrency("USD 20.00")).toBe("USD");
    expect(detectCurrency("20.00 JPY")).toBe("JPY");
    expect(detectCurrency("S$5")).toBe("SGD");
  });
  it("ignores three-letter words that aren't next to the amount", () => {
    expect(detectCurrency("TOAST BOX $4.20")).toBe("SGD");
  });
});

describe("formatting", () => {
  it("rounds to cents", () => expect(roundCents(0.1 + 0.2)).toBe(0.3));
  it("formats SGD", () => expect(formatMoney(1234.5)).toMatch(/1,234\.50/));
});
