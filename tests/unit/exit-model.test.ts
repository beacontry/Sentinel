/**
 * Exit model (2026-11-01): which exit stack a mode runs live, and the
 * backtester's use of the same functions.
 *
 * Background: the optimizer scores the v1 trail (preset trailingStopPct
 * decaying toward the 2% floor) with no ladder. Live, every mode ran the
 * adaptive layers on top — an ATR base trail of ~4% in place of the GA's
 * ~14%, and a +2% ladder rung that sat the stop at entry × 1.001. Optimized
 * mode now runs the exits its parameters were tuned against ("backtested");
 * the other modes keep the adaptive layers and runBacktest models them.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getExitModel,
  getBreakevenLadderMode,
  trailOptionsFor,
  trailInternals,
} from "@/lib/trading-engine";
import { resolveBacktestStop } from "@/lib/backtester";

const { getDynamicTrailingPct, ATR_BASE_MULT } = trailInternals;

describe("getExitModel — per-mode defaults", () => {
  it("optimized runs the backtested stack; every other mode stays adaptive", () => {
    expect(getExitModel("optimized")).toBe("backtested");
    for (const mode of ["conservative", "moderate", "aggressive", "tactical", "tactical-smart", "adaptive"] as const) {
      expect(getExitModel(mode)).toBe("adaptive");
    }
  });
});

describe("getExitModel — env override", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ENGINE_EXIT_MODEL_<MODE> flips a mode, hyphen spelled as underscore", () => {
    vi.stubEnv("ENGINE_EXIT_MODEL_OPTIMIZED", "adaptive");
    vi.stubEnv("ENGINE_EXIT_MODEL_TACTICAL_SMART", "backtested");
    expect(getExitModel("optimized")).toBe("adaptive");
    expect(getExitModel("tactical-smart")).toBe("backtested");
    expect(getExitModel("moderate")).toBe("adaptive");
  });

  it("an unknown value is ignored, not treated as either model", () => {
    vi.stubEnv("ENGINE_EXIT_MODEL_OPTIMIZED", "off");
    expect(getExitModel("optimized")).toBe("backtested");
  });
});

describe("the backtested model switches the adaptive layers off", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("optimized has no breakeven ladder, whatever MODE_LADDER_DEFAULT says", () => {
    expect(getBreakevenLadderMode("optimized")).toBe("disabled");
    expect(getBreakevenLadderMode("conservative")).toBe("full");
    expect(getBreakevenLadderMode("tactical-smart")).toBe("breakeven_only");
  });

  it("the ladder comes back when the env override moves optimized to adaptive", () => {
    vi.stubEnv("ENGINE_EXIT_MODEL_OPTIMIZED", "adaptive");
    expect(getBreakevenLadderMode("optimized")).toBe("full");
  });

  it("trailOptionsFor drops every option under backtested and passes them through under adaptive", () => {
    const opts = { atr: 3, vix: 15, rsi: 70, currentPrice: 98 };
    expect(trailOptionsFor("backtested", opts)).toBeUndefined();
    expect(trailOptionsFor("adaptive", opts)).toBe(opts);
  });

  it("the trail a GA param of 14.4% produces: 14.4% backtested, ~2.5×ATR adaptive", () => {
    const entry = 100;
    const peak = 100;
    const base = 0.144;
    const atr = 1.6; // a 1.6% daily range, ordinary for an S&P name
    const backtested = getDynamicTrailingPct(entry, peak, base, trailOptionsFor("backtested", { atr }));
    const adaptive = getDynamicTrailingPct(entry, peak, base, trailOptionsFor("adaptive", { atr }));
    expect(backtested).toBeCloseTo(0.144, 4);
    expect(adaptive).toBeCloseTo((ATR_BASE_MULT * atr) / peak, 4); // 4.0%
    expect(adaptive).toBeLessThan(backtested / 3);
  });
});

describe("resolveBacktestStop — the backtester runs the live functions", () => {
  // A position bought at 100 that peaked at 103 and is printing 100.0 today:
  // the round trip the prod ledger is full of.
  const base = { peakForTrail: 103, baseTrailingPct: 0.144, barLow: 100.0, positionAgeBars: 3 };

  it("backtested: a +3% peak leaves the stop at the fixed floor and a wide trail; the round trip holds", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const r = resolveBacktestStop(pos, { ...base, exitModel: "backtested", ladderMode: "disabled", atr: 1.6, rsi: 40 });
    expect(r.promoted).toBe(false);
    expect(pos.stopLoss).toBe(88);
    // v1 decay from 14.4% at +3% profit: 0.02 + 0.124 × e^(−0.09) ≈ 13.3%
    expect(r.dynTrailPct).toBeCloseTo(0.02 + 0.124 * Math.exp(-3 * 0.03), 4);
    expect(r.effectiveStop).toBeCloseTo(103 * (1 - r.dynTrailPct), 4);
    expect(r.effectiveStop).toBeLessThan(base.barLow); // holds
  });

  it("adaptive: the same bar promotes to breakeven, the ATR trail is ~4%, and the round trip exits flat", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const r = resolveBacktestStop(pos, { ...base, exitModel: "adaptive", ladderMode: "full", atr: 1.6, rsi: 40 });
    expect(r.promoted).toBe(true);
    expect(pos.stopLoss).toBeCloseTo(100.1, 6); // +2% tier → entry × 1.001
    expect(r.dynTrailPct).toBeLessThan(0.045); // 2.5 × 1.6 / 103, decayed and drawdown-tightened
    expect(r.dynTrailPct).toBeGreaterThan(0.02);
    expect(r.effectiveStop).toBeCloseTo(100.1, 6); // the ladder rung decides, not the trail
    expect(r.effectiveStop).toBeGreaterThanOrEqual(base.barLow); // exits, at +0.1%
  });

  it("adaptive with breakeven_only never climbs past the first rung", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    resolveBacktestStop(pos, { ...base, peakForTrail: 112, exitModel: "adaptive", ladderMode: "breakeven_only" });
    expect(pos.stopLoss).toBeCloseTo(100.1, 6);
    const full = { entryPrice: 100, stopLoss: 88 };
    resolveBacktestStop(full, { ...base, peakForTrail: 112, exitModel: "adaptive", ladderMode: "full" });
    expect(full.stopLoss).toBeCloseTo(105, 6); // +10% tier → entry × 1.05
  });

  it("the delayed-trail gate still holds the trail dormant under either model", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const r = resolveBacktestStop(pos, {
      ...base,
      exitModel: "backtested",
      ladderMode: "disabled",
      trailActivationProfitPct: 0.05, // peak is only +3%
    });
    expect(r.trailingStop).toBe(0);
    expect(r.effectiveStop).toBe(88);
  });

  it("with no ATR the adaptive model falls back to the preset base, as live does", () => {
    const pos = { entryPrice: 100, stopLoss: 88 };
    const r = resolveBacktestStop(pos, { ...base, peakForTrail: 100, barLow: 100, exitModel: "adaptive", ladderMode: "full" });
    expect(r.dynTrailPct).toBeCloseTo(0.144, 4);
  });
});
