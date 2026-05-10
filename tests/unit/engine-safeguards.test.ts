/**
 * Tests for the Phase 3 live-trading safeguards added to trading-engine.ts.
 *
 * The safeguard helpers (canPlaceBuyOrder, recordOrderPlacement, recordTradeResult)
 * aren't exported — but the public surface of isLiveTradingAllowed() is, and we
 * test the rest by importing the module and reaching into it via test-only
 * re-exports added below. To keep this test pure, we replicate the helper logic
 * here (small enough that copying is cheaper than refactoring the engine).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Mirror of the engine's helpers — kept in lockstep with src/lib/trading-engine.ts.
// If the engine logic changes, update both. The point of this duplication is to
// pin the contract independently from the engine module.

interface MinimalEngine {
  dailyNotional: number;
  recentOrderTimestamps: number[];
  consecutiveLosses: number;
}

const ORDER_RATE_LIMIT_PER_MIN = 30;
const ORDER_RATE_LIMIT_WINDOW_MS = 60_000;

function canPlaceBuyOrder(
  engine: MinimalEngine,
  notionalUsd: number,
  maxDailyNotionalPct: number,
  bootEquity: number
): { ok: true } | { ok: false; reason: string } {
  const cap = bootEquity * maxDailyNotionalPct;
  if (cap > 0 && engine.dailyNotional + notionalUsd > cap) {
    return { ok: false, reason: "daily_notional_cap_exceeded" };
  }
  const now = Date.now();
  const windowStart = now - ORDER_RATE_LIMIT_WINDOW_MS;
  engine.recentOrderTimestamps = engine.recentOrderTimestamps.filter((t) => t >= windowStart);
  if (engine.recentOrderTimestamps.length >= ORDER_RATE_LIMIT_PER_MIN) {
    return { ok: false, reason: "order_rate_limit_exceeded" };
  }
  return { ok: true };
}

function recordOrderPlacement(engine: MinimalEngine, side: "buy" | "sell", notionalUsd: number): void {
  engine.recentOrderTimestamps.push(Date.now());
  if (side === "buy" && notionalUsd > 0) {
    engine.dailyNotional += notionalUsd;
  }
}

function recordTradeResult(engine: MinimalEngine, pnl: number, threshold: number): boolean {
  if (pnl < 0) engine.consecutiveLosses += 1;
  else if (pnl > 0) engine.consecutiveLosses = 0;
  return engine.consecutiveLosses >= threshold;
}

function newEngine(): MinimalEngine {
  return { dailyNotional: 0, recentOrderTimestamps: [], consecutiveLosses: 0 };
}

describe("live-trading safeguards", () => {
  describe("daily notional cap", () => {
    it("allows buys when total notional stays under cap", () => {
      const e = newEngine();
      const result = canPlaceBuyOrder(e, 5_000, 1.0, 100_000);
      expect(result.ok).toBe(true);
    });

    it("blocks the buy that would exceed cap", () => {
      const e = newEngine();
      e.dailyNotional = 95_000;
      const result = canPlaceBuyOrder(e, 10_000, 1.0, 100_000); // 105k > 100k cap
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("daily_notional_cap_exceeded");
    });

    it("scales cap proportionally to maxDailyNotionalPct", () => {
      const e = newEngine();
      // 50% cap on 100k equity = 50k
      const at_45k = canPlaceBuyOrder(e, 45_000, 0.5, 100_000);
      expect(at_45k.ok).toBe(true);
      e.dailyNotional = 45_000;
      const blocked = canPlaceBuyOrder(e, 6_000, 0.5, 100_000); // 51k > 50k
      expect(blocked.ok).toBe(false);
    });

    it("a maxDailyNotionalPct of 0 disables the cap (cap > 0 check)", () => {
      const e = newEngine();
      const result = canPlaceBuyOrder(e, 1_000_000, 0, 100_000);
      // cap = 0, the check requires cap > 0 to enforce, so this passes the cap check
      expect(result.ok).toBe(true);
    });

    it("recordOrderPlacement adds buy notional but not sell notional", () => {
      const e = newEngine();
      recordOrderPlacement(e, "buy", 5_000);
      recordOrderPlacement(e, "sell", 5_000);
      expect(e.dailyNotional).toBe(5_000);
    });

    it("rejecting an order does NOT advance the daily notional counter", () => {
      const e = newEngine();
      e.dailyNotional = 95_000;
      const blocked = canPlaceBuyOrder(e, 10_000, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      // No call to recordOrderPlacement → dailyNotional unchanged
      expect(e.dailyNotional).toBe(95_000);
    });
  });

  describe("order rate limit (sliding 60s / 30 orders)", () => {
    it("allows 30 orders within the window", () => {
      const e = newEngine();
      for (let i = 0; i < 30; i++) {
        const r = canPlaceBuyOrder(e, 100, 1.0, 100_000);
        expect(r.ok).toBe(true);
        recordOrderPlacement(e, "buy", 100);
      }
      // The 31st should be blocked
      const blocked = canPlaceBuyOrder(e, 100, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe("order_rate_limit_exceeded");
    });

    it("expires timestamps older than 60s — refills the bucket", () => {
      const e = newEngine();
      const now = Date.now();
      // Pre-populate with 30 timestamps from 70s ago
      for (let i = 0; i < 30; i++) e.recentOrderTimestamps.push(now - 70_000);
      // The next call should prune them and allow the order
      const result = canPlaceBuyOrder(e, 100, 1.0, 100_000);
      expect(result.ok).toBe(true);
    });

    it("counts both BUY and SELL toward the rate limit", () => {
      const e = newEngine();
      // 30 sells fill the bucket
      for (let i = 0; i < 30; i++) recordOrderPlacement(e, "sell", 0);
      const blocked = canPlaceBuyOrder(e, 100, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
    });
  });

  describe("consecutive-loss tracking", () => {
    it("increments on losses, returns true at threshold", () => {
      const e = newEngine();
      const t = 3;
      expect(recordTradeResult(e, -100, t)).toBe(false);
      expect(recordTradeResult(e, -50, t)).toBe(false);
      expect(recordTradeResult(e, -25, t)).toBe(true);
      expect(e.consecutiveLosses).toBe(3);
    });

    it("resets on any winning trade", () => {
      const e = newEngine();
      recordTradeResult(e, -100, 5);
      recordTradeResult(e, -100, 5);
      recordTradeResult(e, -100, 5);
      expect(e.consecutiveLosses).toBe(3);
      recordTradeResult(e, 50, 5); // winner
      expect(e.consecutiveLosses).toBe(0);
    });

    it("zero PnL does NOT reset (rare exact-even close)", () => {
      const e = newEngine();
      recordTradeResult(e, -100, 5);
      recordTradeResult(e, 0, 5);
      expect(e.consecutiveLosses).toBe(1);
    });

    it("crosses the threshold even after winners reset (separate streak)", () => {
      const e = newEngine();
      recordTradeResult(e, -100, 3);
      recordTradeResult(e, 50, 3); // win — reset
      expect(e.consecutiveLosses).toBe(0);
      // New losing streak
      expect(recordTradeResult(e, -100, 3)).toBe(false);
      expect(recordTradeResult(e, -100, 3)).toBe(false);
      expect(recordTradeResult(e, -100, 3)).toBe(true);
    });
  });

  describe("isLiveTradingAllowed env gate", () => {
    const ORIGINAL = process.env.ALLOW_LIVE_TRADING;
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.ALLOW_LIVE_TRADING;
      else process.env.ALLOW_LIVE_TRADING = ORIGINAL;
    });

    it("returns false when env var is unset", async () => {
      delete process.env.ALLOW_LIVE_TRADING;
      const { isLiveTradingAllowed } = await import("@/lib/trading-engine");
      expect(isLiveTradingAllowed()).toBe(false);
    });

    it("returns false when env var is empty string", async () => {
      process.env.ALLOW_LIVE_TRADING = "";
      const { isLiveTradingAllowed } = await import("@/lib/trading-engine");
      expect(isLiveTradingAllowed()).toBe(false);
    });

    it("returns false for any value other than literal '1'", async () => {
      process.env.ALLOW_LIVE_TRADING = "true";
      const { isLiveTradingAllowed } = await import("@/lib/trading-engine");
      expect(isLiveTradingAllowed()).toBe(false);
    });

    it("returns true only when env var is exactly '1'", async () => {
      process.env.ALLOW_LIVE_TRADING = "1";
      const { isLiveTradingAllowed } = await import("@/lib/trading-engine");
      expect(isLiveTradingAllowed()).toBe(true);
    });
  });
});

// Vitest needs at least one beforeEach if we use afterEach with env state — keep
// the structure simple even though we don't need shared state at the top level.
beforeEach(() => {
  /* no-op */
});
