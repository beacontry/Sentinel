/**
 * Tests for getDynamicTrailingPct — the trailing-stop formula.
 *
 * v1 (legacy): trail = floor + (base - floor) × exp(-rate × profit)
 * v2 (new):    + ATR scales base, VIX scales floor
 *
 * Backward compatibility is the most important invariant. Callsites that
 * don't supply atr/vix MUST get the exact same numbers as before — many
 * tests below verify this explicitly.
 */

import { describe, it, expect } from "vitest";
import { trailInternals } from "@/lib/trading-engine";

const { getDynamicTrailingPct } = trailInternals;

describe("getDynamicTrailingPct — v1 backward compatibility", () => {
  it("returns baseTrailingPct when peak == entry (no profit)", () => {
    expect(getDynamicTrailingPct(100, 100, 0.12)).toBeCloseTo(0.12, 4);
  });

  it("returns baseTrailingPct when peak < entry (negative profit)", () => {
    expect(getDynamicTrailingPct(100, 95, 0.12)).toBeCloseTo(0.12, 4);
  });

  it("matches the documented decay at common profit checkpoints", () => {
    // base=12%, floor=2%, rate=3
    expect(getDynamicTrailingPct(100, 105, 0.12)).toBeCloseTo(0.106, 2); // 5% → ~10.6%
    expect(getDynamicTrailingPct(100, 110, 0.12)).toBeCloseTo(0.094, 2); // 10% → ~9.4%
    expect(getDynamicTrailingPct(100, 120, 0.12)).toBeCloseTo(0.075, 2); // 20% → ~7.5%
    expect(getDynamicTrailingPct(100, 130, 0.12)).toBeCloseTo(0.061, 2); // 30% → ~6.1%
    expect(getDynamicTrailingPct(100, 150, 0.12)).toBeCloseTo(0.043, 2); // 50% → ~4.3%
  });

  it("never goes below the floor at very high profit", () => {
    const trail = getDynamicTrailingPct(100, 300, 0.12);
    expect(trail).toBeGreaterThanOrEqual(0.02);
  });

  it("undefined options object is treated as no options (no v2 behavior)", () => {
    const v1 = getDynamicTrailingPct(100, 120, 0.12);
    const withEmpty = getDynamicTrailingPct(100, 120, 0.12, {});
    expect(withEmpty).toBeCloseTo(v1, 6);
  });
});

describe("getDynamicTrailingPct — ATR-based base", () => {
  it("uses ATR × ATR_BASE_MULT / peakPrice as the base when atr is supplied", () => {
    // WDC-like: peak $494, ATR $19.76 → ATR/peak = 4%, × 2.5 = 10% base
    const trail = getDynamicTrailingPct(388, 494, 0.12, { atr: 19.76 });
    // At 27.32% profit, with 10% base and 2% floor:
    //   trail = 0.02 + 0.08 × exp(-3 × 0.2732)
    //         = 0.02 + 0.08 × 0.4406
    //         = 0.0552
    expect(trail).toBeCloseTo(0.0552, 3);
  });

  it("uses ATR even when ATR-implied base is wider than the legacy baseTrailingPct", () => {
    // Very volatile name — ATR implies 18% base trail, legacy was 12%
    // peak $100, ATR $7.2 → 18% base trail
    const trail = getDynamicTrailingPct(100, 100, 0.12, { atr: 7.2 });
    // At 0% profit: should be 0.18 (ATR base, NOT legacy 0.12)
    expect(trail).toBeCloseTo(0.18, 3);
  });

  it("caps the ATR-derived base at 25% to prevent penny-stock explosions", () => {
    // Penny-stock pretend: peak $1, ATR $1 → would be 250% trail without cap
    const trail = getDynamicTrailingPct(0.8, 1, 0.12, { atr: 1 });
    // Cap kicks in at 25% base, then normal decay applies for the 25% profit
    expect(trail).toBeLessThanOrEqual(0.25);
    expect(trail).toBeGreaterThan(0.02);
  });

  it("ignores ATR when it is 0 or negative (degenerate input)", () => {
    const baseline = getDynamicTrailingPct(100, 120, 0.12);
    expect(getDynamicTrailingPct(100, 120, 0.12, { atr: 0 })).toBeCloseTo(baseline, 6);
    expect(getDynamicTrailingPct(100, 120, 0.12, { atr: -1 })).toBeCloseTo(baseline, 6);
  });
});

describe("getDynamicTrailingPct — VIX-aware floor", () => {
  it("uses panic-floor (4%) when VIX > 25", () => {
    // High profit drives the trail toward the floor — easy to verify which floor is in play
    const trail = getDynamicTrailingPct(100, 200, 0.12, { vix: 30 });
    // At 100% profit, exp(-3) ≈ 0.0498, range = 0.12-0.04 = 0.08
    //   trail = 0.04 + 0.08 × 0.0498 = 0.0440
    expect(trail).toBeGreaterThanOrEqual(0.04 - 0.001);
    expect(trail).toBeLessThan(0.05);
  });

  it("uses neutral-floor (2.5%) when 18 < VIX <= 25", () => {
    const trail = getDynamicTrailingPct(100, 200, 0.12, { vix: 22 });
    expect(trail).toBeGreaterThanOrEqual(0.025 - 0.001);
    expect(trail).toBeLessThan(0.03);
  });

  it("uses calm-floor (1.5%) when VIX <= 18", () => {
    // At 100% profit with base 12% and calm floor 1.5%:
    //   trail = 0.015 + (0.12 - 0.015) × exp(-3) = 0.015 + 0.00522 = 0.02022
    const trail = getDynamicTrailingPct(100, 200, 0.12, { vix: 15 });
    expect(trail).toBeGreaterThanOrEqual(0.015 - 0.001);
    expect(trail).toBeLessThan(0.025);
  });

  it("VIX exactly at threshold (25) is NOT panic — strict >", () => {
    const trail = getDynamicTrailingPct(100, 200, 0.12, { vix: 25 });
    // 25 falls in neutral band (18 < vix <= 25)
    expect(trail).toBeLessThan(0.03);
  });
});

describe("getDynamicTrailingPct — combined ATR + VIX", () => {
  it("WDC-like worked example at +27% profit, normal VIX, ATR ~4%", () => {
    // Peak $494, ATR $19.76 (4% of price), VIX 20 → neutral 2.5% floor
    // Base = 2.5 × 19.76 / 494 = 10%, floor = 2.5%
    // At 27.32% profit, decay factor = exp(-0.8196) = 0.4406
    // range = 0.10 - 0.025 = 0.075
    // trail = 0.025 + 0.075 × 0.4406 = 0.0580
    const trail = getDynamicTrailingPct(388, 494, 0.12, { atr: 19.76, vix: 20 });
    expect(trail).toBeCloseTo(0.058, 3);
  });

  it("low-vol utility at +27% profit, calm VIX, ATR 1%", () => {
    // Peak $100, ATR $1.0 (1% of price), VIX 14 → calm 1.5% floor
    // Base = 2.5 × 1 / 100 = 2.5%, floor = 1.5%
    // range = 1%, at 27% profit decay = exp(-0.81) ≈ 0.4449
    // trail = 0.015 + 0.01 × 0.4449 = 0.0195
    const trail = getDynamicTrailingPct(78.7, 100, 0.05, { atr: 1.0, vix: 14 });
    expect(trail).toBeCloseTo(0.0195, 3);
  });

  it("high-vol semi at +27% profit, panic VIX, ATR 6%", () => {
    // Peak $100, ATR $6 (6% of price), VIX 30 → panic 4% floor
    // Base = 2.5 × 6 / 100 = 15%, floor = 4%
    // range = 11%, at 27% profit decay = exp(-0.81) ≈ 0.4449
    // trail = 0.04 + 0.11 × 0.4449 = 0.0889
    const trail = getDynamicTrailingPct(78.7, 100, 0.12, { atr: 6, vix: 30 });
    expect(trail).toBeCloseTo(0.089, 2);
  });
});
