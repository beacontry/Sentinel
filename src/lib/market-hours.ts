/**
 * Market hours — single source of truth for US equity market timing.
 *
 * Consolidates what was duplicated across `trading-engine.ts` and
 * `screener.ts`. Adds two things both files were missing:
 *
 *   1. **US trading holidays.** Previously both files checked weekday +
 *      time only — so on Thanksgiving / Christmas / Independence Day
 *      the engine scanned and the screener ran daily-scans, wasting
 *      API quota on stale data. Now isMarketOpen() returns false on
 *      NYSE holidays.
 *
 *   2. **Half-day early closes.** Black Friday, Christmas Eve (when
 *      weekday), July 3 (when July 4 is a weekday other than Monday),
 *      etc. close at 1pm ET. isMarketOpen() honors the early-close
 *      time on those days.
 *
 * All holiday rules computed via algorithms (3rd-Monday-of-January etc.)
 * + Easter from the Computus formula — no hardcoded year tables that
 * silently expire. Tested via tests/unit/market-hours.test.ts.
 */

const NY_TZ = "America/New_York";

const MARKET_OPEN_MIN = 9 * 60 + 30; // 9:30 ET
const MARKET_CLOSE_MIN = 16 * 60; // 4:00 ET
const EARLY_CLOSE_MIN = 13 * 60; // 1:00 ET

// ─── Time-zone helpers ──────────────────────────────────────────────────────

/**
 * Returns "now" as a Date object whose getFullYear / getMonth / getDate /
 * getHours / getMinutes / getDay all return ET-zone values.
 *
 * Implementation: parse `toLocaleString` output in en-US format which
 * `new Date(...)` happens to interpret as local. This works reliably for
 * dates after 1970 in zones with standard offsets. Verified against
 * Intl.DateTimeFormat in the unit tests.
 */
export function getETDate(d: Date = new Date()): Date {
  const etStr = d.toLocaleString("en-US", { timeZone: NY_TZ });
  return new Date(etStr);
}

/** Returns YYYY-MM-DD for the given Date interpreted in ET. */
export function getETDateString(d: Date = new Date()): string {
  const et = getETDate(d);
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const day = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Holiday computation ────────────────────────────────────────────────────

/**
 * Easter Sunday for a given year, via the Anonymous Gregorian algorithm
 * (Computus). Returns a Date with hours/minutes 0. Used for Good Friday
 * (2 days earlier).
 *
 * Verified against NYSE-published dates for 2024-2030.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Nth weekday-of-month, 1-indexed. E.g. nthWeekday(2026, 0, 1, 3) = 3rd Monday of January 2026. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Last weekday-of-month. E.g. last Monday of May. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  // Start at last day of month, walk back to find weekday
  const last = new Date(year, month + 1, 0);
  const offset = (7 + last.getDay() - weekday) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/** Observed date for a fixed-date holiday — Friday if Saturday, Monday if Sunday. */
function observed(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day);
  if (d.getDay() === 6) return new Date(year, month, day - 1); // Sat → Fri
  if (d.getDay() === 0) return new Date(year, month, day + 1); // Sun → Mon
  return d;
}

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * All NYSE/NASDAQ trading holidays for the given calendar year.
 * Computed; no static tables to maintain.
 */
export function getUsMarketHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  return [
    observed(year, 0, 1),                  // New Year's Day (1/1)
    nthWeekday(year, 0, 1, 3),             // MLK Day — 3rd Mon of Jan
    nthWeekday(year, 1, 1, 3),             // Presidents Day — 3rd Mon of Feb
    goodFriday,                            // Good Friday
    lastWeekday(year, 4, 1),               // Memorial Day — last Mon of May
    observed(year, 5, 19),                 // Juneteenth (6/19)
    observed(year, 6, 4),                  // Independence Day (7/4)
    nthWeekday(year, 8, 1, 1),             // Labor Day — 1st Mon of Sep
    nthWeekday(year, 10, 4, 4),            // Thanksgiving — 4th Thu of Nov
    observed(year, 11, 25),                // Christmas Day (12/25)
  ];
}

/** Returns true if the given Date falls on a US trading holiday. */
export function isMarketHoliday(d: Date = new Date()): boolean {
  const et = getETDate(d);
  const holidays = getUsMarketHolidays(et.getFullYear());
  return holidays.some((h) => sameDate(h, et));
}

/**
 * Returns true if the given Date is a half-day (1pm ET close). NYSE
 * half-days:
 *   - Day after Thanksgiving (Black Friday) — every year
 *   - July 3 — when July 4 falls on Tue/Wed/Thu/Fri
 *   - December 24 — when it's a weekday and not Christmas-observed
 *
 * NYSE has never closed early when July 4 / Christmas falls on
 * Monday (the prior-Friday early-close pattern doesn't apply).
 */
export function isEarlyCloseDay(d: Date = new Date()): boolean {
  const et = getETDate(d);
  const year = et.getFullYear();
  const month = et.getMonth();
  const day = et.getDate();

  // Black Friday — day after Thanksgiving
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const blackFriday = new Date(year, 10, thanksgiving.getDate() + 1);
  if (sameDate(blackFriday, et)) return true;

  // July 3 — when July 4 is Tue-Fri
  if (month === 6 && day === 3) {
    const july4 = new Date(year, 6, 4).getDay();
    if (july4 >= 2 && july4 <= 5) return true;
  }

  // Christmas Eve (Dec 24) — when it's a weekday and Dec 25 isn't
  // shifted onto a Monday observed-holiday (which would itself be the
  // 24th, not an early close).
  if (month === 11 && day === 24) {
    const dow = et.getDay();
    if (dow >= 1 && dow <= 5) {
      // Don't fire if Dec 24 IS the observed Christmas (Christmas on Sat → observed Fri 24th)
      const xmasObserved = observed(year, 11, 25);
      if (!sameDate(xmasObserved, et)) return true;
    }
  }

  return false;
}

/** Returns the close time in ET-minutes-since-midnight for the given date. */
export function getMarketCloseMinutes(d: Date = new Date()): number {
  return isEarlyCloseDay(d) ? EARLY_CLOSE_MIN : MARKET_CLOSE_MIN;
}

// ─── Public predicates ─────────────────────────────────────────────────────

/**
 * True when the US equity market is currently open for regular-session
 * trading. Accounts for weekends, holidays, and early-close days.
 */
export function isMarketOpen(d: Date = new Date()): boolean {
  const et = getETDate(d);
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  if (isMarketHoliday(d)) return false;

  const minutes = et.getHours() * 60 + et.getMinutes();
  const close = getMarketCloseMinutes(d);
  return minutes >= MARKET_OPEN_MIN && minutes < close;
}

/**
 * Returns ms until the next regular-session open (9:30 ET). Returns 0
 * if the market is currently open. Walks past weekends AND holidays —
 * so on Christmas Eve (half-day, closes at 1pm), this returns ms until
 * Dec 26 9:30 (skipping Christmas Day).
 */
export function msUntilMarketOpen(d: Date = new Date()): number {
  if (isMarketOpen(d)) return 0;

  const et = getETDate(d);
  const target = new Date(et);
  target.setHours(9, 30, 0, 0);

  // If today, before open, and today IS a trading day → today 9:30
  const todayIsTradingDay =
    et.getDay() >= 1 &&
    et.getDay() <= 5 &&
    !isMarketHoliday(d);
  const beforeOpen = et.getHours() * 60 + et.getMinutes() < MARKET_OPEN_MIN;
  if (todayIsTradingDay && beforeOpen) {
    return Math.max(0, target.getTime() - et.getTime());
  }

  // Otherwise walk forward day-by-day until we hit a trading day
  for (let i = 1; i <= 14; i++) {
    target.setDate(target.getDate() + 1);
    const probe = new Date(target);
    const isTradingDay =
      probe.getDay() >= 1 &&
      probe.getDay() <= 5 &&
      !isMarketHoliday(probe);
    if (isTradingDay) {
      return Math.max(0, target.getTime() - et.getTime());
    }
  }

  // Should never happen — 14 days will always include a trading day.
  // Fall through with a sane value rather than 0 (which would cause
  // the scheduler to immediately retry).
  return 24 * 60 * 60 * 1000;
}

/**
 * Returns ms until the *next* open AFTER the current session ends.
 * Used by the screener's daily-scan re-scheduler: when the daily scan
 * fires at 9:30 ET, we want the NEXT scheduled scan to be at 9:30 the
 * following trading day, not "now" (which msUntilMarketOpen would
 * return when the market is open).
 */
export function msUntilNextMarketOpen(d: Date = new Date()): number {
  if (!isMarketOpen(d)) return msUntilMarketOpen(d);

  // Market is open — find next open AFTER today's close
  const et = getETDate(d);
  const target = new Date(et);
  target.setHours(9, 30, 0, 0);
  target.setDate(target.getDate() + 1);

  for (let i = 0; i < 14; i++) {
    const probe = new Date(target);
    const isTradingDay =
      probe.getDay() >= 1 &&
      probe.getDay() <= 5 &&
      !isMarketHoliday(probe);
    if (isTradingDay) {
      return Math.max(0, target.getTime() - et.getTime());
    }
    target.setDate(target.getDate() + 1);
  }

  return 24 * 60 * 60 * 1000;
}
