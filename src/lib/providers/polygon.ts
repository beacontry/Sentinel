/**
 * Polygon.io provider — real-time + historical small-cap data for the
 * momentum engine mode.
 *
 * Why a sibling provider (not bolted onto market-data.ts's YahooProvider):
 *   - Yahoo's 15-min delay is fatal for gapper entries.
 *   - Finnhub's free tier doesn't cover OTC / small-cap symbols.
 *   - 1-minute resolution isn't in the existing BarResolution union and
 *     adding it would force every Yahoo/Finnhub call path to consider a
 *     resolution it can't deliver.
 *
 * Personal-use Developer tier ($79/mo) gives real-time + unlimited API.
 * Free tier returns end-of-day data with 5 calls/min — useful for backtest
 * development but not for the live scanner.
 *
 * All functions degrade gracefully when POLYGON_API_KEY is unset: they log
 * a single warn (not per-call spam — handled by callers if they want to)
 * and return null / empty so the engine doesn't blow up in dev.
 */

import type { Bar } from "@/types";
import { getPolygonApiKey } from "@/lib/system-config";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("polygon-provider");
const BASE_URL = "https://api.polygon.io";
const REQUEST_TIMEOUT_MS = 6000;

// ── Types ──────────────────────────────────────────────────────────

export interface PolygonTickerSnapshot {
  symbol: string;
  /** Last trade price. */
  price: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayVolume: number;
  prevDayClose: number;
  prevDayVolume: number;
  /** (price - prevDayClose) / prevDayClose — what the scanner ranks on. */
  changePctFromPrevClose: number;
  /** Polygon's nanosecond timestamp of the last update. */
  updatedNs: number;
}

export interface PolygonGainerEntry {
  symbol: string;
  price: number;
  changePct: number;
  dayVolume: number;
  prevClose: number;
}

// ── Internal helpers ───────────────────────────────────────────────

async function authedFetch(path: string, signal: AbortSignal): Promise<Response | null> {
  const apiKey = await getPolygonApiKey();
  if (!apiKey) return null;
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}apiKey=${encodeURIComponent(apiKey)}`;
  return fetch(url, { signal });
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface AggBar {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

interface AggregatesResponse {
  results?: AggBar[];
  status?: string;
  resultsCount?: number;
}

interface SnapshotMin {
  o?: number; h?: number; l?: number; c?: number; v?: number; t?: number;
}

interface SnapshotDay {
  o?: number; h?: number; l?: number; c?: number; v?: number;
}

interface SnapshotPrevDay {
  o?: number; h?: number; l?: number; c?: number; v?: number;
}

interface SnapshotTicker {
  ticker?: string;
  day?: SnapshotDay;
  prevDay?: SnapshotPrevDay;
  min?: SnapshotMin;
  lastTrade?: { p?: number; t?: number };
  todaysChange?: number;
  todaysChangePerc?: number;
  updated?: number;
}

interface SingleTickerSnapshotResponse {
  ticker?: SnapshotTicker;
  status?: string;
}

interface GainersResponse {
  tickers?: SnapshotTicker[];
  status?: string;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Fetch 1-minute bars for a symbol between two timestamps.
 *
 * Returns an empty array on no-key, no-data, or upstream failure. Caller
 * checks `bars.length` and decides how to handle it.
 */
export async function fetchMinuteBars(
  symbol: string,
  from: Date,
  to: Date
): Promise<Bar[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${toYmd(
      from
    )}/${toYmd(to)}?adjusted=true&sort=asc&limit=50000`;
    const res = await authedFetch(path, controller.signal);
    if (res === null) {
      log.warn({ symbol }, "POLYGON_API_KEY unset; returning empty bars");
      return [];
    }
    if (!res.ok) {
      log.warn({ symbol, status: res.status }, "Polygon aggregates fetch failed");
      return [];
    }
    const data = (await res.json()) as AggregatesResponse;
    if (!data.results || data.results.length === 0) return [];
    return data.results.map((b): Bar => ({
      date: new Date(b.t).toISOString(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  } catch (err) {
    log.warn(
      { symbol, err: err instanceof Error ? err.message : "unknown" },
      "Polygon minute-bars fetch threw"
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the latest snapshot for a single ticker. Used by the gapper scanner
 * to compute live premarket / intraday change %.
 */
export async function fetchTickerSnapshot(
  symbol: string
): Promise<PolygonTickerSnapshot | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const path = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`;
    const res = await authedFetch(path, controller.signal);
    if (res === null) return null;
    if (!res.ok) {
      log.warn({ symbol, status: res.status }, "Polygon snapshot fetch failed");
      return null;
    }
    const data = (await res.json()) as SingleTickerSnapshotResponse;
    const t = data.ticker;
    if (!t || !t.prevDay || t.prevDay.c == null || t.prevDay.c <= 0) return null;
    const lastPrice =
      t.lastTrade?.p ?? t.min?.c ?? t.day?.c ?? t.prevDay.c;
    const changePct = (lastPrice - t.prevDay.c) / t.prevDay.c;
    return {
      symbol: t.ticker ?? symbol,
      price: lastPrice,
      dayOpen: t.day?.o ?? 0,
      dayHigh: t.day?.h ?? 0,
      dayLow: t.day?.l ?? 0,
      dayVolume: t.day?.v ?? 0,
      prevDayClose: t.prevDay.c,
      prevDayVolume: t.prevDay.v ?? 0,
      changePctFromPrevClose: changePct,
      updatedNs: t.updated ?? 0,
    };
  } catch (err) {
    log.warn(
      { symbol, err: err instanceof Error ? err.message : "unknown" },
      "Polygon snapshot fetch threw"
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the day's top gainers (full-market snapshot, ranked by % change).
 *
 * Polygon caps the response to 20 entries server-side; we honor `limit`
 * client-side as a defensive cap in case that changes.
 */
export async function fetchTopGainers(
  limit = 20
): Promise<PolygonGainerEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const path = `/v2/snapshot/locale/us/markets/stocks/gainers`;
    const res = await authedFetch(path, controller.signal);
    if (res === null) return [];
    if (!res.ok) {
      log.warn({ status: res.status }, "Polygon gainers fetch failed");
      return [];
    }
    const data = (await res.json()) as GainersResponse;
    if (!data.tickers || data.tickers.length === 0) return [];
    const out: PolygonGainerEntry[] = [];
    for (const t of data.tickers.slice(0, limit)) {
      if (!t.ticker || !t.prevDay || !t.prevDay.c || t.prevDay.c <= 0) continue;
      const price = t.lastTrade?.p ?? t.min?.c ?? t.day?.c ?? t.prevDay.c;
      const changePct =
        t.todaysChangePerc != null
          ? t.todaysChangePerc / 100
          : (price - t.prevDay.c) / t.prevDay.c;
      out.push({
        symbol: t.ticker,
        price,
        changePct,
        dayVolume: t.day?.v ?? 0,
        prevClose: t.prevDay.c,
      });
    }
    return out;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "Polygon gainers fetch threw"
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** True when a Polygon key is configured. Caller can short-circuit the scanner. */
export async function isPolygonConfigured(): Promise<boolean> {
  return (await getPolygonApiKey()) !== null;
}
