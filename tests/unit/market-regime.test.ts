/**
 * Unit tests for src/lib/market-regime.ts — the adaptive-mode classifier.
 *
 * Covers all 4 rules + threshold edges + breadth-absent path + the never-
 * recommend-these-modes invariant.
 */

import { describe, it, expect } from "vitest";
import {
  detectMarketRegime,
  formatRegimeSummary,
  REGIME_THRESHOLDS,
} from "@/lib/market-regime";

describe("detectMarketRegime", () => {
  // ─── Risk-off triggers ─────────────────────────────────────────────────

  describe("risk_off (panic vol)", () => {
    it("returns conservative when VIX exceeds the panic threshold", () => {
      const r = detectMarketRegime({
        vix: 30,
        spyPrice: 450,
        spyMA50: 440,
        spyMA200: 420,
        breadthScore: 80,
      });
      expect(r.regime).toBe("risk_off");
      expect(r.recommendedMode).toBe("conservative");
      expect(r.reasons[0]).toMatch(/VIX.*>.*28/);
    });

    it("returns conservative when SPY drops below SMA50 even with low vix", () => {
      const r = detectMarketRegime({
        vix: 12,
        spyPrice: 430,
        spyMA50: 440,
        spyMA200: 420,
        breadthScore: 60,
      });
      expect(r.regime).toBe("risk_off");
      expect(r.recommendedMode).toBe("conservative");
      expect(r.reasons[0]).toMatch(/below SMA50/);
    });

    it("VIX exactly at the panic threshold (28) is NOT risk_off (rule is strict >)", () => {
      const r = detectMarketRegime({
        vix: 28,
        spyPrice: 450,
        spyMA50: 440,
        spyMA200: 420,
        breadthScore: 60,
      });
      expect(r.regime).not.toBe("risk_off");
    });
  });

  // ─── Strong risk_on → aggressive ──────────────────────────────────────

  describe("risk_on (strong) → aggressive", () => {
    it("returns aggressive when VIX very low + SPY > SMA200 + breadth very high", () => {
      const r = detectMarketRegime({
        vix: 12,
        spyPrice: 470,
        spyMA50: 450,
        spyMA200: 420,
        breadthScore: 80,
      });
      expect(r.regime).toBe("risk_on");
      expect(r.recommendedMode).toBe("aggressive");
      expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    });

    it("requires breadth to bump to aggressive — without it, falls through to optimized", () => {
      const r = detectMarketRegime({
        vix: 12,
        spyPrice: 470,
        spyMA50: 450,
        spyMA200: 420,
        // breadthScore omitted (backtest path)
      });
      expect(r.recommendedMode).toBe("optimized");
    });

    it("stays at optimized when VIX low but breadth merely high (not very high)", () => {
      const r = detectMarketRegime({
        vix: 12,
        spyPrice: 470,
        spyMA50: 450,
        spyMA200: 420,
        breadthScore: 70, // > breadthHigh but <= breadthVeryHigh
      });
      expect(r.recommendedMode).toBe("optimized");
    });
  });

  // ─── Standard risk_on → optimized ─────────────────────────────────────

  describe("risk_on → optimized", () => {
    it("returns optimized when low vol + SPY trending + high breadth", () => {
      const r = detectMarketRegime({
        vix: 16,
        spyPrice: 460,
        spyMA50: 450,
        spyMA200: 430,
        breadthScore: 70,
      });
      expect(r.regime).toBe("risk_on");
      expect(r.recommendedMode).toBe("optimized");
    });

    it("returns optimized when breadth is absent (backtest path)", () => {
      const r = detectMarketRegime({
        vix: 16,
        spyPrice: 460,
        spyMA50: 450,
        spyMA200: 430,
      });
      expect(r.regime).toBe("risk_on");
      expect(r.recommendedMode).toBe("optimized");
    });

    it("downgrades to moderate when low vol but narrow breadth (live mode only)", () => {
      const r = detectMarketRegime({
        vix: 16,
        spyPrice: 460,
        spyMA50: 450,
        spyMA200: 430,
        breadthScore: 50, // below breadthHigh
      });
      expect(r.recommendedMode).toBe("moderate");
    });

    it("VIX exactly at the low threshold (18) qualifies for risk_on (rule is <=)", () => {
      const r = detectMarketRegime({
        vix: 18,
        spyPrice: 460,
        spyMA50: 450,
        spyMA200: 430,
      });
      expect(r.recommendedMode).toBe("optimized");
    });
  });

  // ─── Neutral → moderate ───────────────────────────────────────────────

  describe("neutral → moderate", () => {
    it("returns moderate when VIX is in the middle band and SPY is just above SMA50", () => {
      const r = detectMarketRegime({
        vix: 22,
        spyPrice: 445,
        spyMA50: 442,
        spyMA200: 430,
        breadthScore: 55,
      });
      expect(r.regime).toBe("neutral");
      expect(r.recommendedMode).toBe("moderate");
    });

    it("returns moderate when SPY equals SMA50 exactly (boundary case)", () => {
      const r = detectMarketRegime({
        vix: 22,
        spyPrice: 442,
        spyMA50: 442,
        spyMA200: 430,
      });
      expect(r.regime).toBe("neutral");
    });
  });

  // ─── Invariants ────────────────────────────────────────────────────────

  describe("invariants", () => {
    it("never recommends adaptive, intraday, or tactical-smart", () => {
      // Test a spread of inputs and verify no excluded mode ever surfaces.
      const cases: Array<{ vix: number; spyPrice: number; spyMA50: number; spyMA200: number; breadthScore?: number }> = [
        { vix: 8,  spyPrice: 500, spyMA50: 440, spyMA200: 400, breadthScore: 90 },
        { vix: 14, spyPrice: 460, spyMA50: 450, spyMA200: 420, breadthScore: 75 },
        { vix: 18, spyPrice: 455, spyMA50: 450, spyMA200: 420 },
        { vix: 22, spyPrice: 445, spyMA50: 442, spyMA200: 420, breadthScore: 50 },
        { vix: 28, spyPrice: 445, spyMA50: 442, spyMA200: 420 },
        { vix: 40, spyPrice: 380, spyMA50: 440, spyMA200: 420, breadthScore: 10 },
      ];

      for (const input of cases) {
        const r = detectMarketRegime(input);
        expect(["conservative", "moderate", "optimized", "aggressive", "tactical"]).toContain(r.recommendedMode);
        expect(r.recommendedMode).not.toBe("adaptive");
        expect(r.recommendedMode).not.toBe("intraday");
        expect(r.recommendedMode).not.toBe("tactical-smart");
      }
    });

    it("always returns at least one reason", () => {
      const r = detectMarketRegime({
        vix: 20,
        spyPrice: 450,
        spyMA50: 445,
        spyMA200: 430,
      });
      expect(r.reasons.length).toBeGreaterThan(0);
    });

    it("threshold constants are exposed for UI consumption", () => {
      expect(REGIME_THRESHOLDS.vixHigh).toBe(28);
      expect(REGIME_THRESHOLDS.vixLow).toBe(18);
      expect(REGIME_THRESHOLDS.vixVeryLow).toBe(14);
    });
  });
});

describe("formatRegimeSummary", () => {
  it("formats a concise one-line summary with VIX + SPY-vs-SMA50 + breadth", () => {
    const s = formatRegimeSummary({
      vix: 18.2,
      spyPrice: 460,
      spyMA50: 450,
      spyMA200: 430,
      breadthScore: 72,
    });
    expect(s).toMatch(/VIX 18\.2/);
    expect(s).toMatch(/SPY \+2\.2% vs SMA50/);
    expect(s).toMatch(/breadth 72/);
  });

  it("omits the breadth portion when breadth is absent", () => {
    const s = formatRegimeSummary({
      vix: 18.2,
      spyPrice: 460,
      spyMA50: 450,
      spyMA200: 430,
    });
    expect(s).toMatch(/VIX/);
    expect(s).toMatch(/SPY/);
    expect(s).not.toMatch(/breadth/);
  });

  it("renders negative SPY-vs-SMA50 deltas with the minus sign", () => {
    const s = formatRegimeSummary({
      vix: 20,
      spyPrice: 440,
      spyMA50: 450,
      spyMA200: 430,
    });
    expect(s).toMatch(/SPY -2\.2% vs SMA50/);
  });
});
