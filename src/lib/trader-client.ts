import type { ScreenerResult } from "./screener";
import { broadcastExternalSignal } from "./trading-engine";

export interface TraderPushResult {
  symbol: string;
  signal: string;
  confidence: number;
  status: "executed" | "rejected" | "error";
  reason?: string;
  tradeId?: number;
}

// Engine is long-only — SELL/STRONG_SELL would just sit unused in the queue.
const ACTIONABLE_SIGNALS = new Set(["STRONG_BUY", "BUY"]);
const MIN_CONFIDENCE = 0.6;

// Cooldown tracking
const g = globalThis as typeof globalThis & {
  __signalsSent?: Map<string, { signal: string; sentAt: number }>;
};
g.__signalsSent ??= new Map();

const SIGNAL_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Returns true if the trading engine integration is available.
 */
export function isTraderConfigured(): boolean {
  return true; // Always available — uses local engine
}

/**
 * Push screener results directly to the local trading engine.
 * Filters for actionable signals with sufficient confidence,
 * deduplicates, and feeds them into the engine's external signal queue.
 */
export async function pushScreenerSignals(
  results: ScreenerResult[]
): Promise<TraderPushResult[]> {
  const actionable = results.filter(
    (r) => ACTIONABLE_SIGNALS.has(r.signal) && r.confidence >= MIN_CONFIDENCE
  );

  if (actionable.length === 0) return [];

  const now = Date.now();
  const pushResults: TraderPushResult[] = [];

  for (const r of actionable) {
    // Dedup: skip if same signal sent recently
    const lastSent = g.__signalsSent!.get(r.symbol);
    if (
      lastSent &&
      lastSent.signal === r.signal &&
      now - lastSent.sentAt < SIGNAL_COOLDOWN_MS
    ) {
      pushResults.push({
        symbol: r.symbol,
        signal: r.signal,
        confidence: r.confidence,
        status: "rejected",
        reason: "cooldown",
      });
      continue;
    }

    const acceptedCount = broadcastExternalSignal({
      symbol: r.symbol,
      signal: r.signal,
      confidence: r.confidence,
      price: r.price,
      source: "screener",
      receivedAt: now,
    });

    if (acceptedCount > 0) {
      g.__signalsSent!.set(r.symbol, { signal: r.signal, sentAt: now });
      pushResults.push({
        symbol: r.symbol,
        signal: r.signal,
        confidence: r.confidence,
        status: "executed",
        reason: `pushed to ${acceptedCount} engine(s)`,
      });
    } else {
      pushResults.push({
        symbol: r.symbol,
        signal: r.signal,
        confidence: r.confidence,
        status: "rejected",
        reason: "no running engines or duplicate",
      });
    }
  }

  // Clean expired cooldowns
  for (const [sym, entry] of g.__signalsSent!) {
    if (now - entry.sentAt >= SIGNAL_COOLDOWN_MS) {
      g.__signalsSent!.delete(sym);
    }
  }

  return pushResults;
}
