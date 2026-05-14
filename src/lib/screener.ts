import type { SignalType, IndicatorSnapshot } from "@/types";
import { getPopularSymbolsBySector } from "./sectors";
import { getMarketDataProvider } from "./market-data";
import { analyzeHybrid } from "./hybrid";
import { SCREENER_CONFIG } from "./config";
import { pushScreenerSignals, isTraderConfigured, type TraderPushResult } from "./trader-client";
import {
  isMarketOpen as isMarketOpenShared,
  msUntilMarketOpen,
  msUntilNextMarketOpen,
} from "./market-hours";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("screener");

// Screener runs pure-technical signals only. Sentiment/options/analyst layers
// each hit external APIs (Finnhub free tier is 60 req/min serialized) which
// pushed full-universe scans to 15–45 min. The trader engine still runs the
// full hybrid pipeline per symbol it considers — so screener-pushed signals
// get re-evaluated with sentiment/options/analyst at trade-decision time.
const SCREENER_HYBRID_OPTIONS = {
  enableSentiment: false,
  enableOptionsFlow: false,
  enableAnalyst: false,
  enableAiScoring: false,
} as const;

// ─── Types ──────────────────────────────────────────────────────────

export interface ScreenerResult {
  symbol: string;
  sector: string;
  signal: SignalType;
  confidence: number;
  price: number;
  volume: number;
  rsi: number | null;
  volumeRatio: number | undefined;
  atr: number | null;
  indicators: IndicatorSnapshot;
}

export interface ScreenerFilter {
  field: "signal" | "rsi_14" | "confidence" | "price" | "volumeRatio" | "sector" | "atr_14";
  operator: "gt" | "lt" | "eq" | "gte" | "lte" | "in";
  value: number | string | string[];
}

export interface ScreenerCache {
  results: ScreenerResult[];
  scannedAt: Date;
  /** Phase 3 — when the current scan started. Null while idle. UI uses
   * this to render "scanning, started X ago" instead of "last scanned X
   * ago" which was misleading during a 30+ minute scan. */
  scanStartedAt: Date | null;
  scanning: boolean;
  scanInFlight: Promise<ScreenerResult[]> | null;
  traderPushResults: TraderPushResult[];
}

// ─── Global singleton cache ─────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __screenerCache?: ScreenerCache;
  __screenerScheduler?: ReturnType<typeof setInterval> | null;
  __screenerSchedulerStarted?: boolean;
  /** Precise setTimeout scheduled for the next market-open daily scan.
   * Lives alongside the 60s polling interval (which handles intraday
   * refreshes + recovery). */
  __screenerDailyTimeout?: ReturnType<typeof setTimeout> | null;
};
g.__screenerCache ??= { results: [], scannedAt: new Date(0), scanStartedAt: null, scanning: false, scanInFlight: null, traderPushResults: [] };

export function getScreenerCache(): ScreenerCache {
  return g.__screenerCache!;
}

// ─── Helpers ────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFieldValue(result: ScreenerResult, field: ScreenerFilter["field"]): number | string | null | undefined {
  switch (field) {
    case "signal":
      return result.signal;
    case "rsi_14":
      return result.rsi;
    case "confidence":
      return result.confidence;
    case "price":
      return result.price;
    case "volumeRatio":
      return result.volumeRatio;
    case "sector":
      return result.sector;
    case "atr_14":
      return result.atr;
    default:
      return null;
  }
}

function matchesFilter(result: ScreenerResult, filter: ScreenerFilter): boolean {
  const val = getFieldValue(result, filter.field);
  if (val === null || val === undefined) return false;

  const { operator, value } = filter;

  // String-based "in" operator (signal, sector)
  if (operator === "in") {
    if (Array.isArray(value)) {
      return value.includes(String(val));
    }
    return String(val) === String(value);
  }

  // String equality
  if (operator === "eq") {
    if (typeof val === "string" || typeof value === "string") {
      return String(val) === String(value);
    }
    return val === value;
  }

  // Numeric comparisons
  const numVal = typeof val === "number" ? val : parseFloat(String(val));
  const numTarget = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(numVal) || isNaN(numTarget)) return false;

  switch (operator) {
    case "gt":
      return numVal > numTarget;
    case "lt":
      return numVal < numTarget;
    case "gte":
      return numVal >= numTarget;
    case "lte":
      return numVal <= numTarget;
    default:
      return false;
  }
}

// ─── Filter engine ──────────────────────────────────────────────────

export function filterResults(
  results: ScreenerResult[],
  filters: ScreenerFilter[]
): ScreenerResult[] {
  if (filters.length === 0) return results;
  return results.filter((r) => filters.every((f) => matchesFilter(r, f)));
}

// ─── Market hours check ─────────────────────────────────────────────
//
// Delegates to src/lib/market-hours.ts (shared with trading-engine).
// Adds holiday-aware + half-day-close handling that this file was
// missing — previously the scheduler would daily-scan on Thanksgiving
// and Christmas, burning Yahoo / Finnhub quota for stale data.

const isMarketOpen = isMarketOpenShared;

// ─── Scan engine ────────────────────────────────────────────────────

export async function scanAllSymbols(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;

  // Prevent concurrent scans — share the in-flight promise so callers wait for the current scan
  if (cache.scanning && cache.scanInFlight) {
    return cache.scanInFlight;
  }

  cache.scanning = true;
  cache.scanStartedAt = new Date();
  const scanPromise = runScanInternal();
  cache.scanInFlight = scanPromise;
  try {
    return await scanPromise;
  } finally {
    cache.scanning = false;
    cache.scanInFlight = null;
    cache.scanStartedAt = null; // cleared on completion; scannedAt now reflects completion time
  }
}

async function runScanInternal(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;
  const startedAt = Date.now();

  const sectorMap = getPopularSymbolsBySector();
  const allSymbols: { symbol: string; sector: string }[] = [];
  for (const [sector, symbols] of Object.entries(sectorMap)) {
    for (const symbol of symbols) {
      allSymbols.push({ symbol, sector });
    }
  }

  log.info({ universe: allSymbols.length }, "Screener scan starting");

  const provider = getMarketDataProvider();
  const results: ScreenerResult[] = [];
  const batchSize = SCREENER_CONFIG.batchSize;
  let fetchFailures = 0;
  let analyzeFailures = 0;

  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(async ({ symbol, sector }) => {
        const bars = await provider.fetchBars(symbol, 90, "1d");
        if (bars.length < 2) {
          fetchFailures++;
          return null;
        }

        const analysis = await analyzeHybrid(symbol, bars, SCREENER_HYBRID_OPTIONS);
        const result: ScreenerResult = {
          symbol,
          sector,
          signal: analysis.signal,
          confidence: analysis.confidence,
          price: analysis.price,
          volume: analysis.volume,
          rsi: analysis.indicators.rsi_14,
          volumeRatio: analysis.volumeRatio,
          atr: analysis.indicators.atr_14,
          indicators: analysis.indicators,
        };
        return result;
      })
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled" && outcome.value) {
        results.push(outcome.value);
      } else if (outcome.status === "rejected") {
        analyzeFailures++;
      }
    }

    // Delay between batches to avoid rate limits (skip after last batch)
    if (i + batchSize < allSymbols.length) {
      await delay(50);
    }
  }

  cache.results = results;
  cache.scannedAt = new Date();

  log.info(
    {
      universe: allSymbols.length,
      results: results.length,
      fetchFailures,
      analyzeFailures,
      durationMs: Date.now() - startedAt,
    },
    "Screener scan complete"
  );

  // Auto-push actionable signals to the trader
  if (isTraderConfigured()) {
    try {
      cache.traderPushResults = await pushScreenerSignals(results);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "pushScreenerSignals failed");
      cache.traderPushResults = [];
    }
  }

  return results;
}

// ─── Intraday scan (5-minute bars) ──────────────────────────────────

export async function scanAllSymbolsIntraday(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;

  if (cache.scanning && cache.scanInFlight) {
    return cache.scanInFlight;
  }

  cache.scanning = true;
  cache.scanStartedAt = new Date();
  const scanPromise = runIntradayScanInternal();
  cache.scanInFlight = scanPromise;
  try {
    return await scanPromise;
  } finally {
    cache.scanning = false;
    cache.scanInFlight = null;
    cache.scanStartedAt = null;
  }
}

async function runIntradayScanInternal(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;
  const startedAt = Date.now();

  const sectorMap = getPopularSymbolsBySector();
  const allSymbols: { symbol: string; sector: string }[] = [];
  for (const [sector, symbols] of Object.entries(sectorMap)) {
    for (const symbol of symbols) {
      allSymbols.push({ symbol, sector });
    }
  }

  log.info({ universe: allSymbols.length }, "Screener intraday scan starting");

  const provider = getMarketDataProvider();
  const results: ScreenerResult[] = [];
  const batchSize = SCREENER_CONFIG.batchSize;
  let fetchFailures = 0;
  let analyzeFailures = 0;

  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(async ({ symbol, sector }) => {
        // 2 days of 5-min bars gives ~156 bars — enough for all indicators
        const bars = await provider.fetchBars(symbol, 2, "5m");
        if (bars.length < 20) {
          fetchFailures++;
          return null;
        }

        const analysis = await analyzeHybrid(symbol, bars, SCREENER_HYBRID_OPTIONS);
        const result: ScreenerResult = {
          symbol,
          sector,
          signal: analysis.signal,
          confidence: analysis.confidence,
          price: analysis.price,
          volume: analysis.volume,
          rsi: analysis.indicators.rsi_14,
          volumeRatio: analysis.volumeRatio,
          atr: analysis.indicators.atr_14,
          indicators: analysis.indicators,
        };
        return result;
      })
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled" && outcome.value) {
        results.push(outcome.value);
      } else if (outcome.status === "rejected") {
        analyzeFailures++;
      }
    }

    if (i + batchSize < allSymbols.length) {
      await delay(50);
    }
  }

  cache.results = results;
  cache.scannedAt = new Date();

  log.info(
    {
      universe: allSymbols.length,
      results: results.length,
      fetchFailures,
      analyzeFailures,
      durationMs: Date.now() - startedAt,
    },
    "Screener intraday scan complete"
  );

  if (isTraderConfigured()) {
    try {
      cache.traderPushResults = await pushScreenerSignals(results);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "pushScreenerSignals failed");
      cache.traderPushResults = [];
    }
  }

  return results;
}

// ─── Auto-scan scheduler ───────────────────────────────────────────
//
// Two-timer design (2026-05-13 tightening):
//
//   1. **Precise setTimeout** for the next market-open daily scan.
//      Fires AT 9:30 ET (within ms) instead of within a 0-60s window
//      from the old 60s-polling logic. After firing, re-schedules
//      itself for the next trading day's open. Holiday-aware via
//      msUntilNextMarketOpen() — Thanksgiving + Christmas + half-days
//      skip cleanly.
//
//   2. **60s polling** for intraday scans + missed-daily recovery.
//      The setTimeout above handles the happy path; the polling
//      catches edge cases (server started after 9:30, scheduler
//      restarted mid-day, etc.) and also drives the 5-min intraday
//      refresh.

async function runDailyScan(reason: string): Promise<void> {
  log.info({ reason }, "Screener scheduler: daily scan");
  try {
    await scanAllSymbols();
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Screener scheduler: daily scan failed");
  }
}

function scheduleNextDailyScan(): void {
  if (g.__screenerDailyTimeout) clearTimeout(g.__screenerDailyTimeout);

  // msUntilNextMarketOpen returns time until the next 9:30 ET that's
  // a trading day. If market is open right now, returns time until
  // TOMORROW's open (or next trading day's, skipping weekends/holidays).
  // If market is closed, returns time until the next open.
  const ms = msUntilNextMarketOpen();
  const targetTime = new Date(Date.now() + ms);
  log.info(
    { ms, minutes: Math.round(ms / 60_000), targetEt: targetTime.toLocaleString("en-US", { timeZone: "America/New_York" }) },
    "Screener scheduler: next daily scan scheduled"
  );

  g.__screenerDailyTimeout = setTimeout(() => {
    g.__screenerDailyTimeout = null;
    if (!isMarketOpen()) {
      // Safety check — clock skew, holiday-detection mismatch, etc.
      // Re-schedule rather than scan stale data.
      log.warn("Screener scheduler: daily-scan timer fired but market is not open — re-scheduling");
      scheduleNextDailyScan();
      return;
    }
    void runDailyScan("scheduled at market open").finally(() => {
      scheduleNextDailyScan();
    });
  }, ms);
}

export function startScreenerScheduler(): void {
  if (g.__screenerSchedulerStarted) return;
  g.__screenerSchedulerStarted = true;

  log.info("Screener scheduler: starting");

  // 1) Precise setTimeout for the next daily scan at market open.
  //    If the server boots WHILE market is open and we haven't scanned
  //    yet today, the 60s polling below will catch that case on first
  //    tick. Otherwise this timeout fires precisely at 9:30 ET.
  scheduleNextDailyScan();

  // 2) 60s polling for intraday refresh + missed-daily recovery.
  g.__screenerScheduler = setInterval(async () => {
    const cache = g.__screenerCache!;
    if (cache.scanning) return;
    if (!isMarketOpen()) return;

    const now = new Date();
    const ageMs = now.getTime() - cache.scannedAt.getTime();

    // Missed-daily recovery: server started after 9:30 with no scan
    // yet today. The setTimeout couldn't fire because it was scheduled
    // for tomorrow's open. Trigger a daily scan here.
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const et = new Date(etStr);
    const scanDateStr = cache.scannedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" });
    const todayStr = et.toLocaleDateString("en-US");
    if (scanDateStr !== todayStr) {
      log.info("Screener scheduler: missed-daily recovery — no scan yet today");
      await runDailyScan("missed-daily recovery");
      return;
    }

    // Intraday scan every 5 minutes
    if (ageMs >= SCREENER_CONFIG.intradayIntervalMs) {
      log.info("Screener scheduler: intraday scan");
      try {
        await scanAllSymbolsIntraday();
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : String(err) }, "Screener scheduler: intraday scan failed");
      }
    }
  }, 60_000); // Check every 60 seconds
}

export function stopScreenerScheduler(): void {
  if (g.__screenerScheduler) {
    clearInterval(g.__screenerScheduler);
    g.__screenerScheduler = null;
    g.__screenerSchedulerStarted = false;
    log.info("Screener scheduler: stopped");
  }
}
