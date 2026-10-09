import { describe, expect, it } from "vitest";
import { addDays, daysBetween, periodFor, progress, toSgtDate } from "@/lib/periods";

describe("toSgtDate", () => {
  it("uses Singapore time, not UTC", () => {
    expect(toSgtDate("2026-10-01T17:00:00Z")).toBe("2026-10-02"); // 1am SGT
    expect(toSgtDate("2026-10-01T15:59:59Z")).toBe("2026-10-01"); // 11:59pm SGT
  });
});

describe("calendar month", () => {
  it("covers the whole month", () => {
    expect(periodFor("calendar_month", "2026-10-15")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });
  it("handles February in a leap year", () => {
    expect(periodFor("calendar_month", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("statement cycle", () => {
  it("statement day 25: mid-cycle date", () => {
    expect(periodFor("statement_cycle", "2026-10-10", 25)).toEqual({ start: "2026-09-26", end: "2026-10-25" });
  });
  it("statement day itself closes the cycle", () => {
    expect(periodFor("statement_cycle", "2026-10-25", 25)).toEqual({ start: "2026-09-26", end: "2026-10-25" });
  });
  it("day after statement starts the next cycle", () => {
    expect(periodFor("statement_cycle", "2026-10-26", 25)).toEqual({ start: "2026-10-26", end: "2026-11-25" });
  });
  it("crosses the year end", () => {
    expect(periodFor("statement_cycle", "2026-12-28", 25)).toEqual({ start: "2026-12-26", end: "2027-01-25" });
    expect(periodFor("statement_cycle", "2027-01-03", 25)).toEqual({ start: "2026-12-26", end: "2027-01-25" });
  });
  it("clamps day 31 to short months", () => {
    expect(periodFor("statement_cycle", "2026-09-15", 31)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(periodFor("statement_cycle", "2026-10-01", 31)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(periodFor("statement_cycle", "2027-02-20", 30)).toEqual({ start: "2027-01-31", end: "2027-02-28" });
  });
  it("requires a statement day", () => {
    expect(() => periodFor("statement_cycle", "2026-10-10")).toThrow();
  });
});

describe("progress", () => {
  const period = { start: "2026-10-01", end: "2026-10-31" };

  it("works out the daily run-rate needed", () => {
    const p = progress(period, 600, 420, "2026-10-25");
    expect(p.remaining).toBe(180);
    expect(p.daysLeft).toBe(7);
    expect(p.dailyNeeded).toBe(25.72);
    expect(p.met).toBe(false);
    expect(p.percent).toBe(70);
  });

  it("marks the target met", () => {
    const p = progress(period, 600, 650, "2026-10-20");
    expect(p).toMatchObject({ met: true, remaining: 0, dailyNeeded: 0, percent: 100 });
  });
});

describe("date helpers", () => {
  it("adds days across months", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
  it("counts days between", () => expect(daysBetween("2026-10-25", "2026-10-31")).toBe(6));
});
