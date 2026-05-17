/**
 * Helpers for "what day is it in market time?"
 *
 * Market activity is anchored to America/New_York. Using UTC for cron
 * dedup keys breaks edge cases — e.g. a manual cron-retry script run at
 * 3 AM ET writes a row keyed to "tomorrow" UTC, then the real cron at
 * 9 AM ET re-fires.
 *
 * All dedup keys, daily-report slugs, and digest-article slugs should
 * use these helpers so a cron run from any timezone-aware operator
 * produces the same key for "this trading day."
 */

const ET_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns today in America/New_York as "YYYY-MM-DD". Stable regardless
 * of which timezone the caller is in.
 */
export function getEasternToday(now: Date = new Date()): string {
  return ET_FORMATTER.format(now);
}
