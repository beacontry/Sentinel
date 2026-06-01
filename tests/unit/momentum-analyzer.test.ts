import { describe, it, expect } from "vitest";
import {
  analyzeMomentumBars,
  DEFAULT_MOMENTUM_PARAMS,
} from "@/lib/indicators/momentum-analyzer";
import { SignalType, type Bar } from "@/types";
import { barSequence } from "./helpers";

// ── Pattern synthesizers ────────────────────────────────────────────
//
// Build deterministic bull-flag setups for testing. Each helper returns a
// flat array of 1-min bars: a warm-up base, an impulse leg, a tight
// consolidation, then a breakout bar.

interface FlagOptions {
  basePrice: number;
  warmupBars: number;
  impulseBars: number;
  impulsePct: number;
  consolidationBars: number;
  consolidationRangePct: number;
  breakoutPct: number;
  consolidationVolume: number;
  impulseVolume: number;
  breakoutVolumeMult: number;
  warmupVolume?: number;
}

function buildBullFlag(opts: FlagOptions): Bar[] {
  const {
    basePrice,
    warmupBars,
    impulseBars,
    impulsePct,
    consolidationBars,
    consolidationRangePct,
    breakoutPct,
    consolidationVolume,
    impulseVolume,
    breakoutVolumeMult,
    warmupVolume = consolidationVolume,
  } = opts;

  const bars: Bar[] = [];
  // Warmup: small uptrend so RSI is around 55-65 by the time the impulse hits.
  for (let i = 0; i < warmupBars; i++) {
    const c = basePrice * (1 + i * 0.001);
    bars.push({
      date: new Date(Date.now() + bars.length * 60_000).toISOString(),
      open: c - 0.01,
      high: c + 0.02,
      low: c - 0.02,
      close: c,
      volume: warmupVolume,
    });
  }

  // Impulse: linear ramp up.
  const impulseStart = bars[bars.length - 1].close;
  const impulseEnd = impulseStart * (1 + impulsePct);
  for (let i = 0; i < impulseBars; i++) {
    const c = impulseStart + ((impulseEnd - impulseStart) * (i + 1)) / impulseBars;
    bars.push({
      date: new Date(Date.now() + bars.length * 60_000).toISOString(),
      open: c - 0.02,
      high: c + 0.03,
      low: c - 0.03,
      close: c,
      volume: impulseVolume,
    });
  }

  // Consolidation: oscillate within a tight band just below impulseEnd.
  const flagHigh = impulseEnd;
  const flagLow = impulseEnd * (1 - consolidationRangePct);
  for (let i = 0; i < consolidationBars; i++) {
    const mid = (flagHigh + flagLow) / 2;
    const c = i % 2 === 0 ? mid + (flagHigh - mid) * 0.7 : mid - (mid - flagLow) * 0.7;
    bars.push({
      date: new Date(Date.now() + bars.length * 60_000).toISOString(),
      open: c,
      high: flagHigh - (flagHigh - mid) * 0.1,
      low: flagLow + (mid - flagLow) * 0.1,
      close: c,
      volume: consolidationVolume,
    });
  }

  // Breakout bar.
  const breakoutClose = flagHigh * (1 + breakoutPct);
  bars.push({
    date: new Date(Date.now() + bars.length * 60_000).toISOString(),
    open: flagHigh - 0.02,
    high: breakoutClose + 0.02,
    low: flagHigh - 0.03,
    close: breakoutClose,
    volume: consolidationVolume * breakoutVolumeMult,
  });

  return bars;
}

const cleanBullFlagBars = () =>
  buildBullFlag({
    basePrice: 5.0,
    warmupBars: 15,
    impulseBars: 6,
    impulsePct: 0.04,
    consolidationBars: 5,
    consolidationRangePct: 0.012,
    breakoutPct: 0.008,
    consolidationVolume: 50_000,
    impulseVolume: 200_000,
    breakoutVolumeMult: 2.5,
    warmupVolume: 30_000,
  });

// ── Tests ───────────────────────────────────────────────────────────

describe("analyzeMomentumBars", () => {
  it("returns HOLD with insufficient bars", () => {
    const bars = barSequence([5, 5.05, 5.1, 5.08, 5.12]);
    const result = analyzeMomentumBars("TEST", bars);
    expect(result.signal).toBe(SignalType.HOLD);
    expect(result.confidence).toBeLessThan(0.3);
    expect(result.reasons[0]).toMatch(/insufficient/i);
    expect(result.pattern).toBeNull();
  });

  it("detects a clean bull-flag breakout with volume surge → BUY or STRONG_BUY", () => {
    const bars = cleanBullFlagBars();
    const result = analyzeMomentumBars("FLAG", bars);

    expect([SignalType.BUY, SignalType.STRONG_BUY]).toContain(result.signal);
    expect(result.confidence).toBeGreaterThan(0.55);
    expect(result.pattern).not.toBeNull();
    expect(result.pattern!.volumeSurge).toBe(true);
    expect(result.pattern!.consolidationLow).toBeLessThan(result.price);
    // Stop should be the consolidation low.
    expect(result.suggestedStop).toBe(result.pattern!.consolidationLow);
  });

  it("returns HOLD when breakout bar lacks volume surge", () => {
    const bars = buildBullFlag({
      basePrice: 5.0,
      warmupBars: 15,
      impulseBars: 6,
      impulsePct: 0.04,
      consolidationBars: 5,
      consolidationRangePct: 0.012,
      breakoutPct: 0.008,
      consolidationVolume: 50_000,
      impulseVolume: 200_000,
      breakoutVolumeMult: 1.0, // no surge
      warmupVolume: 30_000,
    });
    const result = analyzeMomentumBars("NOVOL", bars);
    expect(result.signal).toBe(SignalType.HOLD);
    // Pattern still detected, just not confirmed.
    expect(result.pattern).not.toBeNull();
    expect(result.pattern!.volumeSurge).toBe(false);
    expect(
      result.reasons.some((r) => /unconfirmed|below.*threshold/i.test(r))
    ).toBe(true);
  });

  it("returns HOLD when no consolidation is present (no flag)", () => {
    // Bars that just keep going up — no consolidation, no flag.
    const closes = Array.from({ length: 25 }, (_, i) => 5 + i * 0.05);
    const bars = barSequence(closes);
    const result = analyzeMomentumBars("RAMP", bars);
    // Either no pattern OR exhausted RSI — both correctly yield HOLD.
    expect(result.signal).toBe(SignalType.HOLD);
  });

  it("returns HOLD when price is below VWAP (broken setup)", () => {
    // Build a downtrend so VWAP sits above current price.
    const closes = Array.from({ length: 25 }, (_, i) => 10 - i * 0.1);
    const bars = barSequence(closes);
    const result = analyzeMomentumBars("DOWN", bars);
    expect(result.signal).toBe(SignalType.HOLD);
    expect(
      result.reasons.some((r) => /below VWAP|momentum setup invalid/i.test(r))
    ).toBe(true);
  });

  it("returns HOLD when RSI is exhausted (parabolic)", () => {
    // Pure parabolic move pins RSI very high — should refuse to chase.
    const closes = Array.from({ length: 25 }, (_, i) => 5 + i * 0.5);
    const bars = barSequence(closes);
    const result = analyzeMomentumBars("PARA", bars);
    expect(result.signal).toBe(SignalType.HOLD);
    // Either RSI exhausted or some other gate — both acceptable.
    const hasExhaustionReason = result.reasons.some((r) =>
      /exhausted|don't chase|above 80/i.test(r)
    );
    if (result.rsi !== null && result.rsi > DEFAULT_MOMENTUM_PARAMS.rsiMax) {
      expect(hasExhaustionReason).toBe(true);
    }
  });

  it("populates the full result shape", () => {
    const bars = cleanBullFlagBars();
    const result = analyzeMomentumBars("SHAPE", bars);
    expect(result.symbol).toBe("SHAPE");
    expect(typeof result.price).toBe("number");
    expect(typeof result.volume).toBe("number");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(typeof result.timestamp).toBe("string");
    // Indicator snapshot present on a valid setup.
    expect(result.vwap).not.toBeNull();
    expect(result.ema9).not.toBeNull();
    expect(result.rsi).not.toBeNull();
  });

  it("stop suggestion sits below breakout and above zero", () => {
    const bars = cleanBullFlagBars();
    const result = analyzeMomentumBars("STOP", bars);
    expect(result.suggestedStop).not.toBeNull();
    expect(result.suggestedStop!).toBeGreaterThan(0);
    expect(result.suggestedStop!).toBeLessThan(result.price);
    // Risk-per-share should be a sensible fraction of price.
    const riskPerShare = result.price - result.suggestedStop!;
    expect(riskPerShare).toBeGreaterThan(0);
    expect(riskPerShare / result.price).toBeLessThan(0.1);
  });
});
