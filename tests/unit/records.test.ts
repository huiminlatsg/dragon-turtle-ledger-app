import { describe, expect, it } from "vitest";
import { describeRecord, monthBounds, monthTitle, parseMonth, shiftMonth, type DescribeContext, type RecordRow } from "@/lib/records";
import { fitWithin, isReceiptPathFor, receiptPath } from "@/lib/receipt";

const ctx: DescribeContext = {
  lang: "en",
  ledgerById: new Map([
    ["L1", { name: "Daily", is_default: true }],
    ["L2", { name: "Japan trip", is_default: false }],
  ]),
  accountName: new Map([
    ["A1", "DBS Visa"],
    ["A2", "Cash"],
  ]),
  categoryName: new Map([["C1", "Groceries"]]),
  statusLabel: { to_submit: "To claim", submitted: "Claimed", received: "Received" },
  kindLabel: { expense: "Expense", income: "Income", transfer: "Transfer" },
  received: new Map(),
  receivedWord: "received",
};

const row: RecordRow = {
  id: "T1",
  kind: "expense",
  to_account_id: null,
  txn_at: "2026-10-06T06:30:00+00:00",
  amount: 12.5,
  currency: "SGD",
  amount_sgd: 12.5,
  merchant: "Cold Storage",
  category_id: "C1",
  ledger_id: "L1",
  account_id: "A1",
  recoverable_amount: 0,
  recovery_status: null,
};

describe("describeRecord", () => {
  it("titles an expense by its category and tags the merchant", () => {
    const v = describeRecord(row, ctx);
    expect(v.title).toBe("Groceries");
    expect(v.sub.startsWith("Cold Storage")).toBe(true); // the merchant (or "from") is the tag
    expect(v.sub).toContain("DBS Visa");
    expect(v.amount).toContain("12.50");
    expect(v.amountSgd).toBeNull();
  });
  it("has no tag when there is no merchant", () => {
    const v = describeRecord({ ...row, merchant: null }, ctx);
    expect(v.title).toBe("Groceries");
    expect(v.sub).not.toContain("Cold Storage");
  });
  it("titles a payback by its category and tags the from", () => {
    const v = describeRecord({ ...row, kind: "income", merchant: "Alice" }, ctx);
    expect(v.title).toBe("Groceries");
    expect(v.sub.startsWith("Alice")).toBe(true);
  });
  it("uses the merchant as the title when there is no category", () => {
    expect(describeRecord({ ...row, category_id: null }, ctx).title).toBe("Cold Storage");
  });
  it("marks income with a plus and names a non-default ledger", () => {
    const v = describeRecord({ ...row, kind: "income", ledger_id: "L2" }, ctx);
    expect(v.amount.startsWith("+")).toBe(true);
    expect(v.sub).toContain("Japan trip");
  });
  it("shows a transfer as from → to", () => {
    const v = describeRecord({ ...row, kind: "transfer", to_account_id: "A2", merchant: null, category_id: null }, ctx);
    expect(v.title).toBe("DBS Visa → Cash");
  });
  it("shows the paid-back part and what has been received", () => {
    const v = describeRecord({ ...row, amount: 100, recoverable_amount: 80, recovery_status: "submitted" }, { ...ctx, received: new Map([["T1", 20]]) });
    expect(v.sub).toContain("Claimed");
    expect(v.sub).toContain("received");
  });
  it("shows SGD under a foreign-currency amount", () => {
    const v = describeRecord({ ...row, currency: "JPY", amount: 5000, amount_sgd: 45 }, ctx);
    expect(v.amountSgd).toContain("45");
  });
});

describe("months", () => {
  it("reads a month from the address, else uses the current one in Singapore", () => {
    expect(parseMonth("2026-03")).toBe("2026-03");
    expect(parseMonth("2026-13", new Date("2026-10-06T00:00:00Z"))).toBe("2026-10");
    expect(parseMonth(undefined, new Date("2026-09-30T17:00:00Z"))).toBe("2026-10"); // already 1 Oct in Singapore
  });
  it("moves a month across the year end", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("covers a Singapore month, end exclusive", () => {
    expect(monthBounds("2026-12")).toEqual({ from: "2026-12-01T00:00:00+08:00", to: "2027-01-01T00:00:00+08:00" });
  });
  it("titles the month in both languages", () => {
    expect(monthTitle("2026-10", "en")).toContain("October");
    expect(monthTitle("2026-10", "zh")).toContain("10");
  });
});

describe("receipt photos", () => {
  const H = "11111111-1111-1111-1111-111111111111";
  const R = "22222222-2222-2222-2222-222222222222";
  const F = "33333333-3333-3333-3333-333333333333";
  it("scales a big photo down to the longest side", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("gives nothing for an empty photo", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
  it("builds the storage path from family, record and file", () => {
    expect(receiptPath(H, R, F)).toBe(`${H}/${R}/${F}.jpg`);
  });
  it("accepts only the path of this family's record", () => {
    expect(isReceiptPathFor(receiptPath(H, R, F), H, R)).toBe(true);
    expect(isReceiptPathFor(receiptPath(H, R, F), H, "other")).toBe(false);
    expect(isReceiptPathFor(receiptPath("other", R, F), H, R)).toBe(false);
    expect(isReceiptPathFor(`${H}/${R}/../x.jpg`, H, R)).toBe(false);
    expect(isReceiptPathFor(`${H}/${R}/sub/${F}.jpg`, H, R)).toBe(false);
    expect(isReceiptPathFor(`${H}/${R}/notes.txt`, H, R)).toBe(false);
  });
});
