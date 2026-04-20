import type { SignalType, IndicatorSnapshot } from "@/types";
import { getPopularSymbolsBySector } from "./sectors";
import { getMarketDataProvider } from "./market-data";
import { analyzeHybrid } from "./hybrid";
import { SCREENER_CONFIG } from "./config";
import { pushScreenerSignals, isTraderConfigured, type TraderPushResult } from "./trader-client";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("screener");

// Screener always disables AI scoring (too slow for batch scanning)
const SCREENER_HYBRID_OPTIONS = {
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
  scanning: boolean;
  traderPushResults: TraderPushResult[];
}

// ─── Global singleton cache ─────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __screenerCache?: ScreenerCache;
  __screenerScheduler?: ReturnType<typeof setInterval> | null;
  __screenerSchedulerStarted?: boolean;
};
g.__screenerCache ??= { results: [], scannedAt: new Date(0), scanning: false, traderPushResults: [] };

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

function isMarketOpen(): boolean {
  const now = new Date();
  // Convert to ET using Intl
  const etStr = now.toLocaleString("en-US", { timeZone: SCREENER_CONFIG.timezone });
  const et = new Date(etStr);
  const day = et.getDay();
  // Weekends
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  const open = SCREENER_CONFIG.marketOpenHour * 60 + SCREENER_CONFIG.marketOpenMinute;
  const close = SCREENER_CONFIG.marketCloseHour * 60 + SCREENER_CONFIG.marketCloseMinute;
  return minutes >= open && minutes <= close;
}

// ─── Scan engine ────────────────────────────────────────────────────

export async function scanAllSymbols(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;

  // Prevent concurrent scans
  if (cache.scanning) {
    return cache.results;
  }

  cache.scanning = true;

  try {
    const sectorMap = getPopularSymbolsBySector();
    const allSymbols: { symbol: string; sector: string }[] = [];
    for (const [sector, symbols] of Object.entries(sectorMap)) {
      for (const symbol of symbols) {
        allSymbols.push({ symbol, sector });
      }
    }

    const provider = getMarketDataProvider();
    const results: ScreenerResult[] = [];
    const batchSize = SCREENER_CONFIG.batchSize;

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);

      const settled = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          const bars = await provider.fetchBars(symbol, 90, "1d");
          if (bars.length < 2) return null;

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
        }
      }

      // Delay between batches to avoid rate limits (skip after last batch)
      if (i + batchSize < allSymbols.length) {
        await delay(200);
      }
    }

    cache.results = results;
    cache.scannedAt = new Date();

    // Auto-push actionable signals to the trader
    if (isTraderConfigured()) {
      try {
        cache.traderPushResults = await pushScreenerSignals(results);
      } catch {
        cache.traderPushResults = [];
      }
    }

    return results;
  } finally {
    cache.scanning = false;
  }
}

// ─── Intraday scan (5-minute bars) ──────────────────────────────────

export async function scanAllSymbolsIntraday(): Promise<ScreenerResult[]> {
  const cache = g.__screenerCache!;

  if (cache.scanning) {
    return cache.results;
  }

  cache.scanning = true;

  try {
    const sectorMap = getPopularSymbolsBySector();
    const allSymbols: { symbol: string; sector: string }[] = [];
    for (const [sector, symbols] of Object.entries(sectorMap)) {
      for (const symbol of symbols) {
        allSymbols.push({ symbol, sector });
      }
    }

    const provider = getMarketDataProvider();
    const results: ScreenerResult[] = [];
    const batchSize = SCREENER_CONFIG.batchSize;

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);

      const settled = await Promise.allSettled(
        batch.map(async ({ symbol, sector }) => {
          // 2 days of 5-min bars gives ~156 bars — enough for all indicators
          const bars = await provider.fetchBars(symbol, 2, "5m");
          if (bars.length < 20) return null;

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
        }
      }

      if (i + batchSize < allSymbols.length) {
        await delay(200);
      }
    }

    cache.results = results;
    cache.scannedAt = new Date();

    // Auto-push actionable signals to the trader
    if (isTraderConfigured()) {
      try {
        cache.traderPushResults = await pushScreenerSignals(results);
      } catch {
        cache.traderPushResults = [];
      }
    }

    return results;
  } finally {
    cache.scanning = false;
  }
}

// ─── Auto-scan scheduler ───────────────────────────────────────────

export function startScreenerScheduler(): void {
  if (g.__screenerSchedulerStarted) return;
  g.__screenerSchedulerStarted = true;

  log.info("Screener scheduler: starting");

  // Run the scheduler loop every 60 seconds to check what needs to happen
  g.__screenerScheduler = setInterval(async () => {
    const cache = g.__screenerCache!;
    if (cache.scanning) return;

    if (!isMarketOpen()) return;

    const now = new Date();
    const ageMs = now.getTime() - cache.scannedAt.getTime();

    // Check if we need a daily scan (first scan of the day)
    const etStr = now.toLocaleString("en-US", { timeZone: SCREENER_CONFIG.timezone });
    const et = new Date(etStr);
    const scanDateStr = cache.scannedAt.toLocaleDateString("en-US", { timeZone: SCREENER_CONFIG.timezone });
    const todayStr = et.toLocaleDateString("en-US");
    const isNewDay = scanDateStr !== todayStr;
    const justAfterOpen = et.getHours() === SCREENER_CONFIG.marketOpenHour &&
      et.getMinutes() >= SCREENER_CONFIG.marketOpenMinute &&
      et.getMinutes() <= SCREENER_CONFIG.marketOpenMinute + 2;

    if (isNewDay && justAfterOpen) {
      // Daily scan with daily bars at market open
      log.info("Screener scheduler: daily scan at market open");
      try {
        await scanAllSymbols();
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : String(err) }, "Screener scheduler: daily scan failed");
      }
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
