/**
 * Tests for the split-blackout gate helpers (2026-07-15) — added after the
 * CRWD 4:1 / CVNA 5:1 phantom-loss incident. Splits are announced ahead of
 * time; the engine now refuses new BUYs inside the blackout window and exits
 * held positions on the last trading day before the ex-date (brokers cancel
 * open GTC stops on the ex-date, so holding through means an unprotected
 * window plus the whole detection surface).
 */

import { describe, it, expect } from "vitest";
import { getImminentSplitExDate, isLastTradingDayBeforeSplit } from "@/lib/trading-engine";

describe("getImminentSplitExDate", () => {
  const cal = new Map<string, string>([
    ["CRWD", "2026-07-02"],
    ["NVDA", "2026-07-20"],
    ["FAR", "2026-08-30"],
  ]);

  it("returns the ex-date when inside the blackout window", () => {
    expect(getImminentSplitExDate("NVDA", 5, "2026-07-16", cal)).toBe("2026-07-20");
  });

  it("returns null when the ex-date is beyond the window", () => {
    expect(getImminentSplitExDate("FAR", 5, "2026-07-16", cal)).toBeNull();
  });

  it("includes the boundary day (ex-date exactly `withinDays` out)", () => {
    expect(getImminentSplitExDate("NVDA", 5, "2026-07-15", cal)).toBe("2026-07-20");
  });

  it("returns null for symbols with no announced split", () => {
    expect(getImminentSplitExDate("AAPL", 5, "2026-07-16", cal)).toBeNull();
  });

  it("returns null for already-past ex-dates (rescale territory, not blackout)", () => {
    expect(getImminentSplitExDate("CRWD", 5, "2026-07-16", cal)).toBeNull();
  });

  it("still blocks ON the ex-date itself", () => {
    expect(getImminentSplitExDate("NVDA", 5, "2026-07-20", cal)).toBe("2026-07-20");
  });

  it("returns null with no cache at all (gate fails open, sync guards remain)", () => {
    expect(getImminentSplitExDate("NVDA", 5, "2026-07-16", undefined)).toBeNull();
  });
});

describe("isLastTradingDayBeforeSplit", () => {
  it("fires the weekday immediately before a mid-week ex-date", () => {
    // 2026-07-20 is a Monday... use a Wednesday ex-date: 2026-07-22 (Wed)
    expect(isLastTradingDayBeforeSplit("2026-07-22", "2026-07-21")).toBe(true); // Tue before Wed
    expect(isLastTradingDayBeforeSplit("2026-07-22", "2026-07-20")).toBe(false); // Mon — Tue still remains
  });

  it("fires on FRIDAY for a Monday ex-date (weekend-aware)", () => {
    // 2026-07-20 is a Monday; 2026-07-17 is the Friday before.
    expect(isLastTradingDayBeforeSplit("2026-07-20", "2026-07-17")).toBe(true);
    expect(isLastTradingDayBeforeSplit("2026-07-20", "2026-07-16")).toBe(false); // Thursday — Friday remains
  });

  it("does not fire on or after the ex-date (rescale handles that)", () => {
    expect(isLastTradingDayBeforeSplit("2026-07-20", "2026-07-20")).toBe(false);
    expect(isLastTradingDayBeforeSplit("2026-07-20", "2026-07-21")).toBe(false);
  });

  it("handles a Tuesday ex-date (Monday is the last trading day)", () => {
    // 2026-07-21 is a Tuesday; Monday 2026-07-20 is the last full day.
    expect(isLastTradingDayBeforeSplit("2026-07-21", "2026-07-20")).toBe(true);
    expect(isLastTradingDayBeforeSplit("2026-07-21", "2026-07-17")).toBe(false); // Friday — Monday remains
  });
});
