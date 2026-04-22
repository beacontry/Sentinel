import { describe, it, expect } from "vitest";
import { translateSignal, signalEmoji } from "@/lib/signal-translator";
import type { SignalType } from "@/types";

describe("translateSignal", () => {
  it("produces plain English for BUY signal", () => {
    const result = translateSignal("AAPL", "BUY" as SignalType, 0.72, 150.25, [
      "Price above VWAP (bullish positioning)",
      "Short-term EMA above long-term EMA (uptrend)",
    ]);
    expect(result).toContain("AAPL");
    expect(result).toContain("$150.25");
    expect(result).toContain("bullish");
    expect(result).toContain("72%");
  });

  it("produces plain English for SELL signal", () => {
    const result = translateSignal("TSLA", "SELL" as SignalType, 0.65, 200.0, [
      "Price below VWAP (bearish positioning)",
    ]);
    expect(result).toContain("TSLA");
    expect(result).toContain("bearish");
    expect(result).toContain("reducing exposure");
  });

  it("produces plain English for HOLD signal", () => {
    const result = translateSignal("SPY", "HOLD" as SignalType, 0.45, 450.0, []);
    expect(result).toContain("SPY");
    expect(result).toContain("neutral");
    expect(result).toContain("waiting");
  });

  it("includes confidence percentage", () => {
    const result = translateSignal("NVDA", "STRONG_BUY" as SignalType, 0.92, 800.0, [
      "Multiple bullish indicators aligned",
    ]);
    expect(result).toContain("92%");
  });

  it("summarizes up to 3 reasons", () => {
    const reasons = [
      "Reason one (detail)",
      "Reason two (detail)",
      "Reason three (detail)",
      "Reason four (detail)",
    ];
    const result = translateSignal("TEST", "BUY" as SignalType, 0.6, 100, reasons);
    // Should include first 3 reasons, not the 4th
    expect(result).toContain("reason one");
    expect(result).toContain("reason two");
    expect(result).toContain("reason three");
    expect(result).not.toContain("reason four");
  });
});

describe("signalEmoji", () => {
  it("returns green circles for buy signals", () => {
    expect(signalEmoji("BUY" as SignalType)).toContain("\u{1F7E2}");
    expect(signalEmoji("STRONG_BUY" as SignalType)).toContain("\u{1F7E2}");
  });

  it("returns red circles for sell signals", () => {
    expect(signalEmoji("SELL" as SignalType)).toContain("\u{1F534}");
    expect(signalEmoji("STRONG_SELL" as SignalType)).toContain("\u{1F534}");
  });

  it("returns yellow circle for hold", () => {
    expect(signalEmoji("HOLD" as SignalType)).toContain("\u{1F7E1}");
  });

  it("returns double emoji for strong signals", () => {
    expect(signalEmoji("STRONG_BUY" as SignalType).length).toBeGreaterThan(
      signalEmoji("BUY" as SignalType).length
    );
    expect(signalEmoji("STRONG_SELL" as SignalType).length).toBeGreaterThan(
      signalEmoji("SELL" as SignalType).length
    );
  });
});
