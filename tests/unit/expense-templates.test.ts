import { expect, it } from "vitest";
import { matchExpenseTemplate } from "@/lib/expense-templates";
const templates = [{ id: "market", merchant: "Corner Market", account_id: "card-a", category_id: null }, { id: "fuel", merchant: "Fuel Station", account_id: "card-b", category_id: "fuel" }];
it("matches exact names ignoring case and whitespace", () => {
  expect(matchExpenseTemplate(templates, "  CORNER   market ", new Set(["card-a"]))?.account_id).toBe("card-a");
  expect(matchExpenseTemplate(templates, "fuel   station", new Set(["card-b"]))?.id).toBe("fuel");
});
it("does not partially match or select inactive accounts", () => {
  for (const merchant of ["", "Corner Market Express", "Fuel"]) expect(matchExpenseTemplate(templates, merchant, new Set(["card-a", "card-b"]))).toBeUndefined();
  expect(matchExpenseTemplate(templates, "Corner Market", new Set())).toBeUndefined();
});
