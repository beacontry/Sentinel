/**
 * Small-cap gapper scanner — pure planner.
 *
 * Builds the dynamic universe the momentum engine mode trades. Lives
 * alongside the existing screener (src/lib/screener.ts) but is intentionally
 * a sibling, not a modification: different universe, different filters,
 * different data provider, different cadence. See § "Screener (Shared)"
 * and § "Small-cap momentum direction" in CLAUDE.md for the architectural
 * boundary.
 *
 * Provider injection: every fetcher is a function parameter, so the planner
 * is unit-testable without network and the live caller wires up Polygon +
 * Finnhub.
 */

import type { PolygonTickerSnapshot } from "@/lib/providers/polygon";
import { getFinnhubApiKey } from "@/lib/system-config";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("gapper-scanner");

// ── Configuration ──────────────────────────────────────────────────

export interface GapperFilters {
  /** Min price in dollars. Below this is sub-penny / OTC junk. */
  minPrice: number;
  /** Max price. Above this isn't a "small cap" in Ross's playbook. */
  maxPrice: number;
  /** Max shares outstanding. < 20M float = squeeze potential. */
  maxFloat: number;
  /** Min gap % from previous close (0.05 = +5%). */
  minGapPct: number;
  /**
   * Min RVOL — today's cumulative volume / previous day's full-session
   * volume. Premarket: 0.3–0.5 is unusual; intraday: 1.5+ confirms the move.
   */
  minRvol: number;
  /** Cap on returned candidates. */
  limit: number;
}

export const DEFAULT_GAPPER_FILTERS: GapperFilters = {
  minPrice: 1,
  maxPrice: 20,
  maxFloat: 20_000_000,
  minGapPct: 0.05,
  minRvol: 0.5,
  limit: 10,
};

// ── Result shape ───────────────────────────────────────────────────

export interface GapperCandidate {
  symbol: string;
  price: number;
  /** (price - prevClose) / prevClose. */
  gapPct: number;
  /** dayVolume / prevDayVolume. */
  rvol: number;
  /** Shares outstanding. null when lookup failed but candidate still passes other gates. */
  float: number | null;
  dayVolume: number;
  prevClose: number;
  /** Composite ranking score. Higher = stronger candidate. */
  score: number;
}

export type SkipReason =
  | "no_snapshot"
  | "invalid_prev_close"
  | "price_out_of_range"
  | "low_gap"
  | "low_rvol"
  | "float_unknown"
  | "high_float";

export interface GapperScanResult {
  candidates: GapperCandidate[];
  examined: number;
  skipped: Record<SkipReason, number>;
}

export interface GapperScanInputs {
  universe: string[];
  fetchSnapshot: (symbol: string) => Promise<PolygonTickerSnapshot | null>;
  fetchFloat: (symbol: string) => Promise<number | null>;
  filters?: Partial<GapperFilters>;
}

// ── Scoring ────────────────────────────────────────────────────────

/**
 * Pure score function — exported for tests + tuning. Rewards big gaps and
 * high RVOL; the log dampening on RVOL keeps a 100× volume reading from
 * dominating a 50% gap.
 */
export function scoreCandidate(gapPct: number, rvol: number): number {
  const rvolTerm = Math.log10(Math.max(rvol, 0.1) + 1); // ~0.04 .. 2 for rvol 0.1..100
  return gapPct * 100 * rvolTerm;
}

// ── Main planner ───────────────────────────────────────────────────

function emptySkips(): Record<SkipReason, number> {
  return {
    no_snapshot: 0,
    invalid_prev_close: 0,
    price_out_of_range: 0,
    low_gap: 0,
    low_rvol: 0,
    float_unknown: 0,
    high_float: 0,
  };
}

export async function scanForGappers(
  inputs: GapperScanInputs
): Promise<GapperScanResult> {
  const filters: GapperFilters = { ...DEFAULT_GAPPER_FILTERS, ...(inputs.filters ?? {}) };
  const skipped = emptySkips();
  const candidates: GapperCandidate[] = [];

  for (const symbol of inputs.universe) {
    const snap = await inputs.fetchSnapshot(symbol);
    if (!snap) {
      skipped.no_snapshot++;
      continue;
    }
    if (!(snap.prevDayClose > 0)) {
      skipped.invalid_prev_close++;
      continue;
    }

    const price = snap.price;
    if (price < filters.minPrice || price > filters.maxPrice) {
      skipped.price_out_of_range++;
      continue;
    }

    const gapPct = snap.changePctFromPrevClose;
    if (gapPct < filters.minGapPct) {
      skipped.low_gap++;
      continue;
    }

    // RVOL = today / yesterday's full session. Guard divide-by-zero: a
    // zero prevDayVolume is malformed data, not a green light.
    const rvol =
      snap.prevDayVolume > 0 ? snap.dayVolume / snap.prevDayVolume : 0;
    if (rvol < filters.minRvol) {
      skipped.low_rvol++;
      continue;
    }

    const float = await inputs.fetchFloat(symbol);
    if (float === null) {
      skipped.float_unknown++;
      continue;
    }
    if (float > filters.maxFloat) {
      skipped.high_float++;
      continue;
    }

    candidates.push({
      symbol,
      price,
      gapPct,
      rvol,
      float,
      dayVolume: snap.dayVolume,
      prevClose: snap.prevDayClose,
      score: scoreCandidate(gapPct, rvol),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, filters.limit);

  log.info(
    { examined: inputs.universe.length, kept: top.length, skipped },
    "gapper scan complete"
  );

  return { candidates: top, examined: inputs.universe.length, skipped };
}

// ── Default float fetcher (Finnhub) ────────────────────────────────

interface FinnhubProfile {
  shareOutstanding?: number; // in millions
}

const floatCache = new Map<string, { value: number | null; expiry: number }>();
const FLOAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Float rarely changes — cache aggressively. Returns null on missing key,
 * network failure, or symbols Finnhub doesn't cover. Scanner treats `null`
 * as "skip this symbol" rather than "assume small float."
 */
export async function fetchFloatFromFinnhub(
  symbol: string
): Promise<number | null> {
  const now = Date.now();
  const cached = floatCache.get(symbol);
  if (cached && cached.expiry > now) return cached.value;

  const apiKey = await getFinnhubApiKey();
  if (!apiKey) {
    floatCache.set(symbol, { value: null, expiry: now + FLOAT_CACHE_TTL_MS });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
        symbol
      )}&token=${encodeURIComponent(apiKey)}`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      floatCache.set(symbol, { value: null, expiry: now + FLOAT_CACHE_TTL_MS });
      return null;
    }
    const data = (await res.json()) as FinnhubProfile;
    const shareMillions = data.shareOutstanding;
    if (typeof shareMillions !== "number" || !(shareMillions > 0)) {
      floatCache.set(symbol, { value: null, expiry: now + FLOAT_CACHE_TTL_MS });
      return null;
    }
    const value = Math.round(shareMillions * 1_000_000);
    floatCache.set(symbol, { value, expiry: now + FLOAT_CACHE_TTL_MS });
    return value;
  } catch {
    floatCache.set(symbol, { value: null, expiry: now + FLOAT_CACHE_TTL_MS });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Exposed for tests to ensure a cold cache. */
export function clearFloatCache(): void {
  floatCache.clear();
}
