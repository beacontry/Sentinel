/**
 * Tests for detectCrossover / detectCrossunder end-alignment (audit #6).
 *
 * The two EMA history arrays start recording at different bars (the faster EMA
 * has a smaller window) and are independently length-capped, so they routinely
 * differ in length. The bug was indexing both arrays by the same front-counted
 * position, which compares EMAs from DIFFERENT bars on mismatched lengths —
 * fabricating or missing "fresh crossover" signals that feed the bull/bear
 * score. The fix end-aligns (slices each to its last minLen) so index i refers
 * to the same bar in both arrays.
 */

import { describe, it, expect } from "vitest";
import { detectCrossover, detectCrossunder } from "@/lib/indicators/analyzer";

describe("detectCrossover / detectCrossunder — end alignment", () => {
  it("detects a real crossover when arrays are equal length", () => {
    // fast crosses above slow between the last two bars
    expect(detectCrossover([1, 2, 3], [5, 4, 2], 3)).toBe(true);
    expect(detectCrossover([1, 2, 3], [5, 6, 7], 3)).toBe(false);
  });

  it("detects a crossover that front-indexing would MISS on mismatched lengths", () => {
    // End-aligned: fast last-3 = [4,5,6], slow = [10,4,5].
    //   bar -3: fast 4 <= slow 10 (fast below) → bar -2: fast 5 > slow 4 (fast above) = crossover.
    // Front-indexing the full fast array ([1,2,3,4,5,6]) vs slow would compare
    // bar 0 of each (different absolute bars) and return false. Fix must see it.
    expect(detectCrossover([1, 2, 3, 4, 5, 6], [10, 4, 5], 3)).toBe(true);
  });

  it("detects a crossunder that front-indexing would MISS on mismatched lengths", () => {
    // End-aligned: fast last-3 = [7,6,5], slow = [1,8,7].
    //   bar -3: fast 7 >= slow 1 (fast above) → bar -2: fast 6 < slow 8 (fast below) = crossunder.
    expect(detectCrossunder([10, 9, 8, 7, 6, 5], [1, 8, 7], 3)).toBe(true);
  });

  it("does NOT fabricate a crossover when the aligned bars never cross", () => {
    // fast stays strictly above slow across all aligned bars
    expect(detectCrossover([1, 2, 3, 8, 9, 10], [4, 5, 6], 3)).toBe(false);
  });

  it("respects the lookback window (older crossover outside the window is ignored)", () => {
    // Crossover happens at the very start; lookback=1 only inspects the last
    // two bars, where fast stays above slow.
    expect(detectCrossover([1, 9, 10, 11], [5, 4, 3, 2], 1)).toBe(false);
  });

  it("returns false for arrays too short to compare", () => {
    expect(detectCrossover([1], [2], 3)).toBe(false);
    expect(detectCrossunder([], [], 3)).toBe(false);
  });
});
