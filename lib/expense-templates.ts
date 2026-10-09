export type ExpenseTemplate = { id: string; merchant: string; account_id: string; category_id: string | null };
export const merchantKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
export function matchExpenseTemplate(templates: ExpenseTemplate[], merchant: string, activeAccountIds: Set<string>): ExpenseTemplate | undefined {
  const key = merchantKey(merchant);
  return key ? templates.find((t) => merchantKey(t.merchant) === key && activeAccountIds.has(t.account_id)) : undefined;
}
