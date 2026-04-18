import type { Bar } from "@/types";
import { MARKET_DATA_CONFIG } from "./config";

export type BarResolution = "5m" | "1d";

interface MarketDataProvider {
  fetchBars(symbol: string, days: number, resolution?: BarResolution): Promise<Bar[]>;
  fetchQuote(symbol: string): Promise<{ price: number; volume: number } | null>;
}

/** Yahoo Finance provider — no API key required. */
class YahooProvider implements MarketDataProvider {
  async fetchBars(symbol: string, days: number, resolution: BarResolution = "5m"): Promise<Bar[]> {
    const period2 = Math.floor(Date.now() / 1000);
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

  async fetchBars(symbol: string, days: number, resolution: BarResolution = "5m"): Promise<Bar[]> {
    const to = Math.floor(Date.now() / 1000);
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

  async fetchBars(symbol: string, days: number, resolution?: BarResolution): Promise<Bar[]> {
    const start = Date.now();
    try {
      const bars = await this.primary.fetchBars(symbol, days, resolution);
      if (bars.length > 0) return bars;
    } catch {
      // Primary failed, fall through to secondary
    }
    const elapsed = Date.now() - start;
    if (elapsed >= this.totalBudgetMs) {
      return []; // Budget exhausted, skip secondary
    }
    return this.secondary.fetchBars(symbol, days, resolution);
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
