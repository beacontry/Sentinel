/**
 * Tests for evaluateEntrySignal — the 2026-07-23 fresh-read confirmation gate.
 *
 * Motivation (admin optimized book, 2026-07): runScan previously OR'd the
 * Screener external signal into `shouldBuy` unconditionally, so a stale (up to
 * 30 min old) Screener BUY entered a symbol even when the engine's own fresh
 * re-analysis read HOLD-35% or STRONG_SELL. Those contra-signal entries then
 * bled out on trailing-stop noise (2-for-18 on trailing exits). The gate makes
 * an external signal actionable only when the fresh read does not contradict it.
 *
 * Contract:
 *   - Own fresh BUY/STRONG_BUY  → confirmed regardless of external signal
 *   - External signal + fresh bearish (SELL/STRONG_SELL) → NOT confirmed
 *   - External signal + fresh non-bearish but sub-floor confidence → NOT confirmed
 *   - External signal + fresh non-bearish + confidence ≥ floor → confirmed
 *   - No local bullish signal and no external signal → NOT confirmed
 */

import { describe, it, expect } from "vitest";
import { evaluateEntrySignal } from "@/lib/trading-engine";
import { SignalType } from "@/types";

describe("evaluateEntrySignal", () => {
  it("confirms the engine's own fresh BUY regardless of external signal", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.BUY,
      confidence: 0.4, // below floor, but the local read is itself fresh
      hasExternalSignal: false,
    });
    expect(r).toEqual({ confirmed: true, reason: "local_bullish" });
  });

  it("confirms a fresh STRONG_BUY even with no external signal", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.STRONG_BUY,
      confidence: 0.9,
      hasExternalSignal: false,
    });
    expect(r.confirmed).toBe(true);
    expect(r.reason).toBe("local_bullish");
  });

  it("VETOES a stale external BUY when the fresh read is STRONG_SELL", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.STRONG_SELL,
      confidence: 0.8,
      hasExternalSignal: true,
    });
    expect(r).toEqual({ confirmed: false, reason: "fresh_read_bearish" });
  });

  it("VETOES a stale external BUY when the fresh read is SELL", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.SELL,
      confidence: 0.9,
      hasExternalSignal: true,
    });
    expect(r).toEqual({ confirmed: false, reason: "fresh_read_bearish" });
  });

  it("VETOES a stale external BUY when the fresh HOLD is below the confidence floor", () => {
    // The exact HOLD-35% case from the admin book.
    const r = evaluateEntrySignal({
      localSignal: SignalType.HOLD,
      confidence: 0.35,
      hasExternalSignal: true,
    });
    expect(r).toEqual({ confirmed: false, reason: "confidence_below_floor" });
  });

  it("confirms an external signal when the fresh HOLD clears the floor", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.HOLD,
      confidence: 0.6,
      hasExternalSignal: true,
    });
    expect(r).toEqual({ confirmed: true, reason: "external_confirmed" });
  });

  it("treats exactly-at-floor confidence as confirmed (inclusive boundary)", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.HOLD,
      confidence: 0.55,
      hasExternalSignal: true,
      confidenceFloor: 0.55,
    });
    expect(r.confirmed).toBe(true);
  });

  it("respects a custom confidence floor", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.HOLD,
      confidence: 0.6,
      hasExternalSignal: true,
      confidenceFloor: 0.7,
    });
    expect(r).toEqual({ confirmed: false, reason: "confidence_below_floor" });
  });

  it("does not buy when there is neither a local bullish signal nor an external signal", () => {
    const r = evaluateEntrySignal({
      localSignal: SignalType.HOLD,
      confidence: 0.9,
      hasExternalSignal: false,
    });
    expect(r).toEqual({ confirmed: false, reason: "no_signal" });
  });
});
