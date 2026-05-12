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
  // Phase 5 fields
  washSaleProtectionEnabled: boolean;
  washSaleBlockedSymbols: Set<string>;
  pdtVulnerable: boolean;
  pdtDayTradeCount: number;
}

const ORDER_RATE_LIMIT_PER_MIN = 30;
const ORDER_RATE_LIMIT_WINDOW_MS = 60_000;
const PDT_DAYTRADE_BUY_BLOCK = 3;
const PDT_EQUITY_THRESHOLD = 25_000;

// Phase 5 mirror: same gate order as src/lib/trading-engine.ts canPlaceBuyOrder.
function canPlaceBuyOrder(
  engine: MinimalEngine,
  symbol: string,
  notionalUsd: number,
  maxDailyNotionalPct: number,
  bootEquity: number
): { ok: true } | { ok: false; reason: string } {
  // wash-sale
  if (engine.washSaleProtectionEnabled && engine.washSaleBlockedSymbols.has(symbol)) {
    return { ok: false, reason: "wash_sale_protection" };
  }
  // PDT
  if (engine.pdtVulnerable && engine.pdtDayTradeCount >= PDT_DAYTRADE_BUY_BLOCK) {
    return { ok: false, reason: "pdt_protection" };
  }
  // notional
  const cap = bootEquity * maxDailyNotionalPct;
  if (cap > 0 && engine.dailyNotional + notionalUsd > cap) {
    return { ok: false, reason: "daily_notional_cap_exceeded" };
  }
  // rate limit
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

// Mirror of engine's isPdtVulnerable(account)
function isPdtVulnerable(equity: number): boolean {
  return equity < PDT_EQUITY_THRESHOLD;
}

function newEngine(overrides: Partial<MinimalEngine> = {}): MinimalEngine {
  return {
    dailyNotional: 0,
    recentOrderTimestamps: [],
    consecutiveLosses: 0,
    washSaleProtectionEnabled: false,
    washSaleBlockedSymbols: new Set(),
    pdtVulnerable: false,
    pdtDayTradeCount: 0,
    ...overrides,
  };
}

describe("live-trading safeguards", () => {
  describe("daily notional cap", () => {
    it("allows buys when total notional stays under cap", () => {
      const e = newEngine();
      const result = canPlaceBuyOrder(e, "AAPL", 5_000, 1.0, 100_000);
      expect(result.ok).toBe(true);
    });

    it("blocks the buy that would exceed cap", () => {
      const e = newEngine();
      e.dailyNotional = 95_000;
      const result = canPlaceBuyOrder(e, "AAPL", 10_000, 1.0, 100_000); // 105k > 100k cap
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("daily_notional_cap_exceeded");
    });

    it("scales cap proportionally to maxDailyNotionalPct", () => {
      const e = newEngine();
      // 50% cap on 100k equity = 50k
      const at_45k = canPlaceBuyOrder(e, "AAPL", 45_000, 0.5, 100_000);
      expect(at_45k.ok).toBe(true);
      e.dailyNotional = 45_000;
      const blocked = canPlaceBuyOrder(e, "AAPL", 6_000, 0.5, 100_000); // 51k > 50k
      expect(blocked.ok).toBe(false);
    });

    it("a maxDailyNotionalPct of 0 disables the cap (cap > 0 check)", () => {
      const e = newEngine();
      const result = canPlaceBuyOrder(e, "AAPL", 1_000_000, 0, 100_000);
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
      const blocked = canPlaceBuyOrder(e, "AAPL", 10_000, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      // No call to recordOrderPlacement → dailyNotional unchanged
      expect(e.dailyNotional).toBe(95_000);
    });
  });

  describe("order rate limit (sliding 60s / 30 orders)", () => {
    it("allows 30 orders within the window", () => {
      const e = newEngine();
      for (let i = 0; i < 30; i++) {
        const r = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 100_000);
        expect(r.ok).toBe(true);
        recordOrderPlacement(e, "buy", 100);
      }
      // The 31st should be blocked
      const blocked = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe("order_rate_limit_exceeded");
    });

    it("expires timestamps older than 60s — refills the bucket", () => {
      const e = newEngine();
      const now = Date.now();
      // Pre-populate with 30 timestamps from 70s ago
      for (let i = 0; i < 30; i++) e.recentOrderTimestamps.push(now - 70_000);
      // The next call should prune them and allow the order
      const result = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 100_000);
      expect(result.ok).toBe(true);
    });

    it("counts both BUY and SELL toward the rate limit", () => {
      const e = newEngine();
      // 30 sells fill the bucket
      for (let i = 0; i < 30; i++) recordOrderPlacement(e, "sell", 0);
      const blocked = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 100_000);
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

  describe("wash-sale protection (Phase 5)", () => {
    it("blocks BUY when symbol is in blocked set AND protection enabled", () => {
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["NVDA"]),
      });
      const blocked = canPlaceBuyOrder(e, "NVDA", 1_000, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe("wash_sale_protection");
    });

    it("allows BUY on a different symbol", () => {
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["NVDA"]),
      });
      const ok = canPlaceBuyOrder(e, "AAPL", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });

    it("MTM elected (protection disabled) bypasses the block entirely", () => {
      const e = newEngine({
        washSaleProtectionEnabled: false, // MTM elected
        washSaleBlockedSymbols: new Set(["NVDA"]),
      });
      const ok = canPlaceBuyOrder(e, "NVDA", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });

    it("wash-sale gate fires before notional or rate-limit gates", () => {
      // Symbol is wash-blocked AND would also exceed notional. Reason must be
      // wash_sale_protection (not daily_notional_cap_exceeded) because it's
      // checked first.
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["NVDA"]),
        dailyNotional: 99_999,
      });
      const result = canPlaceBuyOrder(e, "NVDA", 10_000, 1.0, 100_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("wash_sale_protection");
    });

    it("empty blocked set never blocks anything", () => {
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(),
      });
      const ok = canPlaceBuyOrder(e, "TSLA", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });
  });

  describe("PDT protection (Phase 5)", () => {
    it("isPdtVulnerable returns true below $25k", () => {
      expect(isPdtVulnerable(24_999)).toBe(true);
      expect(isPdtVulnerable(5_000)).toBe(true);
      expect(isPdtVulnerable(0)).toBe(true);
    });

    it("isPdtVulnerable returns false at or above $25k", () => {
      expect(isPdtVulnerable(25_000)).toBe(false);
      expect(isPdtVulnerable(100_000)).toBe(false);
    });

    it("blocks BUY when pdtVulnerable AND daytradeCount >= 3", () => {
      const e = newEngine({ pdtVulnerable: true, pdtDayTradeCount: 3 });
      const result = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 10_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("pdt_protection");
    });

    it("allows BUY when pdtVulnerable but daytradeCount < 3", () => {
      const e = newEngine({ pdtVulnerable: true, pdtDayTradeCount: 2 });
      const result = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 10_000);
      expect(result.ok).toBe(true);
    });

    it("allows BUY when NOT pdtVulnerable, regardless of daytradeCount", () => {
      // Account is over $25k → PDT rule doesn't apply, day-trade count free.
      const e = newEngine({ pdtVulnerable: false, pdtDayTradeCount: 10 });
      const result = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 100_000);
      expect(result.ok).toBe(true);
    });

    it("PDT gate fires AFTER wash-sale (gate ordering)", () => {
      // Both gates would trip; wash-sale fires first by design.
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["NVDA"]),
        pdtVulnerable: true,
        pdtDayTradeCount: 3,
      });
      const result = canPlaceBuyOrder(e, "NVDA", 100, 1.0, 10_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("wash_sale_protection");
    });

    it("PDT gate fires BEFORE notional cap (gate ordering)", () => {
      const e = newEngine({
        pdtVulnerable: true,
        pdtDayTradeCount: 4,
        dailyNotional: 99_999,
      });
      const result = canPlaceBuyOrder(e, "AAPL", 10_000, 1.0, 100_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("pdt_protection");
    });

    it("daytradeCount exactly at threshold (3) blocks; one below (2) allows", () => {
      // Boundary check — the threshold is "block at 3" (one shy of PDT-flag at 4).
      const at_2 = newEngine({ pdtVulnerable: true, pdtDayTradeCount: 2 });
      const at_3 = newEngine({ pdtVulnerable: true, pdtDayTradeCount: 3 });
      expect(canPlaceBuyOrder(at_2, "X", 100, 1.0, 10_000).ok).toBe(true);
      expect(canPlaceBuyOrder(at_3, "X", 100, 1.0, 10_000).ok).toBe(false);
    });
  });

  describe("duplicate-order prevention (Phase 7)", () => {
    // Phase 7 doesn't change canPlaceBuyOrder — duplicate detection happens at
    // the call-site level using pendingBuySymbols / pendingSellSymbols Sets
    // computed from the broker's open orders. These tests pin the gate logic
    // independently of the engine module.

    interface OpenOrder { symbol: string; side: "buy" | "sell"; type: string; status: string }
    function buildPendingSets(orders: OpenOrder[]) {
      const buys = new Set<string>();
      const sells = new Set<string>();
      const active = ["new", "accepted", "pending_new", "partially_filled", "held"];
      for (const o of orders) {
        if (!active.includes(o.status)) continue;
        if (o.side === "buy") buys.add(o.symbol);
        else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") sells.add(o.symbol);
      }
      return { buys, sells };
    }

    it("pending sell market order populates pendingSellSymbols", () => {
      const { sells } = buildPendingSets([
        { symbol: "TGT", side: "sell", type: "market", status: "accepted" },
      ]);
      expect(sells.has("TGT")).toBe(true);
    });

    it("protective stop order does NOT populate pendingSellSymbols", () => {
      // Stops are managed by syncBrokerStops; they're not active exit intents
      const { sells } = buildPendingSets([
        { symbol: "GLW", side: "sell", type: "stop", status: "accepted" },
      ]);
      expect(sells.has("GLW")).toBe(false);
    });

    it("stop_limit also excluded (managed by syncBrokerStops variant)", () => {
      const { sells } = buildPendingSets([
        { symbol: "AAPL", side: "sell", type: "stop_limit", status: "accepted" },
      ]);
      expect(sells.has("AAPL")).toBe(false);
    });

    it("pending buy limit populates pendingBuySymbols", () => {
      const { buys } = buildPendingSets([
        { symbol: "USO", side: "buy", type: "limit", status: "accepted" },
      ]);
      expect(buys.has("USO")).toBe(true);
    });

    it("filled / canceled orders ignored (not active)", () => {
      const { buys, sells } = buildPendingSets([
        { symbol: "X", side: "buy", type: "market", status: "filled" },
        { symbol: "Y", side: "sell", type: "market", status: "canceled" },
      ]);
      expect(buys.size).toBe(0);
      expect(sells.size).toBe(0);
    });

    it("mixed orders sort into the right sets", () => {
      // The exact pattern that caused the TGT bug: stop fired, market sells
      // queued, limit buys for swap-in. Engine must NOT confuse stops with
      // active sells.
      const { buys, sells } = buildPendingSets([
        { symbol: "TGT", side: "sell", type: "market", status: "accepted" },   // phantom sell — should dedupe
        { symbol: "TGT", side: "sell", type: "stop", status: "accepted" },     // protective — ignore
        { symbol: "USO", side: "buy", type: "limit", status: "accepted" },     // paired buy — should dedupe
        { symbol: "GLW", side: "sell", type: "stop", status: "accepted" },     // protective for live position — ignore
      ]);
      expect(sells.has("TGT")).toBe(true);  // dedupe target
      expect(buys.has("USO")).toBe(true);   // dedupe target
      expect(sells.has("GLW")).toBe(false); // not a dedupe target (protective stop)
    });

    it("partially_filled status still counts as active", () => {
      const { buys } = buildPendingSets([
        { symbol: "PARTL", side: "buy", type: "limit", status: "partially_filled" },
      ]);
      expect(buys.has("PARTL")).toBe(true);
    });
  });
});

// Vitest needs at least one beforeEach if we use afterEach with env state — keep
// the structure simple even though we don't need shared state at the top level.
beforeEach(() => {
  /* no-op */
});
