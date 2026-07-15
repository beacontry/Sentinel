/**
 * Tests for tightenStopOnSellSignal — the 2026-07-14 demotion of analyzer
 * SELL/STRONG_SELL signals from market-exit to stop-tighten.
 *
 * Motivation (all-time prod data): 30 "Sell signal received" market exits
 * produced 1 winner and −$2,717 total while trailing stops on the same book
 * made +$2,814 — the signal lags the move and exited at local bottoms.
 *
 * Contract:
 *   - Raises pos.stopLoss to currentPrice × (1 − dynTrail × factor)
 *   - Monotonic: never lowers an existing stop
 *   - Tightened trail floored at 1% of price (spread-noise guard)
 *   - Rejects non-positive price/factor without mutating
 */

import { describe, it, expect } from "vitest";
import { tightenStopOnSellSignal } from "@/lib/trading-engine";

describe("tightenStopOnSellSignal", () => {
  it("raises the stop to half the dynamic trail on SELL (factor 1/2)", () => {
    const pos = { stopLoss: 88 };
    // price 100, trail 10% → tightened 5% → stop 95
    expect(tightenStopOnSellSignal(pos, 100, 0.10, 1 / 2)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(95, 10);
  });

  it("tightens harder on STRONG_SELL (factor 1/3)", () => {
    const pos = { stopLoss: 88 };
    // price 100, trail 9% → tightened 3% → stop 97
    expect(tightenStopOnSellSignal(pos, 100, 0.09, 1 / 3)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(97, 10);
  });

  it("never lowers an existing higher stop (graduation floor, breakeven ladder)", () => {
    const pos = { stopLoss: 98 };
    // tightened candidate would be 95 — below the promoted stop
    expect(tightenStopOnSellSignal(pos, 100, 0.10, 1 / 2)).toBe(false);
    expect(pos.stopLoss).toBe(98);
  });

  it("floors the tightened trail at 1% so a tiny trail can't ride the spread", () => {
    const pos = { stopLoss: 0 };
    // trail 1.5% × 1/3 = 0.5% → floored to 1% → stop 99
    expect(tightenStopOnSellSignal(pos, 100, 0.015, 1 / 3)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(99, 10);
  });

  it("falls back to the floor when dynTrail is 0 (dormant trail gate)", () => {
    const pos = { stopLoss: 0 };
    expect(tightenStopOnSellSignal(pos, 200, 0, 1 / 2)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(198, 10);
  });

  it("is idempotent — the second identical signal is a no-op", () => {
    const pos = { stopLoss: 50 };
    expect(tightenStopOnSellSignal(pos, 100, 0.08, 1 / 2)).toBe(true);
    const after = pos.stopLoss;
    expect(tightenStopOnSellSignal(pos, 100, 0.08, 1 / 2)).toBe(false);
    expect(pos.stopLoss).toBe(after);
  });

  it("rejects non-positive or NaN price / factor without mutating", () => {
    const pos = { stopLoss: 42 };
    expect(tightenStopOnSellSignal(pos, 0, 0.1, 1 / 2)).toBe(false);
    expect(tightenStopOnSellSignal(pos, -5, 0.1, 1 / 2)).toBe(false);
    expect(tightenStopOnSellSignal(pos, NaN, 0.1, 1 / 2)).toBe(false);
    expect(tightenStopOnSellSignal(pos, 100, 0.1, 0)).toBe(false);
    expect(tightenStopOnSellSignal(pos, 100, 0.1, NaN)).toBe(false);
    expect(pos.stopLoss).toBe(42);
  });

  it("keeps the stop strictly below the current price", () => {
    const pos = { stopLoss: 0 };
    tightenStopOnSellSignal(pos, 100, 0.30, 1 / 2);
    expect(pos.stopLoss).toBeLessThan(100);
    expect(pos.stopLoss).toBeGreaterThan(0);
  });
});
