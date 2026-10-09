export type CardUse = { category_id: string | null; account_id: string | null; kind: string; status: string };
export type CardSuggestion = { accountId: string; uses: number; total: number; reason?: "last-used" | "usage" };

/** Two calendar months before now in Singapore, clamping month-end dates. */
export function twoMonthsAgo(now: Date): string {
  const sgt = new Date(now.getTime() + 8 * 3600000);
  const day = sgt.getUTCDate();
  sgt.setUTCDate(1);
  sgt.setUTCMonth(sgt.getUTCMonth() - 2);
  const lastDay = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth() + 1, 0)).getUTCDate();
  sgt.setUTCDate(Math.min(day, lastDay));
  return new Date(sgt.getTime() - 8 * 3600000).toISOString();
}

/** Rows are newest transaction first. At least ten purchases require >75% usage;
 * fewer use the last account for that exact sub-category, including older history.
 * Unavailable accounts still count in the denominator but cannot be selected. */
export function categoryCardDefaults(rows: CardUse[], activeAccountIds: Set<string>, lastUses: CardUse[] = rows): Record<string, CardSuggestion> {
  const actual = (row: CardUse) => row.category_id && row.kind === "expense" && ["confirmed", "posted"].includes(row.status);
  const groups = new Map<string, CardUse[]>();
  const latest = new Map<string, CardUse>();
  for (const row of lastUses) {
    if (actual(row) && !latest.has(row.category_id!)) latest.set(row.category_id!, row);
  }
  for (const row of rows) {
    if (!actual(row)) continue;
    const group = groups.get(row.category_id!) ?? [];
    group.push(row);
    groups.set(row.category_id!, group);
  }
  const result: Record<string, CardSuggestion> = {};
  for (const category of new Set([...groups.keys(), ...latest.keys()])) {
    const uses = groups.get(category) ?? [];
    const counts = new Map<string, number>();
    for (const use of uses) if (use.account_id && activeAccountIds.has(use.account_id)) counts.set(use.account_id, (counts.get(use.account_id) ?? 0) + 1);
    if (uses.length < 10) {
      const accountId = latest.get(category)?.account_id;
      if (accountId && activeAccountIds.has(accountId)) result[category] = { accountId, uses: counts.get(accountId) ?? 0, total: uses.length, reason: "last-used" };
    } else {
      for (const [accountId, count] of counts) if (count * 4 > uses.length * 3) result[category] = { accountId, uses: count, total: uses.length, reason: "usage" };
    }
  }
  return result;
}
