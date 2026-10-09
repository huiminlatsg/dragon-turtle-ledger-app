import { expect, it } from "vitest";
import { matchExpenseTemplate } from "@/lib/expense-templates";
const templates = [{ id: "giant", merchant: "Giant", account_id: "yuu", category_id: null }, { id: "shell", merchant: "Shell Station", account_id: "citi", category_id: "fuel" }];
it("matches exact names ignoring case and whitespace", () => {
  expect(matchExpenseTemplate(templates, "  GIANT ", new Set(["yuu"]))?.account_id).toBe("yuu");
  expect(matchExpenseTemplate(templates, "shell   station", new Set(["citi"]))?.id).toBe("shell");
});
it("does not partially match or select inactive accounts", () => {
  for (const merchant of ["", "Giant Express", "Shell"]) expect(matchExpenseTemplate(templates, merchant, new Set(["yuu", "citi"]))).toBeUndefined();
  expect(matchExpenseTemplate(templates, "Giant", new Set())).toBeUndefined();
});
