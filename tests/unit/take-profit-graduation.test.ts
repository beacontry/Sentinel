/**
 * Tests for the take-profit graduation feature (Option C — runner-friendly
 * exit). The two helpers are pure functions exported from trading-engine.ts:
 *   - shouldGraduateExit(pos, bars, indicators, currentPrice) — weakness gate
 *   - promoteToGraduationFloor(pos) — locks stopLoss to entry × 1.30
 *
 * Plus the mode-to-graduation mapping helper getGraduationMode(activeMode).
 *
 * Importing the real helpers (not mirrored) since they're exported and have
 * no I/O or engine-state coupling.
 */

import { describe, it, expect } from "vitest";
import {
  shouldGraduateExit,
  promoteToGraduationFloor,
  getGraduationMode,
} from "@/lib/trading-engine";
import type { Bar } from "@/types";

function makeBars(count: number, opts: Partial<{
  baseHigh: number;
  baseVolume: number;
  recentVolumeMultiplier: number; // multiplier applied to the last 5 bars
  peakAt: number; // bar index from end that holds the peak high
}> = {}): Bar[] {
  const baseHigh = opts.baseHigh ?? 100;
  const baseVolume = opts.baseVolume ?? 1_000_000;
  const recentMult = opts.recentVolumeMultiplier ?? 1;
  const peakAt = opts.peakAt ?? 5;
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const fromEnd = count - 1 - i;
    const volMult = fromEnd < 5 ? recentMult : 1;
    bars.push({
      date: new Date(1_700_000_000_000 + i * 86_400_000).toISOString().slice(0, 10),
      open: baseHigh - 1,
      high: fromEnd === peakAt ? baseHigh + 10 : baseHigh,
      low: baseHigh - 2,
      close: baseHigh - 0.5,
      volume: baseVolume * volMult,
    });
  }
  return bars;
}

describe("getGraduationMode", () => {
  it("is enabled for tactical-smart and optimized by default", () => {
    // tactical-smart: original mode for graduation (PR 8) — designed
    // around the runner-friendly philosophy
    expect(getGraduationMode("tactical-smart")).toBe("enabled");
    // optimized: enabled in PR 14 as part of Option 2 (lean-into-difference)
    // — the GA-tuned takeProfitPct becomes the graduation point so live
    // runners aren't clipped by training-window-fit exit levels
    expect(getGraduationMode("optimized")).toBe("enabled");
    // All other modes keep the hard take-profit cap
    expect(getGraduationMode("conservative")).toBe("disabled");
    expect(getGraduationMode("moderate")).toBe("disabled");
    expect(getGraduationMode("aggressive")).toBe("disabled");
    expect(getGraduationMode("tactical")).toBe("disabled");
    expect(getGraduationMode("adaptive")).toBe("disabled");
  });
});

describe("promoteToGraduationFloor", () => {
  it("locks pos.stopLoss to entry × 1.30 when current stop is lower", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const promoted = promoteToGraduationFloor(pos);
    expect(promoted).toBe(true);
    expect(pos.stopLoss).toBe(130);
  });

  it("no-ops when pos.stopLoss is already at or above the floor (idempotent)", () => {
    const pos = { entryPrice: 100, stopLoss: 135 };
    const promoted = promoteToGraduationFloor(pos);
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(135);
  });

  it("no-ops at exactly the floor", () => {
    const pos = { entryPrice: 100, stopLoss: 130 };
    const promoted = promoteToGraduationFloor(pos);
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(130);
  });

  it("preserves a trail that has already ratcheted past the floor", () => {
    // Realistic scenario: position ran to +60%, trail ratcheted stop to entry×1.40.
    // Hitting take_profit triggers graduation; floor would be entry×1.30 (lower).
    // We must NOT lower the existing stop.
    const pos = { entryPrice: 100, stopLoss: 140 };
    const promoted = promoteToGraduationFloor(pos);
    expect(promoted).toBe(false);
    expect(pos.stopLoss).toBe(140);
  });

  // --- currentPrice clamp (the P1 force-exit fix) ---

  it("caps the floor just below currentPrice when TP fired below entry × 1.30", () => {
    // Optimized/tactical-smart TP often triggers graduation well under +30%.
    // Locking the full entry×1.30 floor would sit ABOVE market and instantly
    // force-exit as "stop loss hit". With currentPrice the floor is capped to
    // currentPrice × (1 - buffer), staying below market.
    const pos = { entryPrice: 100, stopLoss: 88 };
    const currentPrice = 110; // +10% — graduation crossing well below +30%
    const promoted = promoteToGraduationFloor(pos, currentPrice);
    expect(promoted).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(110 * 0.98, 6); // 107.8, below current
    expect(pos.stopLoss).toBeLessThan(currentPrice); // never force-exits
  });

  it("keeps the full entry × 1.30 floor when currentPrice is high enough", () => {
    // Price already at +42% — entry×1.30 (130) sits below currentPrice×0.98
    // (139.16), so the cap doesn't bind and the intended +30% lock applies.
    const pos = { entryPrice: 100, stopLoss: 88 };
    const promoted = promoteToGraduationFloor(pos, 142);
    expect(promoted).toBe(true);
    expect(pos.stopLoss).toBe(130);
  });

  it("never raises the floor at/above currentPrice across sub-30% crossings", () => {
    for (const gainPct of [1, 3, 6, 10, 20, 29]) {
      const pos = { entryPrice: 100, stopLoss: 88 };
      const currentPrice = 100 * (1 + gainPct / 100);
      promoteToGraduationFloor(pos, currentPrice);
      expect(pos.stopLoss).toBeLessThan(currentPrice);
    }
  });
});

describe("shouldGraduateExit", () => {
  const pos = { entryPrice: 100 };
  // Current price = 150 → +50% (the typical graduation trigger). The helper
  // doesn't enforce the threshold itself; the runScan caller is responsible
  // for only invoking it when currentPrice >= takeProfit.
  const currentPrice = 150;

  it("returns null with fewer than 20 bars (insufficient volume baseline)", () => {
    const bars = makeBars(10);
    expect(shouldGraduateExit(pos, bars, { rsi_14: 50 }, currentPrice)).toBeNull();
  });

  it("returns null when no weakness signals fire (strong trend continuing)", () => {
    // No volume contraction, no plateau (new highs), no RSI rollover (still overbought)
    const bars = makeBars(20, { baseHigh: 150, recentVolumeMultiplier: 1.2, peakAt: 0 });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 80 }, currentPrice);
    expect(result).toBeNull();
  });

  it("returns null when only 1 weakness signal fires (below 2-of-3 threshold)", () => {
    // Volume contracting (1 signal), but no plateau (still making highs) + RSI hot
    const bars = makeBars(20, { baseHigh: 150, recentVolumeMultiplier: 0.5, peakAt: 0 });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 75 }, currentPrice);
    expect(result).toBeNull();
  });

  it("exits when 2 weakness signals fire: volume contraction + RSI rollover", () => {
    const bars = makeBars(20, { baseHigh: 150, recentVolumeMultiplier: 0.5, peakAt: 0 });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 55 }, currentPrice);
    expect(result).not.toBeNull();
    expect(result?.exit).toBe(true);
    expect(result?.weakCount).toBe(2);
    expect(result?.reason).toContain("+50%");
    expect(result?.reason).toContain("vol=down");
    expect(result?.reason).toContain("rsi_rollover=yes");
  });

  it("exits when 2 weakness signals fire: plateau + RSI rollover", () => {
    // makeBars sets the peak bar's high to baseHigh + 10. For currentPrice
    // 150 to register as plateau (<2% below peak), peak must be ~150-153.
    // baseHigh 142 → peak 152 → distFromPeak = (152-150)/152 = 0.013 ✓
    // Recent volumes normal — no contraction.
    const bars = makeBars(20, { baseHigh: 142, recentVolumeMultiplier: 1, peakAt: 3 });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 50 }, currentPrice);
    expect(result?.weakCount).toBe(2);
    expect(result?.reason).toContain("plateau=yes");
    expect(result?.reason).toContain("rsi_rollover=yes");
  });

  it("exits when all 3 weakness signals fire (worst-case for the position)", () => {
    const bars = makeBars(20, {
      baseHigh: 142, // peak 152 → 1.3% below current 150 = plateau
      recentVolumeMultiplier: 0.5, // volume contracting
      peakAt: 3,
    });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 45 }, currentPrice);
    expect(result?.weakCount).toBe(3);
  });

  it("plateau signal does NOT fire when price is still making new highs (above peak)", () => {
    // Bars have a peak at 145, current price 150 — still extending. distFromPeak < 0.
    const bars = makeBars(20, { baseHigh: 145, recentVolumeMultiplier: 1, peakAt: 5 });
    const result = shouldGraduateExit(pos, bars, { rsi_14: 80 }, currentPrice);
    expect(result).toBeNull(); // no weakness — riding higher
  });

  it("RSI rollover does NOT fire on stale/invalid RSI values", () => {
    const bars = makeBars(20, { baseHigh: 150, recentVolumeMultiplier: 0.5, peakAt: 0 });
    // RSI = 0 (placeholder for "not computed") shouldn't count as rollover.
    const result = shouldGraduateExit(pos, bars, { rsi_14: 0 }, currentPrice);
    expect(result).toBeNull(); // only volume signal, not enough
  });

  it("RSI rollover handles missing rsi_14 indicator gracefully", () => {
    const bars = makeBars(20, { baseHigh: 150, recentVolumeMultiplier: 0.5, peakAt: 0 });
    const result = shouldGraduateExit(pos, bars, {}, currentPrice);
    expect(result).toBeNull();
  });

  it("reason includes the actual gain percent (entry $100 → current $200 = +100%)", () => {
    const bars = makeBars(20, { baseHigh: 200, recentVolumeMultiplier: 0.5, peakAt: 3 });
    const result = shouldGraduateExit({ entryPrice: 100 }, bars, { rsi_14: 50 }, 200);
    expect(result?.reason).toContain("+100%");
  });
});
