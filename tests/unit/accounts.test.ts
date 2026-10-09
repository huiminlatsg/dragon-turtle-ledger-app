import { describe, expect, it } from "vitest";
import { accountLabel, cardSchedule, dueDateFor, parseAccountForm, parseRuleForm } from "@/lib/accounts";

describe("parseAccountForm", () => {
  it("builds a credit card and stores the amount owed as negative", () => {
    const r = parseAccountForm({
      type: "credit_card",
      name: " Citi Rewards ",
      issuer: "Citi",
      network: "visa",
      last4: "1234",
      statement_day: "25",
      due_mode: "after",
      due_value: "25",
      credit_limit: "10,000",
      annual_fee_month: "3",
      topups_count_to_min_spend: "on",
      opening_balance: "512.30",
      opening_balance_date: "2026-10-01",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      name: "Citi Rewards",
      statement_day: 25,
      due_day: null,
      due_days_after_statement: 25,
      credit_limit: 10000,
      annual_fee_month: 3,
      topups_count_to_min_spend: false, // chosen per top-up, never on the card
      opening_balance: -512.3,
      currency: "SGD",
    });
  });

  it("drops card-only settings for other account types", () => {
    const r = parseAccountForm({
      type: "stored_value",
      name: "GrabPay",
      statement_day: "5",
      due_mode: "day",
      due_value: "12",
      last4: "9999",
      topups_count_to_min_spend: "on",
      opening_balance: "40",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      statement_day: null,
      due_day: null,
      last4: null,
      topups_count_to_min_spend: false,
      opening_balance: 40,
    });
  });

  it("requires a bank for a debit card, and no balance of its own", () => {
    expect(parseAccountForm({ type: "debit_card", name: "OCBC debit" })).toEqual({ ok: false, errors: ["err.funding"] });
    const r = parseAccountForm({ type: "debit_card", name: "OCBC debit", funding_account_id: "abc", opening_balance: "50" });
    expect(r.ok && r.row.opening_balance).toBe(0);
  });

  it("reports every problem", () => {
    const r = parseAccountForm({ type: "credit_card", name: "", last4: "12a4", statement_day: "40", currency: "S$" });
    expect(r).toEqual({ ok: false, errors: ["err.name", "err.last4", "err.currency", "err.day"] });
  });
});

describe("nickname", () => {
  it("is optional, trimmed, and at most 40 characters", () => {
    const none = parseAccountForm({ type: "credit_card", name: "DBS yuu" });
    expect(none.ok && none.row.nickname).toBeNull();
    const some = parseAccountForm({ type: "credit_card", name: "DBS yuu", nickname: "  DBS_Yuu " });
    expect(some.ok && some.row.nickname).toBe("DBS_Yuu");
    const blank = parseAccountForm({ type: "credit_card", name: "DBS yuu", nickname: "   " });
    expect(blank.ok && blank.row.nickname).toBeNull();
    expect(parseAccountForm({ type: "credit_card", name: "DBS yuu", nickname: "x".repeat(41) })).toEqual({ ok: false, errors: ["err.nickname"] });
  });
  it("is what lists show, with the official name as the fallback", () => {
    expect(accountLabel({ name: "DBS yuu", nickname: "DBS_Yuu" })).toBe("DBS_Yuu");
    expect(accountLabel({ name: "DBS yuu", nickname: null })).toBe("DBS yuu");
    expect(accountLabel({ name: "DBS yuu", nickname: "  " })).toBe("DBS yuu");
    expect(accountLabel({ name: "DBS yuu" })).toBe("DBS yuu");
  });
});

describe("dueDateFor", () => {
  it("adds days after the statement", () => {
    expect(dueDateFor("2026-10-25", { due_day: null, due_days_after_statement: 25 })).toBe("2026-11-19");
  });
  it("uses the next fixed due day after the statement, clamped to short months", () => {
    expect(dueDateFor("2026-10-25", { due_day: 12, due_days_after_statement: null })).toBe("2026-11-12");
    expect(dueDateFor("2026-10-05", { due_day: 28, due_days_after_statement: null })).toBe("2026-10-28");
    expect(dueDateFor("2027-01-31", { due_day: 30, due_days_after_statement: null })).toBe("2027-02-28");
    expect(dueDateFor("2026-12-20", { due_day: 5, due_days_after_statement: null })).toBe("2027-01-05");
  });
});

describe("cardSchedule", () => {
  const card = { statement_day: 25, due_day: 12, due_days_after_statement: null };
  it("shows the last statement's due date while it is still ahead", () => {
    expect(cardSchedule(card, "2026-11-04")).toEqual({ nextStatement: "2026-11-25", nextDue: "2026-11-12" });
  });
  it("moves on to the coming statement once the last one's due date has passed", () => {
    expect(cardSchedule(card, "2026-11-13")).toEqual({ nextStatement: "2026-11-25", nextDue: "2026-12-12" });
  });
  it("needs a statement day", () => {
    expect(cardSchedule({ statement_day: null, due_day: 5, due_days_after_statement: null }, "2026-11-01")).toBeNull();
  });
});

describe("parseRuleForm", () => {
  it("builds a monthly min-spend rule starting today by default", () => {
    expect(parseRuleForm({ kind: "min_spend", period: "calendar_month", amount: "800" }, { statement_day: null }, "2026-10-04")).toEqual({
      ok: true,
      row: { kind: "min_spend", period: "calendar_month", amount: 800, valid_from: "2026-10-04", valid_to: null, note: null },
    });
  });
  it("needs a statement day for billing-cycle rules and a positive amount", () => {
    expect(parseRuleForm({ period: "statement_cycle", amount: "0" }, { statement_day: null }, "2026-10-04")).toEqual({
      ok: false,
      errors: ["err.needStatementDay", "err.amount"],
    });
  });
});

describe("strict calendar dates", () => {
  it("rejects impossible opening-balance dates rather than rolling them into another month", () => {
    for (const invalid of ["2026-02-30", "2025-02-29", "2026-04-31", "0000-01-01"]) {
      expect(parseAccountForm({ type: "bank", name: "Savings", opening_balance_date: invalid })).toEqual({
        ok: false,
        errors: ["err.date"],
      });
    }
    const leap = parseAccountForm({ type: "bank", name: "Savings", opening_balance_date: "2024-02-29" });
    expect(leap.ok && leap.row.opening_balance_date).toBe("2024-02-29");
  });

  it("rejects impossible minimum-spend rule start and end dates", () => {
    const card = { statement_day: null };
    expect(parseRuleForm({ amount: "500", valid_from: "2026-02-30" }, card, "2026-10-08")).toEqual({
      ok: false,
      errors: ["err.date"],
    });
    expect(parseRuleForm({ amount: "500", valid_from: "2026-10-08", valid_to: "2026-11-31" }, card, "2026-10-08")).toEqual({
      ok: false,
      errors: ["err.date"],
    });
  });
});
