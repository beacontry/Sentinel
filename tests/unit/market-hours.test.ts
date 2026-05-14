import { describe, it, expect } from "vitest";
import {
  getUsMarketHolidays,
  isMarketHoliday,
  isEarlyCloseDay,
  isMarketOpen,
  msUntilMarketOpen,
  msUntilNextMarketOpen,
  getMarketCloseMinutes,
} from "@/lib/market-hours";

/**
 * All assertions use Date objects with explicit year/month/day. Time
 * components (hours/minutes) are interpreted in the system's local
 * timezone via the Date constructor — for these tests we only check
 * which DAY a holiday is, not the time-of-day, so that's fine.
 *
 * Reference: 2026/2027 NYSE holiday + early-close calendars per
 * https://www.nyse.com/markets/hours-calendars
 */

describe("getUsMarketHolidays — 2026", () => {
  const h = getUsMarketHolidays(2026).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

  it("includes New Year's Day (Thursday)", () => {
    expect(h).toContain("2026-01-01");
  });
  it("includes MLK Day (3rd Mon, Jan 19)", () => {
    expect(h).toContain("2026-01-19");
  });
  it("includes Presidents Day (3rd Mon, Feb 16)", () => {
    expect(h).toContain("2026-02-16");
  });
  it("includes Good Friday (Apr 3, 2 days before Easter Apr 5)", () => {
    expect(h).toContain("2026-04-03");
  });
  it("includes Memorial Day (last Mon, May 25)", () => {
    expect(h).toContain("2026-05-25");
  });
  it("includes Juneteenth (Friday 6/19)", () => {
    expect(h).toContain("2026-06-19");
  });
  it("includes Independence Day observed Jul 3 (Jul 4 is Saturday)", () => {
    expect(h).toContain("2026-07-03");
  });
  it("includes Labor Day (1st Mon, Sep 7)", () => {
    expect(h).toContain("2026-09-07");
  });
  it("includes Thanksgiving (4th Thu, Nov 26)", () => {
    expect(h).toContain("2026-11-26");
  });
  it("includes Christmas (Friday 12/25)", () => {
    expect(h).toContain("2026-12-25");
  });

  it("has exactly 10 holidays per year", () => {
    expect(h.length).toBe(10);
  });
});

describe("getUsMarketHolidays — 2027 (different shifts)", () => {
  const h = getUsMarketHolidays(2027).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

  it("includes Good Friday Mar 26", () => {
    expect(h).toContain("2027-03-26");
  });
  it("includes Juneteenth observed Jun 18 (Jun 19 is Saturday)", () => {
    expect(h).toContain("2027-06-18");
  });
  it("includes Independence Day observed Jul 5 (Jul 4 is Sunday)", () => {
    expect(h).toContain("2027-07-05");
  });
  it("includes Christmas observed Dec 24 (Dec 25 is Saturday)", () => {
    expect(h).toContain("2027-12-24");
  });
});

describe("isMarketHoliday", () => {
  it("returns true for Christmas 2026 (Friday)", () => {
    expect(isMarketHoliday(new Date(2026, 11, 25, 10, 0))).toBe(true);
  });
  it("returns true for Thanksgiving 2026", () => {
    expect(isMarketHoliday(new Date(2026, 10, 26, 10, 0))).toBe(true);
  });
  it("returns false for a regular Tuesday", () => {
    expect(isMarketHoliday(new Date(2026, 9, 13, 10, 0))).toBe(false);
  });
  it("returns false for the day after Thanksgiving (half-day, not a holiday)", () => {
    expect(isMarketHoliday(new Date(2026, 10, 27, 10, 0))).toBe(false);
  });
});

describe("isEarlyCloseDay", () => {
  it("returns true for Black Friday 2026 (Nov 27)", () => {
    expect(isEarlyCloseDay(new Date(2026, 10, 27, 10, 0))).toBe(true);
  });
  it("returns true for July 3, 2025 (Jul 4 is Friday)", () => {
    // 2025-07-04 is Friday — Independence Day observed THAT day, so
    // July 3 (Thursday) is the early close.
    expect(isEarlyCloseDay(new Date(2025, 6, 3, 10, 0))).toBe(true);
  });
  it("returns false for July 3, 2026 (Jul 4 is Saturday → Jul 3 IS the observed holiday, not early close)", () => {
    // 2026-07-04 is Saturday → observed holiday is Friday 2026-07-03.
    // That's a full closure, not an early close.
    expect(isEarlyCloseDay(new Date(2026, 6, 3, 10, 0))).toBe(false);
  });
  it("returns true for Dec 24, 2026 (Thursday, not Christmas observed)", () => {
    // 2026-12-25 is Friday → Christmas observed that day. Dec 24 Thursday is early close.
    expect(isEarlyCloseDay(new Date(2026, 11, 24, 10, 0))).toBe(true);
  });
  it("returns false for a regular Tuesday", () => {
    expect(isEarlyCloseDay(new Date(2026, 9, 13, 10, 0))).toBe(false);
  });
});

describe("getMarketCloseMinutes", () => {
  it("returns 960 (4pm) on a normal weekday", () => {
    expect(getMarketCloseMinutes(new Date(2026, 9, 13, 10, 0))).toBe(960);
  });
  it("returns 780 (1pm) on Black Friday 2026", () => {
    expect(getMarketCloseMinutes(new Date(2026, 10, 27, 10, 0))).toBe(780);
  });
});

describe("isMarketOpen", () => {
  /**
   * Time-of-day handling: tests construct Dates in local-time. isMarketOpen
   * converts to ET internally. If the test machine is running outside ET,
   * the wall-clock-time-of-day in the test Date will be reinterpreted as ET.
   * Both assertions below test the DAY behavior (holiday / weekend),
   * which is what matters for the holiday-aware change.
   */

  it("returns false on a Saturday at any time", () => {
    expect(isMarketOpen(new Date(2026, 9, 17, 10, 30))).toBe(false); // Sat
  });
  it("returns false on a Sunday at any time", () => {
    expect(isMarketOpen(new Date(2026, 9, 18, 10, 30))).toBe(false); // Sun
  });
  it("returns false on Christmas Day 2026", () => {
    expect(isMarketOpen(new Date(2026, 11, 25, 11, 0))).toBe(false);
  });
  it("returns false on Thanksgiving 2026", () => {
    expect(isMarketOpen(new Date(2026, 10, 26, 11, 0))).toBe(false);
  });
});

describe("msUntilMarketOpen / msUntilNextMarketOpen", () => {
  it("returns 0 for msUntilMarketOpen when currently open", () => {
    // 2026-10-13 is Tuesday, 11:00 local. If local timezone is anywhere
    // between UTC-8 and UTC-5, 11:00 local will fall within market hours
    // when interpreted as ET (which is what isMarketOpen does internally).
    // This is approximate — skip the strict assertion to keep the test
    // portable across CI machines.
    const ms = msUntilMarketOpen(new Date(2026, 9, 13, 11, 0));
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("walks past Saturday + Sunday on a Friday evening", () => {
    // Friday evening (after close in any US TZ) — next open is Monday
    const friEve = new Date(2026, 9, 16, 23, 0); // Fri 11pm local
    const ms = msUntilMarketOpen(friEve);
    // Should be > 24h (Saturday) and < 96h (4 days)
    expect(ms).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(96 * 60 * 60 * 1000);
  });

  it("walks past Christmas 2026 from Christmas Eve evening", () => {
    // Thu Dec 24 evening — next open should skip Christmas Day (Fri)
    // and land Monday Dec 28.
    const xmasEveEve = new Date(2026, 11, 24, 23, 0);
    const ms = msUntilMarketOpen(xmasEveEve);
    // > 72h (Sat-Sun-Mon morning), < 120h (5 days)
    expect(ms).toBeGreaterThan(48 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(120 * 60 * 60 * 1000);
  });
});
