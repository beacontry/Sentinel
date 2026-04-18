import type { SignalType } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────

export interface OptionsFlowLayer {
  source: "yahoo";
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  unusualActivity: boolean;
  adjustment: number; // -0.10 to +0.10
  reasons: string[];
}

// ─── Cache ──────────────────────────────────────────────────────────

interface OptionsCacheEntry {
  data: OptionsFlowLayer;
  expiry: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const g = globalThis as typeof globalThis & {
  __optionsCache?: Map<string, OptionsCacheEntry>;
};
g.__optionsCache ??= new Map();

function getCached(symbol: string): OptionsFlowLayer | null {
  const entry = g.__optionsCache!.get(symbol);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    g.__optionsCache!.delete(symbol);
    return null;
  }
  return entry.data;
}

function setCache(symbol: string, data: OptionsFlowLayer): void {
  g.__optionsCache!.set(symbol, { data, expiry: Date.now() + CACHE_TTL_MS });
  if (g.__optionsCache!.size > 200) {
    const now = Date.now();
    for (const [k, v] of g.__optionsCache!) {
      if (now > v.expiry) g.__optionsCache!.delete(k);
    }
  }
}

// ─── Layer ──────────────────────────────────────────────────────────

/**
 * Options flow layer using FREE Yahoo Finance options data.
 * Fetches the options chain, computes put/call ratio and unusual activity.
 */
export async function applyOptionsFlowLayer(
  symbol: string,
  baseSignal: SignalType
): Promise<OptionsFlowLayer | null> {
  const cached = getCached(symbol);
  if (cached) {
    return { ...cached, ...computeAdjustment(cached.putCallRatio, cached.unusualActivity, baseSignal) };
  }

  try {
    const data = await fetchYahooOptions(symbol);
    if (!data) return null;

    const result: OptionsFlowLayer = {
      source: "yahoo",
      putCallRatio: data.putCallRatio,
      totalCallVolume: data.totalCallVolume,
      totalPutVolume: data.totalPutVolume,
      unusualActivity: data.unusualActivity,
      ...computeAdjustment(data.putCallRatio, data.unusualActivity, baseSignal),
    };

    setCache(symbol, result);
    return result;
  } catch {
    return null;
  }
}

// ─── Yahoo Finance Options ──────────────────────────────────────────

interface YahooOptionsData {
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  unusualActivity: boolean;
}

async function fetchYahooOptions(symbol: string): Promise<YahooOptionsData | null> {
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Sentinel/1.0" },
    });

    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.optionChain?.result?.[0];
    if (!result) return null;

    const options = result.options?.[0];
    if (!options) return null;

    const calls = options.calls ?? [];
    const puts = options.puts ?? [];

    let totalCallVolume = 0;
    let totalPutVolume = 0;
    let totalCallOI = 0;
    let totalPutOI = 0;

    for (const c of calls) {
      totalCallVolume += c.volume ?? 0;
      totalCallOI += c.openInterest ?? 0;
    }
    for (const p of puts) {
      totalPutVolume += p.volume ?? 0;
      totalPutOI += p.openInterest ?? 0;
    }

    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1.0;
    const totalVolume = totalCallVolume + totalPutVolume;
    const totalOI = totalCallOI + totalPutOI;
    const unusualActivity = totalOI > 0 && totalVolume > totalOI * 0.1; // volume > 10% of OI

    return { putCallRatio, totalCallVolume, totalPutVolume, unusualActivity };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Adjustment Calculation ─────────────────────────────────────────

function computeAdjustment(
  putCallRatio: number,
  unusualActivity: boolean,
  baseSignal: SignalType
): { adjustment: number; reasons: string[] } {
  const reasons: string[] = [];
  let adjustment = 0;

  const isBullish = baseSignal === "BUY" || baseSignal === "STRONG_BUY";
  const isBearish = baseSignal === "SELL" || baseSignal === "STRONG_SELL";

  if (putCallRatio < 0.7) {
    // Heavy call buying
    if (isBullish) {
      adjustment = 0.06;
      reasons.push(`Options flow bullish — P/C ratio ${putCallRatio.toFixed(2)} (heavy calls)`);
    } else if (isBearish) {
      adjustment = -0.04;
      reasons.push(`Options flow contradicts bearish signal — P/C ratio ${putCallRatio.toFixed(2)}`);
    }
  } else if (putCallRatio > 1.3) {
    // Heavy put buying
    if (isBearish) {
      adjustment = 0.06;
      reasons.push(`Options flow bearish — P/C ratio ${putCallRatio.toFixed(2)} (heavy puts)`);
    } else if (isBullish) {
      adjustment = -0.04;
      reasons.push(`Options flow contradicts bullish signal — P/C ratio ${putCallRatio.toFixed(2)}`);
    }
  }

  if (unusualActivity) {
    adjustment *= 1.5;
    reasons.push("Unusual options activity detected");
  }

  adjustment = Math.max(-0.10, Math.min(0.10, adjustment));

  return { adjustment, reasons };
}
