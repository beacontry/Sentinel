/**
 * Tests for isTrailActive — the delayed-trail activation gate.
 *
 * Motivation (post-2026-06-11 review): admin's history shows same-day
 * exits losing −$2,488 (2W/12L) while 3+ day holds make +$6,158
 * (12W/12L). The trail tightens too fast on fresh positions and gets
 * whipsawed by opening-day volatility. The gate keeps the trail dormant
 * until either time-since-entry OR peak-profit conditions are met. The
 * fixed disaster stop stays active from bar 0 regardless.
 *
 * Default config (both knobs 0) preserves legacy always-active behavior
 * — this is the most important invariant.
 */

import { describe, it, expect } from "vitest";
import { isTrailActive } from "@/lib/backtester";

describe("isTrailActive — default (legacy) behavior", () => {
  it("returns true when both knobs are 0 (always active = legacy)", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: 0,
        trailActivationBars: 0,
        trailActivationProfitPct: 0,
      })
    ).toBe(true);
  });

  it("returns true when knobs are undefined (treated as 0)", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: -0.05,
      })
    ).toBe(true);
  });

  it("returns true at high age + profit with no gates set", () => {
    expect(
      isTrailActive({
        positionAgeBars: 50,
        peakProfitPct: 0.5,
      })
    ).toBe(true);
  });
});

describe("isTrailActive — bars gate", () => {
  it("blocks when positionAgeBars < trailActivationBars", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: 0.1, // profit gate would pass
        trailActivationBars: 2,
      })
    ).toBe(false);
  });

  it("blocks at exactly trailActivationBars - 1 (strict greater-than-or-equal)", () => {
    expect(
      isTrailActive({
        positionAgeBars: 1,
        peakProfitPct: 0,
        trailActivationBars: 2,
      })
    ).toBe(false);
  });

  it("activates at exactly trailActivationBars", () => {
    expect(
      isTrailActive({
        positionAgeBars: 2,
        peakProfitPct: 0,
        trailActivationBars: 2,
      })
    ).toBe(true);
  });

  it("activates past trailActivationBars", () => {
    expect(
      isTrailActive({
        positionAgeBars: 10,
        peakProfitPct: 0,
        trailActivationBars: 3,
      })
    ).toBe(true);
  });
});

describe("isTrailActive — profit gate", () => {
  it("blocks when peakProfitPct < trailActivationProfitPct", () => {
    expect(
      isTrailActive({
        positionAgeBars: 5, // bars gate passes
        peakProfitPct: 0.01,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(false);
  });

  it("blocks on negative profit even at high bars age", () => {
    expect(
      isTrailActive({
        positionAgeBars: 100,
        peakProfitPct: -0.05,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(false);
  });

  it("activates at exactly trailActivationProfitPct", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: 0.02,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(true);
  });

  it("activates above trailActivationProfitPct", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: 0.10,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(true);
  });
});

describe("isTrailActive — both gates", () => {
  it("BOTH must pass — bars-only failure blocks even with profit", () => {
    expect(
      isTrailActive({
        positionAgeBars: 0,
        peakProfitPct: 0.10, // profit gate passes
        trailActivationBars: 2, // bars gate fails
        trailActivationProfitPct: 0.02,
      })
    ).toBe(false);
  });

  it("BOTH must pass — profit-only failure blocks even at high age", () => {
    expect(
      isTrailActive({
        positionAgeBars: 50,
        peakProfitPct: 0,
        trailActivationBars: 2,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(false);
  });

  it("activates only when BOTH pass", () => {
    expect(
      isTrailActive({
        positionAgeBars: 2,
        peakProfitPct: 0.02,
        trailActivationBars: 2,
        trailActivationProfitPct: 0.02,
      })
    ).toBe(true);
  });
});
