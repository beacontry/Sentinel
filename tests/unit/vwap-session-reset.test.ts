/**
 * Audit #29 — VWAP must reset at each trading-session boundary.
 *
 * Previously a fresh VWAP was fed every bar in the window with no reset, so on
 * the engine's 90-daily-bar path "VWAP" was a multi-month volume-weighted mean
 * (sat below price in any uptrend, biasing the bull/bear vote) and on the 5m
 * path it cumulated across ~5 sessions. The analyzer now resets VWAP whenever
 * the bar's calendar day changes.
 */

import { describe, it, expect } from "vitest";
import { analyzeBars } from "@/lib/indicators/analyzer";
import type { Bar } from "@/types";

function bar(date: string, price: number, volume: number): Bar {
  return { date, open: price, high: price, low: price, close: price, volume };
}

describe("VWAP session anchoring", () => {
  it("resets at each new session, so VWAP reflects only the latest day", () => {
    // Two 5m sessions; session 2 trades far above session 1. A non-resetting
    // VWAP would be dragged to ~150; the reset isolates session 2 at 200.
    const bars: Bar[] = [
      bar("2026-06-16T14:30:00Z", 100, 1000),
      bar("2026-06-16T14:35:00Z", 100, 1000),
      bar("2026-06-17T14:30:00Z", 200, 1000),
      bar("2026-06-17T14:35:00Z", 200, 1000),
    ];
    expect(analyzeBars("TEST", bars).indicators.vwap).toBeCloseTo(200, 6);
  });

  it("on daily bars VWAP collapses to the last bar's typical price (not a multi-day VWMA)", () => {
    // Each daily bar is its own session → VWAP = (H+L+C)/3 of the final bar.
    const bars: Bar[] = [
      { date: "2026-06-15", open: 100, high: 110, low: 90, close: 100, volume: 5000 },
      { date: "2026-06-16", open: 100, high: 120, low: 80, close: 100, volume: 5000 },
      { date: "2026-06-17", open: 100, high: 130, low: 110, close: 120, volume: 5000 },
    ];
    // typical of last bar = (130 + 110 + 120) / 3 = 120
    expect(analyzeBars("TEST", bars).indicators.vwap).toBeCloseTo(120, 6);
  });
});
