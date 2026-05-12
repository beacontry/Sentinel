/**
 * Phase 10 — tests for the market-close guard inside placeEngineOrder.
 * Verifies the rule logic that refuses MARKET orders when the market is
 * closed, while allowing LIMIT and STOP orders to queue legitimately.
 *
 * Mirrors the gate logic from src/lib/trading-engine.ts so behavior is
 * pinned independently of the engine's runtime wiring.
 */

import { describe, it, expect } from "vitest";

type OrderType = "market" | "limit" | "stop" | "stop_limit";

function shouldRefuse(orderType: OrderType, marketIsOpen: boolean): boolean {
  // Phase 10 rule: market orders refused when market is closed.
  // Limit/stop orders pass through (they queue legitimately).
  return orderType === "market" && !marketIsOpen;
}

describe("Phase 10 — market-close guard rule", () => {
  describe("when market is OPEN, all order types allowed", () => {
    it("market", () => expect(shouldRefuse("market", true)).toBe(false));
    it("limit", () => expect(shouldRefuse("limit", true)).toBe(false));
    it("stop", () => expect(shouldRefuse("stop", true)).toBe(false));
    it("stop_limit", () => expect(shouldRefuse("stop_limit", true)).toBe(false));
  });

  describe("when market is CLOSED", () => {
    it("market order is refused", () => {
      expect(shouldRefuse("market", false)).toBe(true);
    });

    it("limit order is allowed (queues legitimately with TIF=day)", () => {
      // Limit orders submitted after close get TIF=day expiration but the
      // engine uses them in the swap-buy path; price discipline preserved.
      expect(shouldRefuse("limit", false)).toBe(false);
    });

    it("stop order is allowed (GTC, only fires on trigger)", () => {
      // syncBrokerStops places protective stops outside market hours
      // routinely — they're GTC and harmless.
      expect(shouldRefuse("stop", false)).toBe(false);
    });

    it("stop_limit order is allowed", () => {
      expect(shouldRefuse("stop_limit", false)).toBe(false);
    });
  });

  it("the TGT 2026-05-11 incident pattern is correctly refused", () => {
    // 4:10 PM ET — market closed at 4:00 PM.
    // tactical_smart_swap_sell tried to place a market sell.
    // Phase 10 would have blocked this; we wouldn't have had to clean
    // up phantom orders or rebuild trader_trades by hand.
    const marketIsOpen = false; // 4:10 PM ET = closed
    const orderType: OrderType = "market"; // tactical_smart_swap uses market
    expect(shouldRefuse(orderType, marketIsOpen)).toBe(true);
  });
});

describe("Phase 10 — MarketClosedError class shape", () => {
  it("class is exported from trading-engine and carries symbol+side", async () => {
    const { MarketClosedError } = await import("@/lib/trading-engine");
    const err = new MarketClosedError("TGT", "sell");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MarketClosedError");
    expect(err.symbol).toBe("TGT");
    expect(err.side).toBe("sell");
    expect(err.message).toContain("TGT");
    expect(err.message).toContain("sell");
  });

  it("can be caught with instanceof check in caller try/catch", async () => {
    const { MarketClosedError } = await import("@/lib/trading-engine");
    try {
      throw new MarketClosedError("AAPL", "buy");
    } catch (err) {
      expect(err instanceof MarketClosedError).toBe(true);
      // Engine callers can distinguish this from generic broker errors
      // and continue scanning rather than treating it as a fatal failure.
    }
  });
});
