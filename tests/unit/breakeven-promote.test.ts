/**
 * Tests for maybePromoteBreakeven — the v3 tiered stop-promotion
 * helper that ratchets pos.stopLoss up at four profit thresholds
 * (+2%, +5%, +10%, +15%), with per-mode opt-out for engine modes
 * that shouldn't use the full ladder.
 *
 * Tier ladder under "full" mode:
 *   +2%  → entry × 1.001  (breakeven + 0.1% slippage buffer)
 *   +5%  → entry × 1.025  (lock 2.5%)
 *   +10% → entry × 1.05   (lock 5%)
 *   +15% → entry × 1.075  (lock 7.5%)
 *
 * Above +15%, the dynamic trail takes over.
 *
 * "breakeven_only" applies only the +2% tier.
 * "disabled" disables all tiers.
 *
 * Behavior contract:
 *   - Idempotent — once pos.stopLoss is at-or-above the highest
 *     qualifying tier's target, subsequent calls are no-ops
 *   - Never lowers pos.stopLoss (handles trail-promoted positions)
 *   - Walks tiers low-to-high and applies the HIGHEST qualifying tier
 *     (so a position that jumps from +1% to +12% in one scan promotes
 *     directly to the +10% tier, skipping intermediate tiers)
 *   - Structural type on pos — only needs entryPrice + stopLoss
 */

import { describe, it, expect } from "vitest";
import {
  maybePromoteBreakeven,
  getBreakevenLadderMode,
  type BreakevenLadderMode,
} from "../../src/lib/trading-engine";

describe("maybePromoteBreakeven — full ladder", () => {
  it("does not promote below the +2% trigger", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 101.5)).toBe(false); // +1.5%
    expect(pos.stopLoss).toBe(88);
  });

  it("does not promote at +2% minus epsilon", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 101.9999)).toBe(false);
    expect(pos.stopLoss).toBe(88);
  });

  it("promotes to tier-1 (breakeven) at exactly +2%", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 102.0)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5); // entry × 1.001
  });

  it("promotes to tier-2 (lock 2.5%) at +5%", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 105.0)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(102.5, 5); // entry × 1.025
  });

  it("promotes to tier-3 (lock 5%) at +10%", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 110.0)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(105.0, 5); // entry × 1.05
  });

  it("promotes to tier-4 (lock 7.5%) at +15%", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 115.0)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(107.5, 5); // entry × 1.075
  });

  it("caps at tier-4 above +15% (no tier-5 exists)", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 130.0)).toBe(true); // +30%
    expect(pos.stopLoss).toBeCloseTo(107.5, 5); // still tier 4
  });

  it("jumps directly to highest qualifying tier (skip intermediates)", () => {
    // Position gaps up overnight from entry → +12% on first scan after
    // open. Should promote directly to tier-3 (+10% threshold).
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 112.0)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(105.0, 5);
  });
});

describe("maybePromoteBreakeven — idempotency + ratchet-only", () => {
  it("is idempotent — second call at same profit returns false", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 103)).toBe(true); // tier 1 fires
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
    expect(maybePromoteBreakeven(pos, 103)).toBe(false); // already at tier 1 target
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
  });

  it("ratchets up through tiers as profit grows", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    // First scan: +3% → tier 1
    expect(maybePromoteBreakeven(pos, 103)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
    // Later scan: +7% → tier 2
    expect(maybePromoteBreakeven(pos, 107)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(102.5, 5);
    // Later scan: +12% → tier 3
    expect(maybePromoteBreakeven(pos, 112)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(105.0, 5);
    // Later scan: +20% → tier 4
    expect(maybePromoteBreakeven(pos, 120)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(107.5, 5);
    // Even later: +40% → still tier 4 (no tier 5)
    expect(maybePromoteBreakeven(pos, 140)).toBe(false);
    expect(pos.stopLoss).toBeCloseTo(107.5, 5);
  });

  it("does not lower a trail-promoted stop", () => {
    // Trail has already lifted stop past tier-2's target
    const pos = { entryPrice: 100, stopLoss: 110 };
    expect(maybePromoteBreakeven(pos, 108)).toBe(false); // +8% → tier 2 (102.5) is below 110
    expect(pos.stopLoss).toBe(110);
  });

  it("promotes when trail-promoted stop is below qualifying tier", () => {
    // Trail at e.g. entry × 1.01 (slight ratchet), +12% profit → tier 3 (105) wins
    const pos = { entryPrice: 100, stopLoss: 101 };
    expect(maybePromoteBreakeven(pos, 112)).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(105.0, 5);
  });
});

describe("maybePromoteBreakeven — ladder mode opt-out", () => {
  it("breakeven_only — only tier 1 fires", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 103, "breakeven_only")).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
  });

  it("breakeven_only — higher profit does not promote past tier 1", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 130, "breakeven_only")).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5); // tier 1 only — tactical-smart semantics
  });

  it("breakeven_only — idempotent after first fire", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    maybePromoteBreakeven(pos, 103, "breakeven_only");
    expect(maybePromoteBreakeven(pos, 130, "breakeven_only")).toBe(false);
    expect(pos.stopLoss).toBeCloseTo(100.1, 5);
  });

  it("disabled — never fires regardless of profit", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 200, "disabled")).toBe(false);
    expect(pos.stopLoss).toBe(88);
  });

  it("disabled — leaves trail-promoted stop alone", () => {
    const pos = { entryPrice: 100, stopLoss: 115 };
    expect(maybePromoteBreakeven(pos, 130, "disabled")).toBe(false);
    expect(pos.stopLoss).toBe(115);
  });
});

describe("maybePromoteBreakeven — edge cases", () => {
  it("handles fractional shares + dollar prices precisely", () => {
    const pos = { entryPrice: 1393.91, stopLoss: 1226.64 }; // SNDK-style 12% stop
    expect(maybePromoteBreakeven(pos, 1421.78)).toBe(false); // +2.0%-ε
    expect(maybePromoteBreakeven(pos, 1421.79)).toBe(true); // +2.0% (tier 1)
    expect(pos.stopLoss).toBeCloseTo(1395.30, 1); // 1393.91 × 1.001
  });

  it("handles negative price movement (no false promotion)", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    expect(maybePromoteBreakeven(pos, 95)).toBe(false); // −5%
    expect(pos.stopLoss).toBe(88);
  });

  it("works structurally — accepts any { entryPrice, stopLoss } shape", () => {
    const wrapper: { entryPrice: number; stopLoss: number; extra: string } = {
      entryPrice: 200,
      stopLoss: 176,
      extra: "ignored",
    };
    expect(maybePromoteBreakeven(wrapper, 210)).toBe(true); // +5% → tier 2
    expect(wrapper.stopLoss).toBeCloseTo(205.0, 5); // 200 × 1.025
    expect(wrapper.extra).toBe("ignored");
  });
});

describe("getBreakevenLadderMode — per-engine-mode defaults", () => {
  const cases: [string, BreakevenLadderMode][] = [
    ["conservative", "full"],
    ["moderate", "full"],
    ["optimized", "full"],
    ["aggressive", "full"],
    ["tactical", "disabled"],
    ["tactical-smart", "breakeven_only"],
    ["adaptive", "full"],
  ];

  for (const [mode, expected] of cases) {
    it(`${mode} → ${expected}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getBreakevenLadderMode(mode as any)).toBe(expected);
    });
  }
});
