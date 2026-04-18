import { TRADER_PUSH_CONFIG } from "./config";

/**
 * Push signals and watchlist updates to the IBKR Trading Agent.
 * Fire-and-forget -- failures are logged but never block the caller.
 */

export function isTraderPushConfigured(): boolean {
  return !!TRADER_PUSH_CONFIG.url && !!TRADER_PUSH_CONFIG.secret;
}

async function pushToTrader(path: string, method: string, payload: Record<string, unknown>): Promise<void> {
  if (!isTraderPushConfigured()) return;

  const url = `${TRADER_PUSH_CONFIG.url.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (res.status >= 400) {
      console.error("Trader push error:", path, res.status);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Trader push failed:", path, message);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Push a strong signal to the trader for potential execution.
 * Only pushes STRONG_BUY/STRONG_SELL with confidence >= threshold.
 */
export function pushSignalToTrader(
  symbol: string,
  signal: string,
  confidence: number,
  price: number
): void {
  if (!isTraderPushConfigured()) return;

  // Only push strong signals above confidence threshold
  const isStrong = signal === "STRONG_BUY" || signal === "STRONG_SELL";
  if (!isStrong || confidence < TRADER_PUSH_CONFIG.minConfidence) return;

  pushToTrader("/api/signals", "POST", {
    symbol,
    signal,
    confidence,
    price,
    source: "sentinel",
  }).catch(() => {});
}

/** Add a symbol to the trader's live watchlist. */
export function pushWatchlistAdd(symbol: string): void {
  pushToTrader("/api/watchlist", "POST", { symbol }).catch(() => {});
}

/** Remove a symbol from the trader's live watchlist. */
export function pushWatchlistRemove(symbol: string): void {
  pushToTrader("/api/watchlist", "DELETE", { symbol }).catch(() => {});
}

/** Flatten a single position or all positions. */
export async function pushFlatten(symbol?: string): Promise<{ status: string }> {
  const payload: Record<string, unknown> = {};
  if (symbol) payload.symbol = symbol;

  const url = `${TRADER_PUSH_CONFIG.url.replace(/\/$/, "")}/api/flatten`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Halt or resume trading. */
export async function pushHalt(action: "halt" | "resume"): Promise<{ status: string }> {
  const url = `${TRADER_PUSH_CONFIG.url.replace(/\/$/, "")}/api/halt`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify({ action }),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Update risk parameters at runtime. */
export async function pushRiskUpdate(params: Record<string, number | boolean>): Promise<{ status: string; params?: Record<string, unknown> }> {
  const url = `${TRADER_PUSH_CONFIG.url.replace(/\/$/, "")}/api/risk`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sentinel-secret": TRADER_PUSH_CONFIG.secret,
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
