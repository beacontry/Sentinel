import type { Bar } from "@/types";
import { MARKET_DATA_CONFIG } from "./config";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export type BarResolution = "5m" | "1d";

interface MarketDataProvider {
  fetchBars(symbol: string, days: number, resolution?: BarResolution, endDate?: Date): Promise<Bar[]>;
  fetchQuote(symbol: string): Promise<{ price: number; volume: number } | null>;
}

// ─── Persistent bar cache ──────────────────────────────────────────

const BAR_CACHE_DIR = join(
  process.env.CACHE_DIR ?? (process.env.NODE_ENV === "production" ? "/data/cache" : join(process.cwd(), "data")),
  "bar-cache"
);
const BAR_CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours for daily bars
const BAR_CACHE_5M_MAX_AGE_MS = 10 * 60 * 1000;  // 10 minutes for 5-min bars

let barCacheDirReady = false;
async function ensureBarCacheDir() {
  if (barCacheDirReady) return;
  if (!existsSync(BAR_CACHE_DIR)) await mkdir(BAR_CACHE_DIR, { recursive: true });
  barCacheDirReady = true;
}

function barCacheKey(symbol: string, resolution: string): string {
  return join(BAR_CACHE_DIR, `${symbol.replace(/[^A-Z0-9]/g, "_")}_${resolution}.json`);
}

interface CachedBars { bars: Bar[]; fetchedAt: number; days: number; }

async function getCachedBars(symbol: string, resolution: string, requestedDays: number): Promise<Bar[] | null> {
  try {
    await ensureBarCacheDir();
    const raw = await readFile(barCacheKey(symbol, resolution), "utf-8");
    const cached: CachedBars = JSON.parse(raw);
    const maxAge = resolution === "1d" ? BAR_CACHE_MAX_AGE_MS : BAR_CACHE_5M_MAX_AGE_MS;
    if (Date.now() - cached.fetchedAt > maxAge) return null; // stale
    if (cached.bars.length < 20) return null; // too few
    // Only serve cache if it covers at least as many days as requested
    if ((cached.days ?? 0) < requestedDays) return null;
    return cached.bars;
  } catch { return null; }
}

async function setCachedBars(symbol: string, resolution: string, bars: Bar[], days: number): Promise<void> {
  if (bars.length < 20) return;
  try {
    await ensureBarCacheDir();
    await writeFile(barCacheKey(symbol, resolution), JSON.stringify({ bars, fetchedAt: Date.now(), days }));
  } catch { /* best effort */ }
}

/** Yahoo Finance provider — no API key required. */
class YahooProvider implements MarketDataProvider {
  async fetchBars(symbol: string, days: number, resolution: BarResolution = "5m", endDate?: Date): Promise<Bar[]> {
    // Historical fetches (endDate in the past) bypass the cache so they don't pollute live data
    const isHistorical = endDate != null && (Date.now() - endDate.getTime()) > 24 * 60 * 60 * 1000;
    if (!isHistorical) {
      const cached = await getCachedBars(symbol, resolution, days);
      if (cached) return cached;
    }

    const period2 = endDate ? Math.floor(endDate.getTime() / 1000) : Math.floor(Date.now() / 1000);
    const period1 = period2 - days * 86400;
    const interval = resolution === "1d" ? "1d" : "5m";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Sentinel/1.0" },
      });
      if (!res.ok) {
        throw new Error(`Yahoo Finance error: ${res.status}`);
      }
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return [];

      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0];
      if (!quote) return [];

      const bars: Bar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i];

        // Yahoo returns null for some bars (gaps) — skip them
        if (open == null || high == null || low == null || close == null || volume == null) {
          continue;
        }

        bars.push({
          date: new Date(timestamps[i] * 1000).toISOString(),
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
          volume,
        });
      }

      // Cache to disk for fast restarts — only for live fetches
      if (!isHistorical) {
        await setCachedBars(symbol, resolution, bars, days);
      }

      return bars;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchQuote(
    symbol: string
  ): Promise<{ price: number; volume: number } | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Sentinel/1.0" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      return {
        price: meta.regularMarketPrice ?? 0,
        volume: meta.regularMarketVolume ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Finnhub provider — requires FINNHUB_API_KEY. */
class FinnhubProvider implements MarketDataProvider {
  private readonly apiKey: string;
  private readonly baseUrl = "https://finnhub.io/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchBars(symbol: string, days: number, resolution: BarResolution = "5m", endDate?: Date): Promise<Bar[]> {
    const to = endDate ? Math.floor(endDate.getTime() / 1000) : Math.floor(Date.now() / 1000);
    const from = to - days * 86400;
    const res_param = resolution === "1d" ? "D" : "5";
    const url = `${this.baseUrl}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${res_param}&from=${from}&to=${to}&token=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Finnhub API error: ${res.status}`);
      }
      const data = await res.json();
      if (data.s !== "ok" || !data.c) return [];

      const bars: Bar[] = [];
      for (let i = 0; i < data.c.length; i++) {
        bars.push({
          date: new Date(data.t[i] * 1000).toISOString(),
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v[i],
        });
      }
      return bars;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchQuote(
    symbol: string
  ): Promise<{ price: number; volume: number } | null> {
    const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.c) return null;
      return { price: data.c, volume: data.v ?? 0 };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Fallback chain — tries primary, falls back to secondary on failure.
 *  Total budget prevents cascading timeouts (e.g., 6s + 6s = 12s).
 */
class FallbackProvider implements MarketDataProvider {
  private readonly totalBudgetMs: number;

  constructor(
    private primary: MarketDataProvider,
    private secondary: MarketDataProvider,
    totalBudgetMs = 10000
  ) {
    this.totalBudgetMs = totalBudgetMs;
  }

  async fetchBars(symbol: string, days: number, resolution?: BarResolution, endDate?: Date): Promise<Bar[]> {
    const start = Date.now();
    try {
      const bars = await this.primary.fetchBars(symbol, days, resolution, endDate);
      if (bars.length > 0) return bars;
    } catch {
      // Primary failed, fall through to secondary
    }
    const elapsed = Date.now() - start;
    if (elapsed >= this.totalBudgetMs) {
      return []; // Budget exhausted, skip secondary
    }
    return this.secondary.fetchBars(symbol, days, resolution, endDate);
  }

  async fetchQuote(
    symbol: string
  ): Promise<{ price: number; volume: number } | null> {
    const start = Date.now();
    try {
      const quote = await this.primary.fetchQuote(symbol);
      if (quote) return quote;
    } catch {
      // Primary failed, fall through to secondary
    }
    const elapsed = Date.now() - start;
    if (elapsed >= this.totalBudgetMs) {
      return null; // Budget exhausted, skip secondary
    }
    return this.secondary.fetchQuote(symbol);
  }
}

let provider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (provider) return provider;

  const yahoo = new YahooProvider();

  if (MARKET_DATA_CONFIG.finnhubApiKey) {
    const finnhub = new FinnhubProvider(MARKET_DATA_CONFIG.finnhubApiKey);
    // Yahoo primary, Finnhub fallback
    provider = new FallbackProvider(yahoo, finnhub);
  } else {
    // Yahoo only
    provider = yahoo;
  }

  return provider;
}
