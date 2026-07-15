/**
 * Tests for detectSplitAdjustment — the corporate-action detector added after
 * the 2026-07-02 CRWD 4:1 incident (phantom −$2,829: the engine sold 5
 * pre-split shares at the post-split price against the pre-split basis) and
 * the 2026-05-08 CVNA 5:1 twin (phantom −$1,882 via the reconciler).
 *
 * Signature: broker qty moved >10% vs tracked while TOTAL cost basis stayed
 * conserved within 2%. Partial closes, add-on buys, and averaging all change
 * total basis → null. Returns the price scale factor for tracked per-share
 * prices (entry/stop/TP/peak), derived from the exact qty ratio.
 */

import { describe, it, expect } from "vitest";
import { detectSplitAdjustment } from "@/lib/trading-engine";

describe("detectSplitAdjustment", () => {
  it("detects the CRWD 4:1 forward split (5 @ 758.89 → 20 @ 189.7225)", () => {
    const r = detectSplitAdjustment(5, 758.89, 20, 189.7225);
    expect(r).not.toBeNull();
    expect(r!.priceFactor).toBeCloseTo(0.25, 10);
  });

  it("detects the CVNA 5:1 forward split (6 @ 396.98 → 30 @ 79.396)", () => {
    const r = detectSplitAdjustment(6, 396.98, 30, 79.396);
    expect(r).not.toBeNull();
    expect(r!.priceFactor).toBeCloseTo(0.2, 10);
  });

  it("detects a reverse split (100 @ 5 → 10 @ 50)", () => {
    const r = detectSplitAdjustment(100, 5, 10, 50);
    expect(r).not.toBeNull();
    expect(r!.priceFactor).toBeCloseTo(10, 10);
  });

  it("detects a 3:2 split (basis conserved, non-integer ratio)", () => {
    // 10 @ $90 → 15 @ $60 — total basis $900 both sides
    const r = detectSplitAdjustment(10, 90, 15, 60);
    expect(r).not.toBeNull();
    expect(r!.priceFactor).toBeCloseTo(10 / 15, 10);
  });

  it("tolerates broker sub-cent rounding on the adjusted basis", () => {
    // 4:1 where the broker reports 189.72 instead of exact 189.7225
    const r = detectSplitAdjustment(5, 758.89, 20, 189.72);
    expect(r).not.toBeNull();
    expect(r!.priceFactor).toBeCloseTo(0.25, 10);
  });

  it("returns null for a partial close (qty down, basis NOT conserved)", () => {
    // Sold 5 of 20 at same per-share basis: total basis drops 25%
    expect(detectSplitAdjustment(20, 100, 15, 100)).toBeNull();
  });

  it("returns null for an add-on buy (qty up, avg basis moves, total not conserved)", () => {
    // 10 @ 100 then bought 10 more @ 120 → 20 @ 110 (basis 1000 → 2200)
    expect(detectSplitAdjustment(10, 100, 20, 110)).toBeNull();
  });

  it("returns null when qty change is under the 10% floor", () => {
    // 100 → 105 shares with basis roughly conserved-looking per-share drift
    expect(detectSplitAdjustment(100, 100, 105, 95.238)).toBeNull();
  });

  it("returns null for unchanged positions", () => {
    expect(detectSplitAdjustment(10, 100, 10, 100)).toBeNull();
  });

  it("returns null on zero / negative / NaN inputs", () => {
    expect(detectSplitAdjustment(0, 100, 20, 25)).toBeNull();
    expect(detectSplitAdjustment(10, 0, 20, 25)).toBeNull();
    expect(detectSplitAdjustment(10, 100, 0, 25)).toBeNull();
    expect(detectSplitAdjustment(10, 100, 20, 0)).toBeNull();
    expect(detectSplitAdjustment(NaN, 100, 20, 25)).toBeNull();
    expect(detectSplitAdjustment(10, 100, 20, NaN)).toBeNull();
    expect(detectSplitAdjustment(-10, 100, 20, 25)).toBeNull();
  });

  it("returns null when basis drifts past the 2% tolerance", () => {
    // 2:1-ish qty move but basis off by 5%
    expect(detectSplitAdjustment(10, 100, 20, 52.5)).toBeNull();
  });
});
