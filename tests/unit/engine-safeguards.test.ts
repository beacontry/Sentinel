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
  // Losing-reentry cooldown (post-2026-06-10 review of admin's bad days)
  losingReentryCooldownEnabled: boolean;
  losingReentryBlockedSymbols: Set<string>;
}

const ORDER_RATE_LIMIT_PER_MIN = 30;
const ORDER_RATE_LIMIT_WINDOW_MS = 60_000;

// Phase 5 mirror: same gate order as src/lib/trading-engine.ts canPlaceBuyOrder.
// Pre-2026-06-04 this mirror also enforced a PDT gate between wash-sale and
// notional; the PDT designation was retired (FINRA Rule 4210 amendments) and
// the gate was removed from the production engine.
function canPlaceBuyOrder(
  engine: MinimalEngine,
  symbol: string,
  notionalUsd: number,
  maxDailyNotionalPct: number,
  bootEquity: number
): { ok: true } | { ok: false; reason: string } {
  // losing-reentry cooldown (runs BEFORE wash-sale; subset window, broader applicability)
  if (engine.losingReentryCooldownEnabled && engine.losingReentryBlockedSymbols.has(symbol)) {
    return { ok: false, reason: "losing_reentry_cooldown" };
  }
  // wash-sale
  if (engine.washSaleProtectionEnabled && engine.washSaleBlockedSymbols.has(symbol)) {
    return { ok: false, reason: "wash_sale_protection" };
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

function newEngine(overrides: Partial<MinimalEngine> = {}): MinimalEngine {
  return {
    dailyNotional: 0,
    recentOrderTimestamps: [],
    consecutiveLosses: 0,
    washSaleProtectionEnabled: false,
    washSaleBlockedSymbols: new Set(),
    losingReentryCooldownEnabled: false,
    losingReentryBlockedSymbols: new Set(),
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

  describe("losing-reentry cooldown (strategy gate, post-2026-06-10 review)", () => {
    // Strategy gate that blocks re-entry on symbols with a losing exit in the
    // last LOSING_REENTRY_WINDOW_DAYS days. Independent of wash-sale /
    // §475(f) — MTM-elected engines still run it. Off in tactical mode.
    //
    // Motivation: admin's 2026-04-23..06-09 history showed COHR re-bought 5
    // times after losing stops (0W/5L, −$1,466 net); GLW (−$897), AKAM (−$520),
    // CIEN (−$387) followed the same pattern. Wash-sale would have caught all
    // of them but was disabled because admin has MTM elected. This gate runs
    // regardless of MTM and closes that leak.

    it("blocks BUY when symbol is in cooldown set AND cooldown enabled", () => {
      const e = newEngine({
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(["COHR"]),
      });
      const blocked = canPlaceBuyOrder(e, "COHR", 1_000, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe("losing_reentry_cooldown");
    });

    it("allows BUY on a different symbol", () => {
      const e = newEngine({
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(["COHR"]),
      });
      const ok = canPlaceBuyOrder(e, "AAPL", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });

    it("disabled cooldown (tactical mode) bypasses the block entirely", () => {
      const e = newEngine({
        losingReentryCooldownEnabled: false, // tactical mode
        losingReentryBlockedSymbols: new Set(["COHR"]),
      });
      const ok = canPlaceBuyOrder(e, "COHR", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });

    it("fires INDEPENDENT of wash-sale — MTM elected (wash-sale OFF) still gets cooldown", () => {
      const e = newEngine({
        // MTM elected → wash-sale disabled
        washSaleProtectionEnabled: false,
        washSaleBlockedSymbols: new Set(),
        // …but cooldown still applies
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(["COHR"]),
      });
      const blocked = canPlaceBuyOrder(e, "COHR", 1_000, 1.0, 100_000);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe("losing_reentry_cooldown");
    });

    it("cooldown fires BEFORE wash-sale (cooldown reason wins when both would block)", () => {
      // Both gates would block. Cooldown is cheaper (smaller window) and we
      // want the more specific reason surfaced.
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["COHR"]),
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(["COHR"]),
      });
      const result = canPlaceBuyOrder(e, "COHR", 1_000, 1.0, 100_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("losing_reentry_cooldown");
    });

    it("cooldown fires BEFORE notional and rate-limit gates", () => {
      const e = newEngine({
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(["COHR"]),
        dailyNotional: 99_999,
      });
      const result = canPlaceBuyOrder(e, "COHR", 10_000, 1.0, 100_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("losing_reentry_cooldown");
    });

    it("empty cooldown set never blocks anything", () => {
      const e = newEngine({
        losingReentryCooldownEnabled: true,
        losingReentryBlockedSymbols: new Set(),
      });
      const ok = canPlaceBuyOrder(e, "TSLA", 1_000, 1.0, 100_000);
      expect(ok.ok).toBe(true);
    });
  });

  describe("PDT protection — retired 2026-06-04 (FINRA Rule 4210)", () => {
    // The preemptive PDT block was removed when FINRA retired the Pattern Day
    // Trader designation. These tests pin the absence of the gate: a sub-$25k
    // engine running its 4th day trade no longer gets blocked by the engine,
    // and the wash-sale → notional → rate-limit gate order has no PDT slot
    // between wash-sale and notional anymore. Reactive handling of Alpaca's
    // legacy 40310100 rejection code is covered in pdt-rejection-detection.test.ts.

    it("BUY is no longer blocked on a sub-$25k engine, regardless of historical day-trade count", () => {
      const e = newEngine();
      const result = canPlaceBuyOrder(e, "AAPL", 100, 1.0, 10_000);
      expect(result.ok).toBe(true);
    });

    it("wash-sale on a sub-$25k engine still blocks (wash-sale outlived PDT)", () => {
      const e = newEngine({
        washSaleProtectionEnabled: true,
        washSaleBlockedSymbols: new Set(["NVDA"]),
      });
      const result = canPlaceBuyOrder(e, "NVDA", 100, 1.0, 10_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("wash_sale_protection");
    });

    it("notional cap fires next after wash-sale (no PDT slot between them anymore)", () => {
      const e = newEngine({ dailyNotional: 99_999 });
      const result = canPlaceBuyOrder(e, "AAPL", 10_000, 1.0, 100_000);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("daily_notional_cap_exceeded");
    });
  });

  describe("mark-to-market drawdown halt (post-2026-06-10 review)", () => {
    // Mirror of enforceUnrealizedLossHalt's threshold logic. The actual helper
    // is in src/lib/trading-engine.ts; this pins the math independently of
    // DB / audit / pushError side effects.
    //
    // Motivation: admin's 2026-06-08 ran −$829 unrealized with no halt because
    // realized was $0; 2026-06-09 then opened with those bleeders on the book
    // and the realized halt finally tripped at −$727 after stops fired into
    // closed losses. The unrealized halt catches the bleed BEFORE it converts
    // to realized losses.
    const UNREALIZED_HALT_MULTIPLIER = 1.5;

    function shouldHaltOnUnrealized(opts: {
      alreadyHalted: boolean;
      equity: number;
      dailyLoss: number;
      totalUnrealizedPnl: number;
      dailyLossPct: number;
    }): boolean {
      if (opts.alreadyHalted) return false;
      if (opts.equity <= 0) return false;
      const realizedThreshold = opts.equity * opts.dailyLossPct;
      const unrealizedThreshold = realizedThreshold * UNREALIZED_HALT_MULTIPLIER;
      const mtmLoss = opts.dailyLoss + opts.totalUnrealizedPnl;
      return mtmLoss <= -unrealizedThreshold;
    }

    it("does NOT trip when realized + unrealized are within the wider threshold", () => {
      // equity 100k × 2% × 1.5 = 3000 threshold; combined −2500 is under
      const result = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -500,
        totalUnrealizedPnl: -2000,
        dailyLossPct: 0.02,
      });
      expect(result).toBe(false);
    });

    it("trips when realized + unrealized exceeds the 1.5× threshold", () => {
      // equity 100k × 2% × 1.5 = 3000 threshold; combined −3100 trips
      const result = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -1000,
        totalUnrealizedPnl: -2100,
        dailyLossPct: 0.02,
      });
      expect(result).toBe(true);
    });

    it("catches the admin 2026-06-08 case: 0 realized, big unrealized bleed", () => {
      // Admin Jun 8: realized 0, unrealized −$829 on what was presumably ~$70k equity
      // With dailyLossPct=0.02, threshold = 70k × 0.02 × 1.5 = $2100 — wouldn't trip
      // at admin's specific equity, but it WOULD on a smaller (more realistic for
      // an active trader) $5k account. We test both shapes.
      const big = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 70_000,
        dailyLoss: 0,
        totalUnrealizedPnl: -829,
        dailyLossPct: 0.02,
      });
      expect(big).toBe(false); // 829 < 2100 threshold

      const small = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 5_000,
        dailyLoss: 0,
        totalUnrealizedPnl: -200,
        dailyLossPct: 0.02,
      });
      expect(small).toBe(true); // 200 > 5000 × 0.02 × 1.5 = 150
    });

    it("realized-only loss must exceed 1.5× threshold to trip (otherwise realized halt handles it)", () => {
      // Realized −$2500 alone on 100k @ 2% would already trip the realized halt
      // (threshold $2000). The unrealized helper additionally trips at $3000.
      // This is intentional separation — realized handles its own threshold first.
      const result = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -2500,
        totalUnrealizedPnl: 0,
        dailyLossPct: 0.02,
      });
      expect(result).toBe(false); // under $3000 — realized halt would catch this separately
    });

    it("does not re-halt an already-halted engine", () => {
      const result = shouldHaltOnUnrealized({
        alreadyHalted: true,
        equity: 100_000,
        dailyLoss: -10_000,
        totalUnrealizedPnl: -10_000,
        dailyLossPct: 0.02,
      });
      expect(result).toBe(false);
    });

    it("equity <= 0 defers the decision (transient broker glitch)", () => {
      const zero = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 0,
        dailyLoss: -5000,
        totalUnrealizedPnl: -5000,
        dailyLossPct: 0.02,
      });
      expect(zero).toBe(false);
    });

    it("scales with dailyLossPct — a tighter 1% profile trips earlier", () => {
      const tight = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -500,
        totalUnrealizedPnl: -1100,
        dailyLossPct: 0.01, // 1% — threshold = 100k × 0.01 × 1.5 = $1500
      });
      expect(tight).toBe(true); // 1600 > 1500

      const loose = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -500,
        totalUnrealizedPnl: -1100,
        dailyLossPct: 0.05, // 5% — threshold = 100k × 0.05 × 1.5 = $7500
      });
      expect(loose).toBe(false);
    });

    it("positive unrealized offsets realized loss (rare but possible)", () => {
      // Realized −$2500, unrealized +$2000 → combined −$500, no halt
      const result = shouldHaltOnUnrealized({
        alreadyHalted: false,
        equity: 100_000,
        dailyLoss: -2500,
        totalUnrealizedPnl: 2000,
        dailyLossPct: 0.02,
      });
      expect(result).toBe(false);
    });
  });

  describe("position-map drift detector (post-2026-06-11 review)", () => {
    // Mirror of detectPositionMapDrift in src/lib/trading-engine.ts. The
    // engine is supposed to keep its in-memory map in lockstep with the
    // broker via syncPositionMapFromBroker at scan top — but a mid-scan
    // broker-side action (stop fired and replaced, manual UI trade, partial
    // fill) can desynchronize them between sync and a downstream BUY
    // decision. Without this guard, the engine would treat the candidate
    // as a fresh entry and BUY MORE, silently doubling exposure.

    function detectPositionMapDrift(
      symbol: string,
      brokerPositions: Array<{ symbol: string; qty: number }>,
      positionMap: Map<string, unknown>,
    ): boolean {
      const brokerQty = brokerPositions.find((p) => p.symbol === symbol)?.qty ?? 0;
      return brokerQty > 0 && !positionMap.has(symbol);
    }

    it("returns false when both sides agree the symbol is not held", () => {
      const r = detectPositionMapDrift("NVDA", [], new Map());
      expect(r).toBe(false);
    });

    it("returns false when both sides agree the symbol IS held", () => {
      const r = detectPositionMapDrift(
        "NVDA",
        [{ symbol: "NVDA", qty: 10 }],
        new Map([["NVDA", {}]])
      );
      expect(r).toBe(false);
    });

    it("returns TRUE when broker holds but map doesn't (drift — block the BUY)", () => {
      const r = detectPositionMapDrift(
        "NVDA",
        [{ symbol: "NVDA", qty: 10 }],
        new Map()
      );
      expect(r).toBe(true);
    });

    it("returns false when map has but broker doesn't (different drift; engine would skip anyway via positionMap check)", () => {
      // This is the OPPOSITE drift — the engine map says we own NVDA, broker
      // says we don't. The drift detector intentionally does NOT trigger
      // here, because the existing positionMap.has() check in BUY paths
      // would already skip the symbol as "already held." Letting it through
      // here would suppress legitimate fresh-entry signals; the next sync
      // reconciles the map and the BUY can fire next scan.
      const r = detectPositionMapDrift("NVDA", [], new Map([["NVDA", {}]]));
      expect(r).toBe(false);
    });

    it("ignores other symbols' holdings", () => {
      const r = detectPositionMapDrift(
        "NVDA",
        [{ symbol: "AAPL", qty: 5 }],
        new Map([["AAPL", {}]])
      );
      expect(r).toBe(false);
    });

    it("treats qty <= 0 broker rows as not held (defensive against malformed data)", () => {
      const r = detectPositionMapDrift(
        "NVDA",
        [{ symbol: "NVDA", qty: 0 }],
        new Map()
      );
      expect(r).toBe(false);
    });
  });

  describe("sticky halted flag in daily PnL upsert (post-2026-06-10 fix)", () => {
    // Mirror of the ON CONFLICT halted SQL: `halted = old_halted OR new_halted`.
    // Pre-fix this was an unconditional overwrite, so a halt fire at 10am
    // (halted=true) followed by a normal scan at 10:15am (engine.halted=false
    // — typically after a process restart) would clobber halted back to false
    // while leaving halt_reason populated. That's exactly admin's 2026-06-04
    // row: halt fired ($-1010 daily loss), then a later scan overwrote
    // halted=false. autoStartIfNeeded reads `halted` to suppress silent
    // resumes after a safeguard trip, so the clobber bypasses the gate.

    function upsertHalted(existing: boolean | null, incoming: boolean): boolean {
      // null existing = INSERT path; just use incoming.
      if (existing === null) return incoming;
      // ON CONFLICT path: OR existing with incoming. Sticky-on for the day.
      return existing || incoming;
    }

    it("INSERT path (no existing row) uses incoming halted value", () => {
      expect(upsertHalted(null, false)).toBe(false);
      expect(upsertHalted(null, true)).toBe(true);
    });

    it("a halt fire (existing=false, incoming=true) sets halted=true", () => {
      expect(upsertHalted(false, true)).toBe(true);
    });

    it("a normal scan after a halt (existing=true, incoming=false) keeps halted=true", () => {
      // This is the bug fix — pre-fix this returned false.
      expect(upsertHalted(true, false)).toBe(true);
    });

    it("two halt fires in the same day (true, true) stay true", () => {
      expect(upsertHalted(true, true)).toBe(true);
    });

    it("normal scan with no halt history (false, false) stays false", () => {
      expect(upsertHalted(false, false)).toBe(false);
    });

    it("startEngine bypass: an explicit UPDATE can clear halted (not via upsert)", () => {
      // startEngine path uses db.update().set({ halted: false }) directly,
      // bypassing the OR. This test pins that the upsert ALONE can't clear —
      // the bypass via explicit UPDATE is the only "user acknowledges halt"
      // path. The test for the actual UPDATE is the absence of OR in
      // startEngine's clear path; if a future change reverts startEngine to
      // use upsertDailyPnl, this test won't catch it but the prod symptom
      // would be "user clicks Start but UI still shows Trading Halted".
      const upsertResult = upsertHalted(true, false);
      expect(upsertResult).toBe(true); // can't clear via upsert
      // The actual clear happens via a different code path (explicit UPDATE).
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

// ─── consecutive_losses halt — cross-day + regime-gated resume (2026-06-12) ──
//
// Two complementary resume paths:
//   #1 cross-day rollover — handled inside maybeClearDailyLossHaltOnDateRollover.
//      Mirror it here (same pattern as other tests in this file).
//   #4 same-day regime gate — handled by shouldRegimeResumeStreakHalt (pure,
//      imported directly from the engine module).
//
// Motivation: admin's 2026-06-09 → 2026-06-11 incident — consecutive_losses
// halt fired Tuesday, sticky-persisted through Wed/Thu, missed the afternoon
// reversal entirely. Both gates close that loop from different directions.

describe("consecutive_losses halt — cross-day rollover clear (#1)", () => {
  // Mirror of maybeClearDailyLossHaltOnDateRollover. Pins the rule that
  // streak halts (daily_loss, consecutive_losses) clear on date rollover
  // while integrity halts (account_mismatch, etc.) persist.

  interface MinimalRolloverEngine {
    dailyLoss: number;
    dailyNotional: number;
    dailyLossDate: string;
    halted: boolean;
    haltReason: string | null;
    haltContext: { reason: string; haltedAt: number } | null;
    consecutiveLosses: number;
    errors: string[];
  }

  function rolloverClear(engine: MinimalRolloverEngine, today: string): void {
    if (engine.dailyLossDate === today) return;
    engine.dailyLoss = 0;
    engine.dailyNotional = 0;
    engine.dailyLossDate = today;
    if (engine.halted && (engine.haltReason === "daily_loss" || engine.haltReason === "consecutive_losses")) {
      engine.halted = false;
      engine.haltReason = null;
      engine.haltContext = null;
      engine.consecutiveLosses = 0;
      engine.errors = engine.errors.filter(
        (e) => !e.startsWith("Daily loss limit hit") && !e.startsWith("Auto-halted: consecutive_losses")
      );
    }
  }

  function freshEngine(overrides: Partial<MinimalRolloverEngine> = {}): MinimalRolloverEngine {
    return {
      dailyLoss: 0,
      dailyNotional: 0,
      dailyLossDate: "2026-06-09",
      halted: false,
      haltReason: null,
      haltContext: null,
      consecutiveLosses: 0,
      errors: [],
      ...overrides,
    };
  }

  it("same-day call is a no-op (idempotent)", () => {
    const e = freshEngine({ dailyLoss: -100, dailyNotional: 5000, dailyLossDate: "2026-06-12" });
    rolloverClear(e, "2026-06-12");
    expect(e.dailyLoss).toBe(-100);
    expect(e.dailyNotional).toBe(5000);
  });

  it("date change resets counters even when not halted", () => {
    const e = freshEngine({ dailyLoss: -100, dailyNotional: 5000 });
    rolloverClear(e, "2026-06-10");
    expect(e.dailyLoss).toBe(0);
    expect(e.dailyNotional).toBe(0);
    expect(e.dailyLossDate).toBe("2026-06-10");
  });

  it("clears a daily_loss halt on rollover (existing behavior)", () => {
    const e = freshEngine({
      halted: true,
      haltReason: "daily_loss",
      haltContext: { reason: "daily_loss", haltedAt: 1_700_000_000_000 },
      errors: ["Daily loss limit hit: $-500.00"],
    });
    rolloverClear(e, "2026-06-10");
    expect(e.halted).toBe(false);
    expect(e.haltReason).toBeNull();
    expect(e.haltContext).toBeNull();
    expect(e.errors).toEqual([]);
  });

  it("clears a consecutive_losses halt on rollover (new behavior — 2026-06-12 fix)", () => {
    const e = freshEngine({
      halted: true,
      haltReason: "consecutive_losses",
      haltContext: { reason: "consecutive_losses", haltedAt: 1_700_000_000_000 },
      consecutiveLosses: 5,
      errors: ["Auto-halted: consecutive_losses"],
    });
    rolloverClear(e, "2026-06-10");
    expect(e.halted).toBe(false);
    expect(e.haltReason).toBeNull();
    expect(e.haltContext).toBeNull();
    expect(e.consecutiveLosses).toBe(0); // critical — else first new-day loser re-trips
    expect(e.errors).toEqual([]);
  });

  it("does NOT clear an integrity halt on rollover (account_mismatch, equity_collapse, etc.)", () => {
    for (const reason of ["account_mismatch", "equity_collapse", "broker_unreachable", "user_emergency_halt"]) {
      const e = freshEngine({
        halted: true,
        haltReason: reason,
        haltContext: { reason, haltedAt: 1_700_000_000_000 },
      });
      rolloverClear(e, "2026-06-10");
      expect(e.halted).toBe(true);
      expect(e.haltReason).toBe(reason);
      expect(e.haltContext).not.toBeNull();
    }
  });

  it("zeros consecutiveLosses on streak-halt clear but leaves it alone for integrity halts", () => {
    // streak halt → zero
    const streak = freshEngine({
      halted: true,
      haltReason: "consecutive_losses",
      haltContext: { reason: "consecutive_losses", haltedAt: 0 },
      consecutiveLosses: 5,
    });
    rolloverClear(streak, "2026-06-10");
    expect(streak.consecutiveLosses).toBe(0);

    // integrity halt → preserved (no early return; counter stays as-is)
    const integrity = freshEngine({
      halted: true,
      haltReason: "equity_collapse",
      haltContext: { reason: "equity_collapse", haltedAt: 0 },
      consecutiveLosses: 5,
    });
    rolloverClear(integrity, "2026-06-10");
    expect(integrity.consecutiveLosses).toBe(5); // still halted → counter not touched
  });
});

describe("consecutive_losses halt — same-day regime gate (#4)", () => {
  // Import the actual pure helper from the engine module.

  const NOW = 1_700_000_000_000; // arbitrary fixed ms timestamp
  const COOLDOWN_MS = 30 * 60 * 1000;
  const DROP_THRESHOLD = 0.015;

  function baseOpts(overrides: Record<string, unknown> = {}) {
    return {
      halted: true,
      haltReason: "consecutive_losses",
      haltedAt: NOW - COOLDOWN_MS - 1, // cool-down just expired
      now: NOW,
      spyOpen: 100,
      spyCurrent: 98, // -2% drop — exceeds threshold
      cooldownMs: COOLDOWN_MS,
      dropThreshold: DROP_THRESHOLD,
      ...overrides,
    };
  }

  it("returns true when all gates pass (canonical regime-driven case)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    expect(shouldRegimeResumeStreakHalt(baseOpts())).toBe(true);
  });

  it("returns false when engine is not halted", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    expect(shouldRegimeResumeStreakHalt(baseOpts({ halted: false }))).toBe(false);
  });

  it("returns false for halts other than consecutive_losses", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    for (const reason of ["daily_loss", "equity_collapse", "account_mismatch", "broker_unreachable", null]) {
      expect(shouldRegimeResumeStreakHalt(baseOpts({ haltReason: reason }))).toBe(false);
    }
  });

  it("returns false when haltedAt is null (no context captured)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    expect(shouldRegimeResumeStreakHalt(baseOpts({ haltedAt: null }))).toBe(false);
  });

  it("returns false inside the cool-down window (prevents instant flap)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    // Halt fired 10 min ago — under the 30-min cool-down
    expect(shouldRegimeResumeStreakHalt(baseOpts({ haltedAt: NOW - 10 * 60 * 1000 }))).toBe(false);
  });

  it("returns true exactly at the cool-down boundary (>=, not >)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    // The implementation gates on `now - haltedAt < cooldownMs`, so >= cooldown passes.
    // At exactly the boundary (now - haltedAt === cooldownMs), we expect true.
    expect(shouldRegimeResumeStreakHalt(baseOpts({ haltedAt: NOW - COOLDOWN_MS }))).toBe(true);
  });

  it("returns false when SPY drop is at or below threshold", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    // Exactly threshold — strict >
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: 100, spyCurrent: 98.5 }))).toBe(false); // -1.5% exactly
    // Below threshold
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: 100, spyCurrent: 99 }))).toBe(false); // -1.0%
  });

  it("returns false on a positive SPY day (drop is negative)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: 100, spyCurrent: 102 }))).toBe(false);
  });

  it("rejects NaN / zero / negative SPY feeds (defensive)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    // A bad feed must NEVER cause an auto-resume — fail closed.
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: 0 }))).toBe(false);
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyCurrent: 0 }))).toBe(false);
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: -100 }))).toBe(false);
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyCurrent: -98 }))).toBe(false);
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyOpen: NaN }))).toBe(false);
    expect(shouldRegimeResumeStreakHalt(baseOpts({ spyCurrent: NaN }))).toBe(false);
  });

  it("composes with threshold tuning (caller can pass custom values)", async () => {
    const { shouldRegimeResumeStreakHalt } = await import("@/lib/trading-engine");
    // Tighter 0.5% threshold trips on a -1% drop that the default 1.5% wouldn't
    const tight = baseOpts({ spyOpen: 100, spyCurrent: 99, dropThreshold: 0.005 });
    expect(shouldRegimeResumeStreakHalt(tight)).toBe(true);
    // Looser 5% threshold doesn't trip on a -2% drop that the default would
    const loose = baseOpts({ dropThreshold: 0.05 });
    expect(shouldRegimeResumeStreakHalt(loose)).toBe(false);
  });

  it("exports the production constants so callers can reference them", async () => {
    const { REGIME_RESUME_COOLDOWN_MS, REGIME_RESUME_DROP_THRESHOLD } = await import("@/lib/trading-engine");
    expect(REGIME_RESUME_COOLDOWN_MS).toBe(30 * 60 * 1000);
    expect(REGIME_RESUME_DROP_THRESHOLD).toBe(0.015);
  });
});

describe("sector-exposure cap (canPlaceBuyOrder gate)", () => {
  // Mirror of the sector-cap block in canPlaceBuyOrder (kept in lockstep).
  // Pins the contract independently: the gate is disabled at pct=0, sums
  // only same-sector existing market value, adds the new notional, and
  // blocks when the post-buy sector fraction exceeds the cap.
  //
  // Regression intent: the cap was silently inert on the tactical-smart
  // path (it never received a sectorExposureContext) until the 2026-06
  // wiring fix. These cases pin the math the wired path now exercises.

  function sectorGateBlocks(args: {
    maxSectorExposurePct: number;
    equity: number;
    newNotional: number;
    newSector: string;
    // existing positions: [sector, marketValue]
    positions: Array<[string, number]>;
  }): boolean {
    const { maxSectorExposurePct, equity, newNotional, newSector, positions } = args;
    if (!(maxSectorExposurePct > 0) || !(equity > 0)) return false; // disabled
    let sectorMv = 0;
    for (const [sector, mv] of positions) {
      if (sector === newSector) sectorMv += mv;
    }
    const sectorPctAfter = (sectorMv + newNotional) / equity;
    return sectorPctAfter > maxSectorExposurePct;
  }

  it("is disabled when the cap is 0 (default)", () => {
    expect(
      sectorGateBlocks({
        maxSectorExposurePct: 0,
        equity: 100_000,
        newNotional: 90_000,
        newSector: "Technology",
        positions: [["Technology", 50_000]],
      })
    ).toBe(false);
  });

  it("blocks a BUY that pushes the sector over the cap", () => {
    // 40% existing tech + 20% new = 60% > 50% cap → block
    expect(
      sectorGateBlocks({
        maxSectorExposurePct: 0.5,
        equity: 100_000,
        newNotional: 20_000,
        newSector: "Technology",
        positions: [["Technology", 40_000]],
      })
    ).toBe(true);
  });

  it("allows a BUY that stays under the cap", () => {
    // 20% existing tech + 20% new = 40% < 50% cap → allow
    expect(
      sectorGateBlocks({
        maxSectorExposurePct: 0.5,
        equity: 100_000,
        newNotional: 20_000,
        newSector: "Technology",
        positions: [["Technology", 20_000]],
      })
    ).toBe(false);
  });

  it("counts only same-sector positions toward the cap", () => {
    // 45% in Healthcare doesn't count against a Technology buy.
    // Tech after = 0 + 30% = 30% < 50% → allow
    expect(
      sectorGateBlocks({
        maxSectorExposurePct: 0.5,
        equity: 100_000,
        newNotional: 30_000,
        newSector: "Technology",
        positions: [["Healthcare", 45_000]],
      })
    ).toBe(false);
  });

  it("the June-style all-semis book would be blocked at a 40% cap", () => {
    // ~75% already in Technology; any further tech BUY is refused.
    expect(
      sectorGateBlocks({
        maxSectorExposurePct: 0.4,
        equity: 100_000,
        newNotional: 5_000,
        newSector: "Technology",
        positions: [
          ["Technology", 30_000],
          ["Technology", 25_000],
          ["Technology", 20_000],
        ],
      })
    ).toBe(true);
  });
});

// Vitest needs at least one beforeEach if we use afterEach with env state — keep
// the structure simple even though we don't need shared state at the top level.
beforeEach(() => {
  /* no-op */
});
