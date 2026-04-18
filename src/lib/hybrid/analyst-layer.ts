import type { SignalType } from "@/types";
import { getFinnhubClient } from "../finnhub";

// ─── Types ──────────────────────────────────────────────────────────

export type AnalystConsensus = "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";

export interface AnalystLayer {
  source: "finnhub";
  consensus: AnalystConsensus;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  adjustment: number; // -0.08 to +0.08
  reasons: string[];
}

// ─── Cache ──────────────────────────────────────────────────────────

interface AnalystCacheEntry {
  data: AnalystLayer;
  expiry: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const g = globalThis as typeof globalThis & {
  __analystCache?: Map<string, AnalystCacheEntry>;
};
g.__analystCache ??= new Map();

function getCached(symbol: string): AnalystLayer | null {
  const entry = g.__analystCache!.get(symbol);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    g.__analystCache!.delete(symbol);
    return null;
  }
  return entry.data;
}

function setCache(symbol: string, data: AnalystLayer): void {
  g.__analystCache!.set(symbol, { data, expiry: Date.now() + CACHE_TTL_MS });
  if (g.__analystCache!.size > 200) {
    const now = Date.now();
    for (const [k, v] of g.__analystCache!) {
      if (now > v.expiry) g.__analystCache!.delete(k);
    }
  }
}

// ─── Layer ──────────────────────────────────────────────────────────

/**
 * Analyst consensus layer using Finnhub free-tier analyst recommendations.
 * Boosts or reduces confidence based on alignment with technical signal.
 */
export async function applyAnalystLayer(
  symbol: string,
  baseSignal: SignalType
): Promise<AnalystLayer | null> {
  const cached = getCached(symbol);
  if (cached) {
    // Recalculate adjustment for current signal direction
    return {
      ...cached,
      ...computeAdjustment(cached.consensus, baseSignal),
    };
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) return null;

  try {
    const recommendations = await client.getRecommendations(symbol);

    if (!recommendations || recommendations.length === 0) return null;

    // Use the latest period
    const latest = recommendations[0];
    const buyCount = (latest.strongBuy ?? 0) + (latest.buy ?? 0);
    const holdCount = latest.hold ?? 0;
    const sellCount = (latest.strongSell ?? 0) + (latest.sell ?? 0);
    const total = buyCount + holdCount + sellCount;

    if (total === 0) return null;

    // Determine consensus
    let consensus: AnalystConsensus;
    if (buyCount > sellCount && buyCount > holdCount) {
      consensus = (latest.strongBuy ?? 0) > (latest.buy ?? 0) ? "strong_buy" : "buy";
    } else if (sellCount > buyCount && sellCount > holdCount) {
      consensus = (latest.strongSell ?? 0) > (latest.sell ?? 0) ? "strong_sell" : "sell";
    } else {
      consensus = "hold";
    }

    const result: AnalystLayer = {
      source: "finnhub",
      consensus,
      buyCount,
      holdCount,
      sellCount,
      ...computeAdjustment(consensus, baseSignal),
    };

    setCache(symbol, result);
    return result;
  } catch {
    return null;
  }
}

// ─── Adjustment Calculation ─────────────────────────────────────────

function computeAdjustment(
  consensus: AnalystConsensus,
  baseSignal: SignalType
): { adjustment: number; reasons: string[] } {
  const reasons: string[] = [];
  let adjustment = 0;

  const isBullish = baseSignal === "BUY" || baseSignal === "STRONG_BUY";
  const isBearish = baseSignal === "SELL" || baseSignal === "STRONG_SELL";

  const consensusLabel = consensus.replace("_", " ");

  if (consensus === "strong_buy" || consensus === "buy") {
    if (isBullish) {
      // Aligned: boost confidence
      adjustment = consensus === "strong_buy" ? 0.05 : 0.03;
      reasons.push(`Analyst consensus "${consensusLabel}" confirms bullish signal`);
    } else if (isBearish) {
      // Contradicting: reduce confidence
      adjustment = consensus === "strong_buy" ? -0.05 : -0.03;
      reasons.push(`Analyst consensus "${consensusLabel}" contradicts bearish signal`);
    }
  } else if (consensus === "strong_sell" || consensus === "sell") {
    if (isBearish) {
      // Aligned: boost confidence
      adjustment = consensus === "strong_sell" ? 0.05 : 0.03;
      reasons.push(`Analyst consensus "${consensusLabel}" confirms bearish signal`);
    } else if (isBullish) {
      // Contradicting: reduce confidence
      adjustment = consensus === "strong_sell" ? -0.05 : -0.03;
      reasons.push(`Analyst consensus "${consensusLabel}" contradicts bullish signal`);
    }
  }
  // "hold" consensus: no adjustment

  // Clamp to [-0.08, +0.08]
  adjustment = Math.max(-0.08, Math.min(0.08, adjustment));

  return { adjustment, reasons };
}
