import { describe, expect, it } from "vitest";
import { parseLedgerForm } from "@/lib/ledgers";

describe("parseLedgerForm", () => {
  it("builds a trip ledger with currency and dates", () => {
    const r = parseLedgerForm({ name: " 2028 马来西亚 ", type: "trip", currency: "myr", start_date: "2028-02-10", end_date: "2028-02-14" });
    expect(r).toEqual({
      ok: true,
      row: { name: "2028 马来西亚", type: "trip", currency: "MYR", start_date: "2028-02-10", end_date: "2028-02-14" },
    });
  });

  it("defaults the currency to SGD and allows open-ended trip dates", () => {
    const r = parseLedgerForm({ name: "Japan", type: "trip", currency: "", start_date: "", end_date: "" });
    expect(r).toMatchObject({ ok: true, row: { currency: "SGD", start_date: null, end_date: null } });
  });

  it("ignores dates for rental and other ledgers", () => {
    const r = parseLedgerForm({ name: "Tampines unit", type: "property", start_date: "2028-01-01", end_date: "2028-12-31" });
    expect(r).toMatchObject({ ok: true, row: { type: "property", start_date: null, end_date: null } });
  });

  it("rejects a missing or too-long name", () => {
    expect(parseLedgerForm({ name: "  ", type: "trip" })).toEqual({ ok: false, errors: ["err.ledgerName"] });
    expect(parseLedgerForm({ name: "x".repeat(61), type: "trip" })).toEqual({ ok: false, errors: ["err.ledgerName"] });
  });

  it("rejects the daily type and unknown types when creating", () => {
    expect(parseLedgerForm({ name: "A", type: "daily" })).toEqual({ ok: false, errors: ["err.ledgerType"] });
    expect(parseLedgerForm({ name: "A", type: "nope" })).toEqual({ ok: false, errors: ["err.ledgerType"] });
    expect(parseLedgerForm({ name: "A" })).toEqual({ ok: false, errors: ["err.ledgerType"] });
  });

  it("rejects a bad currency", () => {
    expect(parseLedgerForm({ name: "A", type: "other", currency: "SG" })).toEqual({ ok: false, errors: ["err.currency"] });
    expect(parseLedgerForm({ name: "A", type: "other", currency: "S$D" })).toEqual({ ok: false, errors: ["err.currency"] });
  });

  it("rejects impossible dates and an end before the start", () => {
    expect(parseLedgerForm({ name: "A", type: "trip", start_date: "2028-02-30" })).toEqual({ ok: false, errors: ["err.ledgerDates"] });
    expect(parseLedgerForm({ name: "A", type: "trip", start_date: "2028-03-02", end_date: "2028-03-01" })).toEqual({
      ok: false,
      errors: ["err.ledgerDates"],
    });
  });

  it("keeps the saved type when editing, whatever the form says", () => {
    const r = parseLedgerForm({ name: "日常账本", type: "trip", currency: "SGD", start_date: "2028-01-01" }, "daily");
    expect(r).toEqual({ ok: true, row: { name: "日常账本", type: "daily", currency: "SGD", start_date: null, end_date: null } });
    const t = parseLedgerForm({ name: "Trip", type: "other", start_date: "2028-01-01" }, "trip");
    expect(t).toMatchObject({ ok: true, row: { type: "trip", start_date: "2028-01-01" } });
  });
});
