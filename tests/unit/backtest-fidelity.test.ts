/**
 * Regression tests for the 2026-06-17 backtest-fidelity cluster (audit
 * #9/#10 intrabar look-ahead, #39 trail-floor inversion, #48 gap-through
 * fills, #11 like-for-like buy-and-hold benchmark, #49 rsThreshold off-by-one).
 *
 * These bias the GA fitness landscape → the persisted bestParams the live
 * `optimized` mode trades on, so the math is worth pinning. `portfolioBuyHold`
 * is exported and tested directly; the other fixes live inside the backtester
 * /optimizer per-bar loops (not exported), so — following the established
 * convention in backtester-swap-sell-equivalent.test.ts — we mirror the
 * corrected formulas alongside the buggy ones to lock in the behavior change.
 */

import { describe, it, expect } from "vitest";
import { portfolioBuyHold } from "@/lib/optimizer";
import type { Bar } from "@/types";

// Mirrors src/lib/config.ts BACKTEST_COSTS (5 bps / $0).
const SLIP = 5 / 10000;
const TRAIL_FLOOR = 0.02;

function bar(close: number, opts: Partial<Bar> = {}): Bar {
  return {
    date: opts.date ?? "2026-01-01",
    open: opts.open ?? close,
    high: opts.high ?? close,
    low: opts.low ?? close,
    close,
    volume: opts.volume ?? 1_000_000,
  };
}

/** Build a barLookup (symbol → dateKey → Bar) from per-symbol close series. */
function lookupFrom(series: Record<string, number[]>, dates: string[]) {
  const m = new Map<string, Map<string, Bar>>();
  for (const [sym, closes] of Object.entries(series)) {
    const inner = new Map<string, Bar>();
    closes.forEach((c, i) => {
      if (c > 0) inner.set(dates[i], bar(c, { date: dates[i] }));
    });
    m.set(sym, inner);
  }
  return m;
}

describe("portfolioBuyHold — like-for-like benchmark (audit #11)", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];

  it("returns ~0 (slight cost/integer drag) for a flat universe", () => {
    const lookup = lookupFrom({ AAA: [100, 100, 100, 100], BBB: [50, 50, 50, 50] }, dates);
    const ret = portfolioBuyHold(lookup, dates, 0, dates.length);
    // Entry slippage + integer-share rounding make it a touch below 0 — never
    // a fabricated gain on a flat market.
    expect(ret).toBeLessThanOrEqual(0);
    expect(ret).toBeGreaterThan(-1);
  });

  it("is equal-weight: a +100% and a -50% name average to ~+25% (minus drag)", () => {
    const lookup = lookupFrom({ UP: [100, 0, 0, 200], DOWN: [100, 0, 0, 50] }, dates);
    // closes of 0 are skipped, so first=100 / last=200 (UP), 100/50 (DOWN).
    const ret = portfolioBuyHold(lookup, dates, 0, dates.length);
    expect(ret).toBeGreaterThan(23);
    expect(ret).toBeLessThan(25); // strictly below the cost-free +25% mean
  });

  it("stays strictly below the naive cost-free return (slippage + rounding)", () => {
    const lookup = lookupFrom({ AAA: [100, 100, 100, 150] }, dates); // +50%
    const ret = portfolioBuyHold(lookup, dates, 0, dates.length);
    expect(ret).toBeGreaterThan(0);
    expect(ret).toBeLessThan(50);
    // Cost drag is on the order of entry slippage, not catastrophic.
    expect(ret).toBeGreaterThan(50 - 2);
  });

  it("excludes names with no bars in the window and returns 0 for an empty universe", () => {
    const lookup = lookupFrom({ PRESENT: [100, 110, 0, 0], ABSENT: [0, 0, 0, 0] }, dates);
    const present = portfolioBuyHold(lookup, dates, 0, dates.length);
    expect(present).toBeGreaterThan(0); // PRESENT alone drives it (+10% minus drag)
    expect(portfolioBuyHold(new Map(), dates, 0, dates.length)).toBe(0);
  });

  it("scopes to the requested segment window", () => {
    // Up in train half, flat in test half.
    const d = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    const lookup = lookupFrom({ AAA: [100, 120, 120, 120] }, d);
    const train = portfolioBuyHold(lookup, d, 0, 2); // 100 -> 120
    const test = portfolioBuyHold(lookup, d, 2, 4); // 120 -> 120
    expect(train).toBeGreaterThan(15);
    expect(test).toBeLessThanOrEqual(0);
  });
});

describe("dynamic-trail floor clamp (audit #39)", () => {
  // Corrected formula (live engine + both backtesters): range clamped at 0.
  const fixed = (base: number, profit: number) =>
    profit > 0 ? TRAIL_FLOOR + Math.max(0, base - TRAIL_FLOOR) * Math.exp(-3 * profit) : base;
  // The old, inverted formula kept for contrast.
  const buggy = (base: number, profit: number) =>
    profit > 0 ? 0.02 + (base - 0.02) * Math.exp(-3 * profit) : base;

  it("a sub-2% base trail stays flat at the floor — never widens (the bug)", () => {
    // base 0.01 (conservative preset): old formula LOOSENS toward 0.02 as
    // profit grows (inversion); fixed pins it flat at the floor.
    expect(buggy(0.01, 0.1)).toBeLessThan(buggy(0.01, 2.0)); // widens — bug
    expect(fixed(0.01, 0.1)).toBeCloseTo(0.02, 10);
    expect(fixed(0.01, 2.0)).toBeCloseTo(0.02, 10);
    expect(fixed(0.01, 0.1)).toBe(fixed(0.01, 2.0)); // flat — no widening
  });

  it("a sub-2% base trail is never tighter than the floor under the fix", () => {
    for (const p of [0.05, 0.2, 0.5, 1, 3]) {
      expect(fixed(0.008, p)).toBeGreaterThanOrEqual(TRAIL_FLOOR);
    }
  });

  it("a supra-2% base trail still tightens with profit and matches the old formula", () => {
    expect(fixed(0.09, 0.1)).toBeGreaterThan(fixed(0.09, 2.0)); // tightens — correct
    expect(fixed(0.09, 0.5)).toBeCloseTo(buggy(0.09, 0.5), 10); // unchanged for base >= floor
  });
});

describe("gap-through fills (audit #48)", () => {
  const stopFill = (stopLevel: number, open: number) => Math.min(stopLevel, open);
  const tpFill = (tp: number, open: number) => Math.max(tp, open);

  it("a gap-down bar fills the stop near the open, not at the (higher) stop", () => {
    expect(stopFill(88, 80)).toBe(80); // gapped through — realistic worse fill
    expect(stopFill(88, 90)).toBe(88); // intrabar touch — fills at the stop
  });

  it("a gap-up bar fills the take-profit at the open, not at the (lower) TP", () => {
    expect(tpFill(130, 140)).toBe(140); // gapped up — better fill
    expect(tpFill(130, 125)).toBe(130); // intrabar touch — fills at the TP
  });
});

describe("intrabar look-ahead — trail anchored to prior-bar peak (audit #9/#10)", () => {
  // Position: entry 100, stop 88, base trail 0.09; prior-bar peak == entry.
  // A dip-then-rally bar (high 120, low 105).
  const entry = 100;
  const stopLoss = 88;
  const base = 0.09;
  const dynTrail = (peak: number) => {
    const profit = (peak - entry) / entry;
    return profit > 0 ? TRAIL_FLOOR + Math.max(0, base - TRAIL_FLOOR) * Math.exp(-3 * profit) : base;
  };
  const exitsOnBar = (peakForTrail: number, low: number) => {
    const trail = peakForTrail * (1 - dynTrail(peakForTrail));
    const effectiveStop = Math.max(stopLoss, trail);
    return low <= effectiveStop;
  };

  it("the buggy same-bar-high peak fires a phantom trailing-stop; the prior-peak anchor does not", () => {
    const priorPeak = 100; // peak as of the prior bar
    const sameBarHigh = 120; // this bar's high

    // Buggy: peak raised to 120 first → trail ~113 → low 105 trips it.
    expect(exitsOnBar(sameBarHigh, 105)).toBe(true);

    // Fixed: trail anchored to the prior peak (100) → effective stop 91 →
    // low 105 does NOT trip it. The high only tightens the NEXT bar's trail.
    expect(exitsOnBar(priorPeak, 105)).toBe(false);
  });

  it("a genuine breakdown still exits under the prior-peak anchor", () => {
    // Even anchored to the prior peak, a low through the 91 trail still exits.
    expect(exitsOnBar(100, 90)).toBe(true);
  });
});

describe("rsThreshold lookback is a true 60 intervals (audit #49)", () => {
  // The window is a rolling Bar[]; rs60 compares w[last] to w[last-N].
  const w = Array.from({ length: 90 }, (_, i) => bar(100 + i));

  it("the old offset (length-60) spans 59 intervals; the fix (length-61) spans 60", () => {
    const oldOffset = (w.length - 1) - (w.length - 60); // 59
    const newOffset = (w.length - 1) - (w.length - 61); // 60
    expect(oldOffset).toBe(59);
    expect(newOffset).toBe(60);
  });

  it("requires >=61 bars for the true 60-interval return", () => {
    const past = w[w.length - 61];
    expect(past).toBeDefined();
    // With exactly 60 bars, length-61 would be index -1 (undefined) — hence the
    // >=61 guard that skips the filter on the single warm-up boundary bar.
    const tiny = Array.from({ length: 60 }, (_, i) => bar(100 + i));
    expect(tiny.length >= 61).toBe(false);
  });
});
