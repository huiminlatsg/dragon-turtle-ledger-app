import { describe, expect, it } from "vitest";
import { defaultReceiptAccount, splitCategory, formAmount, pickDefaults, settleCapacity, allocatePayback, mergeLinkIds, sameIds, paybackExceeds, parseIncomeForm, parseTransferForm, FOREIGN_CURRENCIES, childCategories, foreignCurrencyOptions, nowSgtInput, parseExpenseForm, parsePositiveAmount, sgtDateTimeToIso, topCategoriesFor, type CategoryOption } from "@/lib/expense";

const sgd = { id: "L1", currency: "SGD" };
const jpy = { id: "L2", currency: "JPY" };
const base = { amount: "12.50", category_id: "C1", account_id: "A0", txn_at: "2026-10-06T14:30" };

describe("parsePositiveAmount", () => {
  it("accepts plain, comma and S$ amounts", () => {
    expect(parsePositiveAmount("12.5")).toBe(12.5);
    expect(parsePositiveAmount("1,234.56")).toBe(1234.56);
    expect(parsePositiveAmount("S$9")).toBe(9);
  });
  it("rejects zero, negatives, 3 decimals and words", () => {
    for (const bad of ["", "0", "-5", "1.234", "abc", "1e3", "10000000000"]) expect(parsePositiveAmount(bad)).toBeNull();
  });
});

describe("sgtDateTimeToIso", () => {
  it("adds the Singapore offset", () => {
    expect(sgtDateTimeToIso("2026-10-06T14:30")).toBe("2026-10-06T14:30:00+08:00");
  });
  it("rejects impossible dates", () => {
    expect(sgtDateTimeToIso("2026-02-30T10:00")).toBeNull();
    expect(sgtDateTimeToIso("2026-10-06")).toBeNull();
    expect(sgtDateTimeToIso("2026-10-06T25:00")).toBeNull();
  });
});

describe("nowSgtInput", () => {
  it("shows Singapore time", () => {
    expect(nowSgtInput(new Date("2026-10-06T20:30:00Z"))).toBe("2026-10-07T04:30");
  });
});

describe("parseExpenseForm", () => {
  it("builds an SGD expense with no merchant and no foreign amount", () => {
    expect(parseExpenseForm(base, sgd)).toEqual({
      ok: true,
      row: {
        ledger_id: "L1",
        amount: 12.5,
        currency: "SGD",
        amount_sgd: 12.5,
        category_id: "C1",
        account_id: "A0",
        merchant_raw: null,
        notes: null,
        txn_at: "2026-10-06T14:30:00+08:00",
        foreign_amount: null,
        foreign_currency: null,
        recoverable_amount: 0,
        recovery_status: null,
      },
    });
  });

  it("keeps an optional merchant, account and notes", () => {
    const r = parseExpenseForm({ ...base, merchant_raw: " Cold Storage ", account_id: "A1", notes: " weekly " }, sgd);
    expect(r).toMatchObject({ ok: true, row: { merchant_raw: "Cold Storage", account_id: "A1", notes: "weekly" } });
  });

  it("needs the SGD amount for a non-SGD ledger", () => {
    expect(parseExpenseForm({ ...base, amount: "5000" }, jpy)).toEqual({ ok: false, errors: ["err.amountSgd"] });
    expect(parseExpenseForm({ ...base, amount: "5000", amount_sgd: "45.10" }, jpy)).toMatchObject({
      ok: true,
      row: { amount: 5000, currency: "JPY", amount_sgd: 45.1 },
    });
  });

  it("ignores foreign fields unless the box is ticked", () => {
    const r = parseExpenseForm({ ...base, foreign_currency: "usd", foreign_amount: "9" }, sgd);
    expect(r).toMatchObject({ ok: true, row: { foreign_amount: null, foreign_currency: null } });
  });

  it("records a foreign amount when ticked", () => {
    const r = parseExpenseForm({ ...base, is_foreign: "on", foreign_currency: "usd", foreign_amount: "9.99" }, sgd);
    expect(r).toMatchObject({ ok: true, row: { foreign_amount: 9.99, foreign_currency: "USD" } });
  });

  it("needs both foreign parts, and a currency other than the ledger's", () => {
    expect(parseExpenseForm({ ...base, is_foreign: "on" }, sgd)).toEqual({ ok: false, errors: ["err.foreignCurrency", "err.foreignAmount"] });
    expect(parseExpenseForm({ ...base, is_foreign: "on", foreign_currency: "SGD", foreign_amount: "5" }, sgd)).toEqual({
      ok: false,
      errors: ["err.foreignCurrency"],
    });
  });

  it("treats no account as cash", () => {
    expect(parseExpenseForm({ ...base, account_id: "" }, sgd)).toMatchObject({ ok: true, row: { account_id: null } });
  });

  it("reports every problem at once", () => {
    expect(parseExpenseForm({ amount: "x", txn_at: "nope", merchant_raw: "m".repeat(101) }, sgd)).toEqual({
      ok: false,
      errors: ["err.amount", "err.category", "err.when", "err.textLong"],
    });
  });
});

describe("foreign currency list", () => {
  it("has ten currencies: the usual five first, then the rest A to Z", () => {
    expect(FOREIGN_CURRENCIES.slice(0, 5)).toEqual(["USD", "GBP", "EUR", "MYR", "CNY"]);
    const rest = [...FOREIGN_CURRENCIES.slice(5)];
    expect(rest).toEqual([...rest].sort());
    expect(FOREIGN_CURRENCIES.length).toBe(10);
  });
  it("leaves out the ledger's own currency", () => {
    expect(foreignCurrencyOptions("JPY")).not.toContain("JPY");
    expect(foreignCurrencyOptions("SGD")).toHaveLength(10);
  });
});

describe("paid-back part", () => {
  const on = { ...base, amount: "100", is_recoverable: "on" };
  it("is zero and has no status unless ticked", () => {
    expect(parseExpenseForm({ ...base, recoverable_amount: "5", recovery_status: "submitted" }, sgd)).toMatchObject({
      ok: true,
      row: { recoverable_amount: 0, recovery_status: null },
    });
  });
  it("means the whole amount when ticked and left blank", () => {
    expect(parseExpenseForm(on, sgd)).toMatchObject({ ok: true, row: { recoverable_amount: 100, recovery_status: "to_submit" } });
  });
  it("takes a part and a status", () => {
    expect(parseExpenseForm({ ...on, recoverable_amount: "40", recovery_status: "submitted" }, sgd)).toMatchObject({
      ok: true,
      row: { recoverable_amount: 40, recovery_status: "submitted" },
    });
  });
  it("rejects more than the amount, junk, and a received status", () => {
    for (const bad of [{ recoverable_amount: "100.01" }, { recoverable_amount: "abc" }, { recoverable_amount: "0" }, { recovery_status: "received" }]) {
      expect(parseExpenseForm({ ...on, ...bad }, sgd)).toEqual({ ok: false, errors: ["err.recoverable"] });
    }
  });
});

const cat = (o: Partial<CategoryOption> & { id: string }): CategoryOption => ({
  parent_id: null,
  name: o.id,
  kind: "expense",
  ledger_type: null,
  nature: null,
  requires_account: false,
  requires_property: false,
  is_recovery: false,
  sort_order: 0,
  ...o,
});

describe("category helpers", () => {
  const cats: CategoryOption[] = [
    cat({ id: "a", name: "餐饮", sort_order: 2 }),
    cat({ id: "b", name: "旅行", ledger_type: "trip", sort_order: 1 }),
    cat({ id: "c", name: "房产", ledger_type: "property", sort_order: 3 }),
    cat({ id: "d", parent_id: "a", name: "晚餐", sort_order: 2 }),
    cat({ id: "e", parent_id: "a", name: "早餐", sort_order: 1 }),
    cat({ id: "i1", kind: "income", name: "租金收入", sort_order: 2 }),
    cat({ id: "i2", parent_id: "i1", kind: "income", name: "租金", requires_property: true, requires_account: true }),
    cat({ id: "i3", kind: "income", name: "回款类", sort_order: 3 }),
    cat({ id: "i4", parent_id: "i3", kind: "income", name: "报销到账", requires_account: true, is_recovery: true }),
  ];
  it("filters top-level categories by ledger type", () => {
    expect(topCategoriesFor(cats, "daily").map((c) => c.id)).toEqual(["a"]);
    expect(topCategoriesFor(cats, "trip").map((c) => c.id)).toEqual(["b", "a"]);
  });
  it("lists sub-categories in order", () => {
    expect(childCategories(cats, "a").map((c) => c.id)).toEqual(["e", "d"]);
  });
  it("offers income categories separately, and rent only in a rental ledger", () => {
    expect(topCategoriesFor(cats, "daily", "income").map((c) => c.id)).toEqual(["i3"]);
    expect(topCategoriesFor(cats, "property", "income").map((c) => c.id)).toEqual(["i1", "i3"]);
    expect(childCategories(cats, "i1", "daily")).toEqual([]);
    expect(childCategories(cats, "i1", "property").map((c) => c.id)).toEqual(["i2"]);
  });
});

describe("parseIncomeForm", () => {
  const f = { amount: "240", category_id: "C9", txn_at: "2026-10-06T14:30", account_id: "A1" };
  it("builds an income", () => {
    expect(parseIncomeForm({ ...f, merchant_raw: " Friends " }, sgd)).toEqual({
      ok: true,
      row: {
        ledger_id: "L1",
        kind: "income",
        amount: 240,
        currency: "SGD",
        amount_sgd: 240,
        category_id: "C9",
        account_id: "A1",
        merchant_raw: "Friends",
        notes: null,
        txn_at: "2026-10-06T14:30:00+08:00",
      },
    });
  });
  it("treats no account as cash", () => {
    expect(parseIncomeForm({ ...f, account_id: "" }, sgd)).toMatchObject({ ok: true, row: { account_id: null } });
  });
  it("needs a category and, in another currency, the SGD amount", () => {
    expect(parseIncomeForm({ ...f, category_id: "" }, sgd)).toEqual({ ok: false, errors: ["err.category"] });
    expect(parseIncomeForm(f, jpy)).toEqual({ ok: false, errors: ["err.amountSgd"] });
  });
});

describe("parseTransferForm", () => {
  const f = { amount: "500", account_id: "A1", to_account_id: "A2", txn_at: "2026-10-06T14:30" };
  it("builds a transfer between two accounts", () => {
    expect(parseTransferForm({ ...f, notes: "top up" }, sgd)).toEqual({
      ok: true,
      row: {
        ledger_id: "L1",
        kind: "transfer",
        amount: 500,
        currency: "SGD",
        amount_sgd: 500,
        account_id: "A1",
        to_account_id: "A2",
        notes: "top up",
        txn_at: "2026-10-06T14:30:00+08:00",
      },
    });
  });
  it("needs both accounts, and they must differ", () => {
    expect(parseTransferForm({ ...f, account_id: "", to_account_id: "" }, sgd)).toEqual({ ok: false, errors: ["err.fromAccount", "err.toAccount"] });
    expect(parseTransferForm({ ...f, to_account_id: "A1" }, sgd)).toEqual({ ok: false, errors: ["err.sameAccount"] });
  });
});

describe("allocatePayback", () => {
  it("fills each expense in turn until the payback runs out", () => {
    expect(allocatePayback(100, [{ id: "a", remaining: 80 }, { id: "b", remaining: 50 }])).toEqual([
      { id: "a", amount: 80 },
      { id: "b", amount: 20 },
    ]);
  });
  it("covers only part of an expense when the payback is small", () => {
    expect(allocatePayback(20, [{ id: "a", remaining: 80 }])).toEqual([{ id: "a", amount: 20 }]);
  });
  it("skips expenses once nothing is left, and never goes over", () => {
    expect(allocatePayback(80, [{ id: "a", remaining: 80 }, { id: "b", remaining: 50 }])).toEqual([{ id: "a", amount: 80 }]);
    expect(allocatePayback(120, [{ id: "a", remaining: 80 }])).toEqual([{ id: "a", amount: 80 }]);
  });
  it("works in cents without drift", () => {
    expect(allocatePayback(0.3, [{ id: "a", remaining: 0.1 }, { id: "b", remaining: 0.2 }])).toEqual([
      { id: "a", amount: 0.1 },
      { id: "b", amount: 0.2 },
    ]);
  });
});

describe("paybackExceeds", () => {
  it("warns only when the payback is more than the selected expenses wait for", () => {
    expect(paybackExceeds(120, [80])).toBe(true);
    expect(paybackExceeds(80, [80])).toBe(false);
    expect(paybackExceeds(20, [80])).toBe(false);
    expect(paybackExceeds(120, [])).toBe(false);
    expect(paybackExceeds(100, [80, 10])).toBe(true);
  });
});

describe("defaultReceiptAccount", () => {
  it("is the Cash account when there is one", () => {
    expect(defaultReceiptAccount([{ id: "b", type: "bank" }, { id: "c", type: "cash" }])).toBe("c");
  });
  it("is empty (cash) when there is none", () => {
    expect(defaultReceiptAccount([{ id: "b", type: "bank" }])).toBe("");
    expect(defaultReceiptAccount([])).toBe("");
  });
});

describe("splitCategory", () => {
  const cats = [
    { id: "T", parent_id: null },
    { id: "S", parent_id: "T" },
  ];
  it("gives a sub-category and its parent", () => {
    expect(splitCategory(cats, "S")).toEqual({ topId: "T", subId: "S" });
  });
  it("gives only the top level for a top-level category", () => {
    expect(splitCategory(cats, "T")).toEqual({ topId: "T", subId: "" });
  });
  it("gives nothing for a missing category", () => {
    expect(splitCategory(cats, null)).toEqual({ topId: "", subId: "" });
    expect(splitCategory(cats, "X")).toEqual({ topId: "", subId: "" });
  });
});

describe("formAmount", () => {
  it("shows two decimals", () => {
    expect(formAmount(12.5)).toBe("12.50");
    expect(formAmount("100")).toBe("100.00");
    expect(formAmount(null)).toBe("");
  });
});

describe("pickDefaults", () => {
  const available = { accountIds: new Set(["A1", "A2", "CASH"]), ledgerIds: new Set(["L1", "L2"]) };
  it("starts from the last expense account, the last transfer and the last ledger", () => {
    const recent = [
      { kind: "transfer" as const, account_id: "A1", to_account_id: "A2", ledger_id: "L1" },
      { kind: "expense" as const, account_id: "A2", to_account_id: null, ledger_id: "L2" },
      { kind: "expense" as const, account_id: "A1", to_account_id: null, ledger_id: "L1" },
    ];
    expect(pickDefaults(recent, available)).toEqual({ expenseAccount: "A2", transferFrom: "A1", transferTo: "A2", ledgerId: "L2" });
  });
  it("starts empty when there is nothing yet", () => {
    expect(pickDefaults([], available)).toEqual({ expenseAccount: "", transferFrom: "", transferTo: "", ledgerId: "" });
  });
  it("starts on cash when the last expense was in cash", () => {
    expect(pickDefaults([{ kind: "expense", account_id: null, to_account_id: null, ledger_id: "L1" }], available).expenseAccount).toBe("");
  });
  it("never offers an account or ledger that is no longer available", () => {
    const recent = [
      { kind: "expense" as const, account_id: "GONE", to_account_id: null, ledger_id: "OLD" },
      { kind: "transfer" as const, account_id: "A1", to_account_id: "GONE", ledger_id: "L1" },
    ];
    expect(pickDefaults(recent, available)).toEqual({ expenseAccount: "", transferFrom: "A1", transferTo: "", ledgerId: "" });
  });
  it("lets income decide the ledger too", () => {
    const recent = [{ kind: "income" as const, account_id: null, to_account_id: null, ledger_id: "L2" }];
    expect(pickDefaults(recent, available).ledgerId).toBe("L2");
  });
});

describe("mergeLinkIds", () => {
  it("keeps links to claims the form did not offer", () => {
    expect(mergeLinkIds(["a", "b"], ["b", "c"], [])).toEqual(["a"]);
  });
  it("drops offered claims left unticked and adds newly ticked ones", () => {
    expect(mergeLinkIds(["a", "b"], ["a", "b", "c"], ["b", "c"])).toEqual(["b", "c"]);
  });
  it("does not repeat an id", () => {
    expect(mergeLinkIds(["a"], [], ["a"])).toEqual(["a"]);
  });
  it("sameIds ignores order", () => {
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
  });
});

describe("settleCapacity", () => {
  it("lets a claim settle up to the claim", () => {
    expect(settleCapacity({ amount: 100, recoverable_amount: 40, recoverable_from_link: false })).toEqual({ isClaim: true, cap: 40 });
  });
  it("lets ordinary spend settle up to its amount", () => {
    expect(settleCapacity({ amount: "100.00", recoverable_amount: "0.00", recoverable_from_link: false })).toEqual({ isClaim: false, cap: 100 });
  });
  it("lets spend made recoverable by a refund take further refunds", () => {
    expect(settleCapacity({ amount: 100, recoverable_amount: 30, recoverable_from_link: true })).toEqual({ isClaim: false, cap: 100 });
  });
});
