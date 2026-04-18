import { TRADER_PUSH_CONFIG } from "./config";
import type { ScreenerResult } from "./screener";

export interface TraderPushResult {
  symbol: string;
  signal: string;
  confidence: number;
  status: "executed" | "rejected" | "error";
  reason?: string;
  tradeId?: number;
}

const ACTIONABLE_SIGNALS = new Set(["STRONG_BUY", "BUY", "SELL", "STRONG_SELL"]);

// Track symbols we've already added and signals we've already sent
const g = globalThis as typeof globalThis & {
  __watchlistAdded?: Set<string>;
  __signalsSent?: Map<string, { signal: string; sentAt: number }>;
};
g.__watchlistAdded ??= new Set<string>();
g.__signalsSent ??= new Map();

// Don't resend the same signal for a symbol within this window
const SIGNAL_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Returns true if the trader push integration is configured.
 */
export function isTraderConfigured(): boolean {
  return !!(TRADER_PUSH_CONFIG.url && TRADER_PUSH_CONFIG.secret);
}

/**
 * Add a symbol to the trader's live watchlist.
 * Returns true if added or already watched, false on failure.
 */
async function addToWatchlist(symbol: string): Promise<boolean> {
  // Skip if we've already added this symbol this session
  if (g.__watchlistAdded!.has(symbol)) return true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${TRADER_PUSH_CONFIG.url}/api/watchlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify({ symbol }),
      signal: controller.signal,
    });

    if (!res.ok) return false;

    const data = await res.json();
    if (data.status === "added" || data.status === "already_watched") {
      g.__watchlistAdded!.add(symbol);
      if (data.status === "added") {
        console.log(`Trader: added ${symbol} to watchlist`);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Push a single signal to the trader API for execution.
 */
async function pushSignal(
  symbol: string,
  signal: string,
  confidence: number,
  price: number
): Promise<TraderPushResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${TRADER_PUSH_CONFIG.url}/api/signals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify({ symbol, signal, confidence, price }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return {
        symbol,
        signal,
        confidence,
        status: "error",
        reason: data?.reason ?? data?.error ?? `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      symbol,
      signal,
      confidence,
      status: data.status ?? "executed",
      reason: data.reason,
      tradeId: data.trade_id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { symbol, signal, confidence, status: "error", reason: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Filter screener results to actionable signals, auto-add to trader watchlist,
 * then push signals for execution.
 */
export async function pushScreenerSignals(
  results: ScreenerResult[]
): Promise<TraderPushResult[]> {
  if (!isTraderConfigured()) return [];

  const actionable = results.filter(
    (r) =>
      ACTIONABLE_SIGNALS.has(r.signal) &&
      r.confidence >= TRADER_PUSH_CONFIG.minConfidence
  );

  if (actionable.length === 0) return [];

  const now = Date.now();
  const pushResults: TraderPushResult[] = [];

  for (const r of actionable) {
    // Dedup: skip if we already sent the same signal for this symbol recently
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

    // Auto-add to watchlist first
    await addToWatchlist(r.symbol);

    const result = await pushSignal(r.symbol, r.signal, r.confidence, r.price);

    // Track successful sends to prevent duplicates
    if (result.status === "executed") {
      g.__signalsSent!.set(r.symbol, { signal: r.signal, sentAt: now });
    }

    pushResults.push(result);
  }

  // Clean up expired cooldowns
  for (const [sym, entry] of g.__signalsSent!) {
    if (now - entry.sentAt >= SIGNAL_COOLDOWN_MS) {
      g.__signalsSent!.delete(sym);
    }
  }

  return pushResults;
}
