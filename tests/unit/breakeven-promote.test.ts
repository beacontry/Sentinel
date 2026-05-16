/**
 * Tests for maybePromoteBreakeven — the v3 stop-promotion helper that
 * ratchets pos.stopLoss up to entry + buffer once unrealized profit
 * crosses BREAKEVEN_TRIGGER_PCT (currently 2%).
 *
 * Behavior contract:
 *   - Returns false + leaves pos.stopLoss unchanged when profit < 2%
 *   - Returns true + sets pos.stopLoss = entryPrice × 1.001 when
 *     profit crosses 2% AND current stop is below breakeven level
 *   - Idempotent — subsequent calls return false because pos.stopLoss
 *     is already at-or-above breakeven
 *   - Never lowers pos.stopLoss (e.g., if the trail has lifted it
 *     past breakeven, this function leaves it alone)
 *   - Doesn't depend on TrackedPosition — accepts any object with
 *     entryPrice + stopLoss numeric fields
 */

import { describe, it, expect } from "vitest";
import { maybePromoteBreakeven } from "../../src/lib/trading-engine";

describe("maybePromoteBreakeven", () => {
  it("does not promote below the 2% trigger", () => {
    const pos = { entryPrice: 100, stopLoss: 88 }; // 12% disaster stop
    const promoted = maybePromoteBreakeven(pos, 101.5); // +1.5% profit
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(88); // unchanged
  });

  it("does not promote at exactly the boundary minus epsilon", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const promoted = maybePromoteBreakeven(pos, 101.9999);
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(88);
  });

  it("promotes exactly at the 2% threshold", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const promoted = maybePromoteBreakeven(pos, 102.0);
    expect(promoted).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5); // entry × (1 + 0.001)
  });

  it("promotes well past the threshold", () => {
    const pos = { entryPrice: 50, stopLoss: 44 }; // 12% stop
    const promoted = maybePromoteBreakeven(pos, 55); // +10%
    expect(promoted).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(50.05, 5); // 50 × 1.001
  });

  it("is idempotent — second call after promotion returns false", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const first = maybePromoteBreakeven(pos, 103);
    expect(first).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);

    const second = maybePromoteBreakeven(pos, 105);
    expect(second).toBe(false); // already promoted
    expect(pos.stopLoss).toBeCloseTo(100.1, 5); // unchanged
  });

  it("does not lower a trail-promoted stop", () => {
    // Simulate: trail has already lifted stop past breakeven (e.g., to 105)
    const pos = { entryPrice: 100, stopLoss: 105 };
    const promoted = maybePromoteBreakeven(pos, 108);
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(105); // trail wins, breakeven leaves it alone
  });

  it("handles fractional shares + dollar prices precisely", () => {
    const pos = { entryPrice: 1393.91, stopLoss: 1226.64 }; // SNDK-style 12% stop
    // Need +2% to fire: 1393.91 × 1.02 = 1421.7882
    expect(maybePromoteBreakeven(pos, 1421.78)).toBe(false);
    expect(maybePromoteBreakeven(pos, 1421.79)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(1395.30, 2); // entry × 1.001
  });

  it("works structurally — doesn't require full TrackedPosition", () => {
    // Caller can pass anything shaped { entryPrice; stopLoss } — useful
    // for ad-hoc spreadsheets, optimizer harnesses, replay tooling.
    const wrapper: { entryPrice: number; stopLoss: number; extra: string } = {
      entryPrice: 200,
      stopLoss: 176,
      extra: "ignored",
    };
    const promoted = maybePromoteBreakeven(wrapper, 210); // +5%
    expect(promoted).toBe(true);
    expect(wrapper.stopLoss).toBeCloseTo(200.2, 5);
    expect(wrapper.extra).toBe("ignored"); // other fields untouched
  });

  it("handles negative price movement correctly (no false promotion)", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const promoted = maybePromoteBreakeven(pos, 95); // −5%
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(88);
  });

  it("scenario: tactical-smart position that ran up then reverses", () => {
    // The exact failure mode the v3 fix is designed to catch:
    // tactical-smart enters with 12% disaster stop, position runs +3%,
    // gives it all back to -8%. With the old logic the position would
    // ride down to -12% before stop_loss fires (-$12 per share on $100).
    // With breakeven-promote, the stop snaps to entry on the way up
    // and exits flat on the reversal.
    const pos = { entryPrice: 100, stopLoss: 88 };
    maybePromoteBreakeven(pos, 103); // +3% — promotes
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
    // Now price reverses — the engine's exit check at currentPrice
    // <= pos.stopLoss would now fire at ~$100.1 instead of $88.
    // (Actual exit firing is the engine's job; this test just
    // confirms the stop is at the right level.)
  });
});
