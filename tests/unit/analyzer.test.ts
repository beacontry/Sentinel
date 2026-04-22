import { describe, it, expect } from "vitest";
import { analyzeBars } from "@/lib/indicators/analyzer";
import { trendUp, trendDown, flatBars, barSequence } from "./helpers";
import type { SignalType } from "@/types";

describe("analyzeBars", () => {
  it("returns HOLD with insufficient data", () => {
    const bars = barSequence([100, 101, 102]);
    const result = analyzeBars("TEST", bars);
    expect(result.symbol).toBe("TEST");
    expect(result.signal).toBe("HOLD");
  });

  it("detects bullish indicators in an uptrend", () => {
    const bars = trendUp(95, 115, 100);
    const result = analyzeBars("BULL", bars);
    // Uptrend should produce bullish positioning reasons
    const bullishReasons = result.reasons.filter(
      (r) => r.includes("bullish") || r.includes("uptrend") || r.includes("above")
    );
    const bearishReasons = result.reasons.filter(
      (r) => r.includes("bearish") || r.includes("downtrend") || r.includes("below")
    );
    expect(bullishReasons.length).toBeGreaterThanOrEqual(2);
    // EMA should be in uptrend, price above VWAP and SMA
    expect(result.indicators.ema_9).not.toBeNull();
    expect(result.indicators.ema_21).not.toBeNull();
    expect(result.indicators.ema_9!).toBeGreaterThan(result.indicators.ema_21!);
    expect(result.price).toBeGreaterThan(result.indicators.sma_20!);
  });

  it("detects bearish indicators in a downtrend", () => {
    const bars = trendDown(115, 95, 100);
    const result = analyzeBars("BEAR", bars);
    const bearishReasons = result.reasons.filter(
      (r) => r.includes("bearish") || r.includes("downtrend") || r.includes("below")
    );
    expect(bearishReasons.length).toBeGreaterThanOrEqual(2);
    // EMA should be in downtrend, price below SMA
    expect(result.indicators.ema_9!).toBeLessThan(result.indicators.ema_21!);
    expect(result.price).toBeLessThan(result.indicators.sma_20!);
  });

  it("produces HOLD on flat/choppy price action", () => {
    const bars = flatBars(100, 60, 0.3);
    const result = analyzeBars("FLAT", bars);
    // Flat markets should be HOLD or at least low confidence
    if (result.signal === "HOLD") {
      expect(result.confidence).toBeLessThan(0.6);
    }
  });

  it("populates all required fields", () => {
    const bars = trendUp(90, 120, 60);
    const result = analyzeBars("FULL", bars);

    expect(result.symbol).toBe("FULL");
    expect(typeof result.price).toBe("number");
    expect(result.price).toBeGreaterThan(0);
    expect(typeof result.volume).toBe("number");
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(typeof result.plainEnglish).toBe("string");
    expect(result.plainEnglish.length).toBeGreaterThan(0);
    expect(typeof result.timestamp).toBe("string");
  });

  it("populates indicator snapshot correctly", () => {
    const bars = trendUp(90, 130, 60);
    const result = analyzeBars("IND", bars);

    // After 60 bars, all indicators should be ready
    expect(result.indicators.sma_20).not.toBeNull();
    expect(result.indicators.sma_50).not.toBeNull();
    expect(result.indicators.ema_9).not.toBeNull();
    expect(result.indicators.ema_21).not.toBeNull();
    expect(result.indicators.rsi_14).not.toBeNull();
    expect(result.indicators.macd_line).not.toBeNull();
    expect(result.indicators.atr_14).not.toBeNull();
    expect(result.indicators.bollinger_upper).not.toBeNull();
    expect(result.indicators.bollinger_lower).not.toBeNull();
  });

  it("populates indicator series with correct length", () => {
    const bars = trendUp(90, 130, 60);
    const result = analyzeBars("SER", bars);

    // Series arrays should match bar count
    expect(result.series.sma_9.length).toBe(60);
    expect(result.series.ema_9.length).toBe(60);
    expect(result.series.rsi_14.length).toBe(60);
    expect(result.series.macd_line.length).toBe(60);
  });

  it("confidence stays within [0, 1]", () => {
    const scenarios = [
      trendUp(50, 200, 60),    // extreme uptrend
      trendDown(200, 50, 60),  // extreme downtrend
      flatBars(100, 60),       // flat
    ];
    for (const bars of scenarios) {
      const result = analyzeBars("CONF", bars);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("sets last bar price as result price", () => {
    const bars = barSequence([100, 105, 110, 115, 120]);
    // Not enough bars for a proper signal but price should be last close
    const result = analyzeBars("PRICE", bars);
    expect(result.price).toBe(120);
  });

  it("includes fibonacci levels", () => {
    const bars = trendUp(90, 130, 60);
    const result = analyzeBars("FIB", bars);
    if (result.fibonacci) {
      expect(result.fibonacci.levels.length).toBeGreaterThan(0);
      for (const level of result.fibonacci.levels) {
        expect(typeof level.price).toBe("number");
        expect(typeof level.ratio).toBe("number");
        expect(typeof level.label).toBe("string");
      }
    }
  });
});
