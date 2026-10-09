/**
 * Min-spend periods. All dates are Singapore calendar dates as "YYYY-MM-DD"
 * strings, so results never depend on the server's time zone.
 */

export type PeriodKind = "calendar_month" | "statement_cycle";

export interface Period {
  start: string; // inclusive
  end: string; // inclusive
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore has no daylight saving

/** The Singapore calendar date of an instant, e.g. 2026-10-01T17:00Z → "2026-10-02". */
export function toSgtDate(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Date(d.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Shift a (year, month) pair by n months. */
function addMonths(y: number, m: number, n: number): [number, number] {
  const idx = y * 12 + (m - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** Statement day clamped to the month's length (day 31 → 30 Sep, 28/29 Feb). */
function statementDate(y: number, m: number, statementDay: number): number {
  return Math.min(statementDay, daysInMonth(y, m));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return fmt(y, m, d + n);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * The period containing `date`.
 * - calendar_month: 1st to last day of the month.
 * - statement_cycle: the day after last month's statement date to this month's
 *   statement date. With statement day 25: 26 Sep – 25 Oct.
 */
export function periodFor(kind: PeriodKind, date: string, statementDay?: number | null): Period {
  const [y, m, d] = parts(date);

  if (kind === "calendar_month") {
    return { start: fmt(y, m, 1), end: fmt(y, m, daysInMonth(y, m)) };
  }

  if (!statementDay || statementDay < 1 || statementDay > 31) {
    throw new Error("A statement-cycle rule needs the card's statement day (1–31).");
  }

  const thisStmt = statementDate(y, m, statementDay);
  if (d <= thisStmt) {
    const [py, pm] = addMonths(y, m, -1);
    return { start: fmt(py, pm, statementDate(py, pm, statementDay) + 1), end: fmt(y, m, thisStmt) };
  }
  const [ny, nm] = addMonths(y, m, 1);
  return { start: fmt(y, m, thisStmt + 1), end: fmt(ny, nm, statementDate(ny, nm, statementDay)) };
}

export interface Progress {
  period: Period;
  target: number;
  spent: number;
  remaining: number; // 0 once met
  met: boolean;
  daysLeft: number; // including today
  dailyNeeded: number; // remaining / daysLeft, 0 once met
  percent: number; // 0–100, capped
}

/** Progress toward a min-spend target as of `today`. */
export function progress(period: Period, target: number, spent: number, today: string): Progress {
  const remaining = Math.max(0, Math.round((target - spent) * 100) / 100);
  const daysLeft = Math.max(0, daysBetween(today, period.end) + 1);
  const met = remaining === 0;
  return {
    period,
    target,
    spent,
    remaining,
    met,
    daysLeft,
    dailyNeeded: met || daysLeft === 0 ? 0 : Math.ceil((remaining / daysLeft) * 100) / 100,
    percent: target > 0 ? Math.min(100, Math.round((spent / target) * 1000) / 10) : 100,
  };
}
