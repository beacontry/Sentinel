import { describe, it, expect } from "vitest";
import {
  decideAlert,
  checkRule,
  checkIndicatorRule,
  type AlertContext,
} from "@/lib/alert-engine";

// Minimal indicator snapshot — checkIndicatorRule only reads these fields.
function ind(partial: Record<string, number | null>): AlertContext["indicators"] {
  return partial as unknown as AlertContext["indicators"];
}

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("decideAlert — edge-trigger + cooldown state machine", () => {
  it("fires on the rising edge (false→true) with no prior trigger", () => {
    expect(decideAlert(true, false, null, NOW)).toEqual({ fire: true, persistState: true });
  });

  it("does not fire while the condition stays true (true→true)", () => {
    expect(decideAlert(true, true, new Date(NOW - 2 * HOUR), NOW)).toEqual({ fire: false, persistState: false });
  });

  it("re-arms on the falling edge (true→false): no fire, but persists state", () => {
    expect(decideAlert(false, true, new Date(NOW - 2 * HOUR), NOW)).toEqual({ fire: false, persistState: true });
  });

  it("stays quiet while false (false→false)", () => {
    expect(decideAlert(false, false, null, NOW)).toEqual({ fire: false, persistState: false });
  });

  it("suppresses a rising edge inside the cooldown WITHOUT consuming the edge", () => {
    // Audit #39: a cooldown-suppressed rising edge must NOT be consumed — keep
    // lastConditionMet unchanged so the still-true condition fires once the
    // cooldown expires, instead of being permanently swallowed.
    expect(decideAlert(true, false, new Date(NOW - 30 * 60 * 1000), NOW)).toEqual({
      fire: false,
      persistState: false,
    });
  });

  it("fires a rising edge once the cooldown has elapsed", () => {
    expect(decideAlert(true, false, new Date(NOW - 2 * HOUR), NOW)).toEqual({ fire: true, persistState: true });
  });

  it("first observation (null) records a baseline and does NOT fire, even if already true", () => {
    // Audit #10: a freshly-created rule whose level is already true must not
    // emit a spurious cross on its first eval — it seeds state instead.
    expect(decideAlert(true, null, null, NOW)).toEqual({ fire: false, persistState: true });
    expect(decideAlert(false, null, null, NOW)).toEqual({ fire: false, persistState: true });
  });
});

describe("checkRule — price / volume / pct / signal", () => {
  const base: AlertContext = { symbol: "AAPL", price: 100, volume: 1_000_000 };

  it("price_above / price_below use inclusive bounds", () => {
    expect(checkRule("price_above", 100, base)).toBe(true);
    expect(checkRule("price_above", 100.01, base)).toBe(false);
    expect(checkRule("price_below", 100, base)).toBe(true);
    expect(checkRule("price_below", 99.99, base)).toBe(false);
  });

  it("volume_spike compares against trailing average, not a hardcoded million", () => {
    const ctx = { ...base, volume: 3_000_000, avgVolume: 1_000_000 };
    expect(checkRule("volume_spike", 2, ctx)).toBe(true); // 3x >= 2x avg
    expect(checkRule("volume_spike", 4, ctx)).toBe(false); // 3x < 4x avg
  });

  it("volume_spike cannot fire without an average baseline", () => {
    expect(checkRule("volume_spike", 2, base)).toBe(false); // no avgVolume
    expect(checkRule("volume_spike", 2, { ...base, avgVolume: 0 })).toBe(false);
  });

  it("pct_drop needs a previous price and measures the drop from it", () => {
    expect(checkRule("pct_drop", 5, base)).toBe(false); // no previousPrice
    expect(checkRule("pct_drop", 5, { ...base, price: 90, previousPrice: 100 })).toBe(true); // -10%
    expect(checkRule("pct_drop", 15, { ...base, price: 90, previousPrice: 100 })).toBe(false); // 10% < 15%
  });

  it("signal_generated honors the strength threshold and ignores HOLD", () => {
    expect(checkRule("signal_generated", 1, { ...base, signal: "BUY" })).toBe(true);
    expect(checkRule("signal_generated", 1, { ...base, signal: "HOLD" })).toBe(false);
    expect(checkRule("signal_generated", 2, { ...base, signal: "BUY" })).toBe(false);
    expect(checkRule("signal_generated", 2, { ...base, signal: "STRONG_BUY" })).toBe(true);
  });
});

describe("checkIndicatorRule — reads the pre-computed snapshot, no I/O", () => {
  const ctx = (price: number, indicators: Record<string, number | null>): AlertContext => ({
    symbol: "AAPL",
    price,
    volume: 0,
    indicators: ind(indicators),
  });

  it("returns false when no indicator snapshot is present", () => {
    expect(checkIndicatorRule("rsi_below", 30, { symbol: "AAPL", price: 10, volume: 0 })).toBe(false);
  });

  it("rsi_below / rsi_above", () => {
    expect(checkIndicatorRule("rsi_below", 30, ctx(10, { rsi_14: 25 }))).toBe(true);
    expect(checkIndicatorRule("rsi_below", 30, ctx(10, { rsi_14: 35 }))).toBe(false);
    expect(checkIndicatorRule("rsi_above", 70, ctx(10, { rsi_14: 75 }))).toBe(true);
    expect(checkIndicatorRule("rsi_below", 30, ctx(10, { rsi_14: null }))).toBe(false);
  });

  it("macd_crossover / ema_crossover are level checks (edge-trigger wraps them)", () => {
    expect(checkIndicatorRule("macd_crossover", 0, ctx(10, { macd_histogram: 0.5 }))).toBe(true);
    expect(checkIndicatorRule("macd_crossover", 0, ctx(10, { macd_histogram: -0.5 }))).toBe(false);
    expect(checkIndicatorRule("ema_crossover", 0, ctx(10, { ema_9: 11, ema_21: 10 }))).toBe(true);
    expect(checkIndicatorRule("ema_crossover", 0, ctx(10, { ema_9: 9, ema_21: 10 }))).toBe(false);
  });

  it("price_above_sma selects SMA 50 vs 20 by threshold", () => {
    expect(checkIndicatorRule("price_above_sma", 50, ctx(105, { sma_50: 100, sma_20: 110 }))).toBe(true);
    expect(checkIndicatorRule("price_above_sma", 20, ctx(105, { sma_50: 100, sma_20: 110 }))).toBe(false);
  });

  it("price_above_sma does NOT fall through to SMA-20 for unsupported periods (audit #9)", () => {
    // value=200 used to silently test SMA-20 (105 > 110 = false here, but it
    // would have fired in an uptrend). Unsupported periods now never fire.
    expect(checkIndicatorRule("price_above_sma", 200, ctx(105, { sma_50: 100, sma_20: 90 }))).toBe(false);
    expect(checkIndicatorRule("price_above_sma", 100, ctx(105, { sma_50: 100, sma_20: 90 }))).toBe(false);
  });
});
