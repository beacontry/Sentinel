/**
 * Market regime classifier — drives the adaptive engine mode.
 *
 * Pure function: takes VIX level + SPY trend (+ optional breadth) and
 * returns a regime classification with a recommended base engine mode.
 *
 * Used by:
 *  - The engine: when `engine.mode === "adaptive"`, called at each scan
 *    boundary to pick `engine.effectiveMode` for that scan.
 *  - The backtester: when `runBacktest()` is invoked with `mode="adaptive"`
 *    and `marketContext`, called per simulated bar to pick the strategy
 *    params for that bar's exits.
 *
 * Rules (v1, intentionally simple — tunable later if needed):
 *
 *   | Condition                                                          | Regime          | Mode         |
 *   |--------------------------------------------------------------------|-----------------|--------------|
 *   | vix > 28  OR  spy < spyMA50                                        | risk_off        | conservative |
 *   | 18 < vix <= 28  AND  spy >= spyMA50  (and breadth 40-65 if present)| neutral         | moderate     |
 *   | vix <= 18  AND  spy > spyMA50  (and breadth > 65 if present)       | risk_on         | optimized    |
 *   | vix <= 14  AND  spy > spyMA200  AND breadth > 75                   | risk_on (strong)| aggressive   |
 *
 * The strong risk_on rule is evaluated FIRST so a low-vol bull regime
 * collapses cleanly to `aggressive`; if it doesn't match, we fall through
 * to the standard risk_on / neutral / risk_off ladder.
 *
 * Modes intentionally NEVER recommended by adaptive:
 *  - `intraday` — PDT-sensitive at <$25k equity. Users must opt in by name.
 *  - `tactical-smart` — already adaptive in its own way (re-ranks weekly).
 *    Users who want that algorithm pick it explicitly.
 *  - `adaptive` itself — would be a self-reference loop.
 */

import type { EngineMode } from "./trading-engine";

export interface RegimeInput {
  /** Current VIX level (e.g. 14.5, 22.3, 35.0). */
  vix: number;
  /** Current SPY price. */
  spyPrice: number;
  /** SPY 50-day simple moving average. */
  spyMA50: number;
  /** SPY 200-day SMA. Used only by the strong-risk-on rule. */
  spyMA200: number;
  /**
   * Breadth score 0-100 (% of S&P 500 above SMA-50, roughly). Omitted in
   * backtest mode because replaying historical breadth across the full
   * universe is too expensive. When omitted, breadth checks are bypassed.
   */
  breadthScore?: number;
}

/**
 * Modes the regime classifier is allowed to return. Excludes the
 * self-reference (`adaptive`) and the two opt-in-only modes.
 */
export type AdaptiveTarget = Exclude<EngineMode, "adaptive" | "intraday" | "tactical-smart">;

export interface RegimeReport {
  /** High-level regime classification. */
  regime: "risk_on" | "neutral" | "risk_off";
  /**
   * Engine mode the engine should run for this regime. Never `adaptive`,
   * `intraday`, or `tactical-smart` — see file-level docs.
   */
  recommendedMode: AdaptiveTarget;
  /** Human-readable reasons the classifier landed here. Audit-friendly. */
  reasons: string[];
}

// ─── Thresholds (centralized so tests + UI can reference) ──────────────────

export const REGIME_THRESHOLDS = {
  /** VIX above this = automatic risk_off (panic vol). */
  vixHigh: 28,
  /** VIX below this = at least risk_on candidate. */
  vixLow: 18,
  /** VIX below this AND strong trend = bump to aggressive. */
  vixVeryLow: 14,
  /** Breadth above this = risk_on confirmed. */
  breadthHigh: 65,
  /** Breadth above this = strong risk_on (with vixVeryLow → aggressive). */
  breadthVeryHigh: 75,
  /** Breadth below this with vix in neutral band = stay neutral. */
  breadthLow: 40,
} as const;

/**
 * Classify the current market regime and recommend an engine mode.
 *
 * Pure function — no I/O, no side effects, deterministic per input.
 */
export function detectMarketRegime(input: RegimeInput): RegimeReport {
  const { vix, spyPrice, spyMA50, spyMA200, breadthScore } = input;
  const t = REGIME_THRESHOLDS;

  const reasons: string[] = [];

  // ─── Risk-off triggers (most defensive, evaluated first) ───────────────
  // High vol OR broken trend → conservative immediately.
  if (vix > t.vixHigh) {
    reasons.push(`VIX ${vix.toFixed(1)} > ${t.vixHigh} (panic vol threshold)`);
    return { regime: "risk_off", recommendedMode: "conservative", reasons };
  }
  if (spyPrice < spyMA50) {
    reasons.push(`SPY ${spyPrice.toFixed(2)} below SMA50 ${spyMA50.toFixed(2)} (broken trend)`);
    return { regime: "risk_off", recommendedMode: "conservative", reasons };
  }

  // ─── Strong risk-on (evaluated before standard risk_on so it can claim) ─
  // Very low vol + above long trend + broad participation = bump to aggressive.
  // Breadth REQUIRED for this rule — without it, fall through to standard.
  if (
    vix <= t.vixVeryLow &&
    spyPrice > spyMA200 &&
    breadthScore !== undefined &&
    breadthScore > t.breadthVeryHigh
  ) {
    reasons.push(`VIX ${vix.toFixed(1)} <= ${t.vixVeryLow} (very low vol)`);
    reasons.push(`SPY ${spyPrice.toFixed(2)} > SMA200 ${spyMA200.toFixed(2)} (long-trend bull)`);
    reasons.push(`Breadth ${breadthScore} > ${t.breadthVeryHigh} (broad participation)`);
    return { regime: "risk_on", recommendedMode: "aggressive", reasons };
  }

  // ─── Standard risk-on ──────────────────────────────────────────────────
  // Low vol + above short trend → optimized (the GA-tuned base mode).
  // If breadth is present, require it above breadthHigh; if absent, the
  // VIX + SPY signal is enough on its own (backtest path).
  if (vix <= t.vixLow && spyPrice > spyMA50) {
    if (breadthScore === undefined || breadthScore > t.breadthHigh) {
      reasons.push(`VIX ${vix.toFixed(1)} <= ${t.vixLow} (low vol)`);
      reasons.push(`SPY ${spyPrice.toFixed(2)} > SMA50 ${spyMA50.toFixed(2)} (trending up)`);
      if (breadthScore !== undefined) {
        reasons.push(`Breadth ${breadthScore} > ${t.breadthHigh}`);
      }
      return { regime: "risk_on", recommendedMode: "optimized", reasons };
    }
    // Low vol + trending but narrow breadth → stay neutral
    reasons.push(`VIX low but breadth ${breadthScore} <= ${t.breadthHigh} (narrow participation)`);
  }

  // ─── Neutral fallback ──────────────────────────────────────────────────
  // VIX in the middle band, SPY at-or-above SMA50 → moderate.
  reasons.push(
    `VIX ${vix.toFixed(1)} in [${t.vixLow}, ${t.vixHigh}] (mixed vol)`,
    `SPY ${spyPrice.toFixed(2)} at-or-above SMA50 ${spyMA50.toFixed(2)}`
  );
  if (breadthScore !== undefined) {
    reasons.push(`Breadth ${breadthScore}`);
  }
  return { regime: "neutral", recommendedMode: "moderate", reasons };
}

/**
 * Convenience: format a regime report for status-banner display.
 * Returns a one-line summary like "VIX 18.2 · SPY +1.2% above SMA50 · breadth 72".
 */
export function formatRegimeSummary(input: RegimeInput): string {
  const spyAboveMa50Pct = ((input.spyPrice - input.spyMA50) / input.spyMA50) * 100;
  const parts = [
    `VIX ${input.vix.toFixed(1)}`,
    `SPY ${spyAboveMa50Pct >= 0 ? "+" : ""}${spyAboveMa50Pct.toFixed(1)}% vs SMA50`,
  ];
  if (input.breadthScore !== undefined) {
    parts.push(`breadth ${input.breadthScore}`);
  }
  return parts.join(" · ");
}
