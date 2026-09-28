import type { Bar } from "@/types";
import type { BarResolution } from "@/lib/market-data";

const BUCKET_MS: Record<BarResolution, number> = {
  "5m": 5 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

/**
 * The time bucket an analyze signal belongs to: the timestamp of the last bar
 * it was computed from. GET /api/analyze/[symbol] stores it as signals.bar_time
 * and a unique index on (symbol, timeframe, bar_time) turns a repeat view of
 * the same bar into a no-op insert (migration 0052).
 *
 * A last bar whose date does not parse falls back to `now` floored to the
 * resolution, so the row still lands in a bounded bucket rather than escaping
 * the index with a NULL.
 */
export function signalBarTime(
  bars: readonly Bar[],
  resolution: BarResolution,
  now: Date = new Date()
): Date {
  const last = bars[bars.length - 1];
  const parsed = last ? Date.parse(last.date) : NaN;
  if (Number.isFinite(parsed)) return new Date(parsed);
  const size = BUCKET_MS[resolution];
  return new Date(Math.floor(now.getTime() / size) * size);
}
