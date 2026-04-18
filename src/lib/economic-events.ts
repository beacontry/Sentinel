import { getFinnhubClient, type FinnhubEarning } from "./finnhub";
import type { EconomicEvent } from "@/types";

// --- Hardcoded Recurring US Events ---

/**
 * Get the Nth weekday of a given month/year.
 * weekday: 0=Sun, 1=Mon, ..., 5=Fri
 * n: 1-based (1st, 2nd, 3rd, etc.)
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  let day = 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7;
  // Clamp to valid day in month
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day > lastDay) day = lastDay;
  return new Date(year, month, day);
}

/**
 * Get the Wednesday of the 3rd full week of a month.
 * A "full week" starts on Monday. The 3rd full week's Wednesday
 * is approximated as the 3rd Wednesday of the month.
 */
function thirdWednesday(year: number, month: number): Date {
  return nthWeekday(year, month, 3, 3); // 3rd Wednesday (weekday=3)
}

/**
 * Get the first Friday of a month.
 */
function firstFriday(year: number, month: number): Date {
  return nthWeekday(year, month, 5, 1);
}

/**
 * Get the 2nd Tuesday of a month (CPI approximation).
 */
function secondTuesday(year: number, month: number): Date {
  return nthWeekday(year, month, 2, 2);
}

/**
 * Get the last Thursday of a month (GDP approximation).
 */
function lastThursday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const day = lastDay.getDay();
  const diff = (day - 4 + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isInRange(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

/**
 * Generate known recurring US economic events within a date range.
 * These are approximations based on typical scheduling patterns.
 */
export function getRecurringEvents(from: Date, to: Date): EconomicEvent[] {
  const events: EconomicEvent[] = [];

  // Determine the range of years/months to iterate
  const startYear = from.getFullYear();
  const endYear = to.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    // FOMC Meetings (8 per year)
    // Approximate months: Jan, Mar, May, Jun, Jul, Sep, Nov, Dec
    const fomcMonths = [0, 2, 4, 5, 6, 8, 10, 11]; // 0-indexed
    for (const month of fomcMonths) {
      const d = thirdWednesday(year, month);
      if (isInRange(d, from, to)) {
        events.push({
          date: formatDate(d),
          time: "14:00",
          event: "FOMC Interest Rate Decision (est.)",
          country: "US",
          importance: "high",
          category: "fomc",
          actual: null,
          forecast: null,
          previous: null,
        });
      }
    }

    // CPI Releases (monthly, ~2nd Tuesday)
    for (let month = 0; month < 12; month++) {
      const d = secondTuesday(year, month);
      if (isInRange(d, from, to)) {
        events.push({
          date: formatDate(d),
          time: "08:30",
          event: "CPI (Consumer Price Index) Release (est.)",
          country: "US",
          importance: "high",
          category: "cpi",
          actual: null,
          forecast: null,
          previous: null,
        });
      }
    }

    // Jobs Report / NFP (monthly, first Friday)
    for (let month = 0; month < 12; month++) {
      const d = firstFriday(year, month);
      if (isInRange(d, from, to)) {
        events.push({
          date: formatDate(d),
          time: "08:30",
          event: "Nonfarm Payrolls (NFP) Report (est.)",
          country: "US",
          importance: "high",
          category: "jobs",
          actual: null,
          forecast: null,
          previous: null,
        });
      }
    }

    // GDP Reports (quarterly, last week of Jan, Apr, Jul, Oct)
    const gdpMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    for (const month of gdpMonths) {
      const d = lastThursday(year, month);
      if (isInRange(d, from, to)) {
        events.push({
          date: formatDate(d),
          time: "08:30",
          event: "GDP Report (est.)",
          country: "US",
          importance: "high",
          category: "gdp",
          actual: null,
          forecast: null,
          previous: null,
        });
      }
    }
  }

  return events;
}

// --- Main Export ---

/**
 * Fetch combined economic calendar: hardcoded recurring events + Finnhub earnings.
 * @param from ISO date string (YYYY-MM-DD)
 * @param to ISO date string (YYYY-MM-DD)
 */
export async function getEconomicCalendar(from: string, to: string): Promise<EconomicEvent[]> {
  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T23:59:59");

  // 1. Get hardcoded recurring events
  const recurring = getRecurringEvents(fromDate, toDate);

  // 2. If Finnhub is configured, fetch earnings and merge
  const client = getFinnhubClient();
  let earningsEvents: EconomicEvent[] = [];

  if (client.isConfigured) {
    try {
      // Fetch earnings in weekly chunks to avoid Finnhub's 1500-result cap
      const chunks: FinnhubEarning[] = [];
      const startMs = fromDate.getTime();
      const endMs = toDate.getTime();
      const weekMs = 7 * 86400000;

      for (let chunkStart = startMs; chunkStart < endMs; chunkStart += weekMs) {
        const chunkEnd = Math.min(chunkStart + weekMs - 86400000, endMs);
        const chunkFrom = new Date(chunkStart).toISOString().slice(0, 10);
        const chunkTo = new Date(chunkEnd).toISOString().slice(0, 10);
        const result = await client.getEarningsCalendar(chunkFrom, chunkTo);
        chunks.push(...(result.earningsCalendar ?? []));
      }

      earningsEvents = chunks.map((e) => {
        let time: string | null = null;
        if (e.hour === "bmo") time = "Pre-market";
        else if (e.hour === "amc") time = "After-close";

        return {
          date: e.date,
          time,
          event: `${e.symbol} Earnings`,
          country: "US",
          importance: "medium" as const,
          category: "earnings" as const,
          actual: e.epsActual !== null ? `EPS: $${e.epsActual}` : null,
          forecast: e.epsEstimate !== null ? `EPS est: $${e.epsEstimate}` : null,
          previous: null,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Economic calendar: earnings fetch failed:", message);
      // Continue with just recurring events
    }
  }

  // 3. Combine and sort by date
  const all = [...recurring, ...earningsEvents];
  all.sort((a, b) => a.date.localeCompare(b.date));

  return all;
}
