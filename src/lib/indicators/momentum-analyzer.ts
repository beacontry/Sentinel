import type { Bar } from "@/types";
import { SignalType } from "@/types";
import { EMA } from "./ema";
import { VWAP } from "./vwap";
import { RSI } from "./rsi";
import { ATR } from "./atr";

// ── Configuration ───────────────────────────────────────────────────
//
// Tuned for small-cap momentum (Ross / Warrior-style bull-flag breakouts)
// on 1-minute bars. Caller is responsible for passing session-scoped bars
// so VWAP and the impulse window are intraday-meaningful.

export interface MomentumParams {
  /** Minimum impulse magnitude (fraction). 2% on a $5 stock = $0.10 leg. */
  minImpulsePct: number;
  /** Consolidation range / impulse magnitude. 0.5 = pullback held half the impulse. */
  maxTightness: number;
  /** Breakout-bar volume multiple of avg consolidation volume. */
  minVolumeSurge: number;
  /** Bars of consolidation to search for. */
  consolidationMinBars: number;
  consolidationMaxBars: number;
  /** Bars before consolidation to scan for the impulse. */
  impulseLookback: number;
  /** RSI sweet spot — below = no momentum; above = exhausted, don't chase. */
  rsiMin: number;
  rsiMax: number;
}

export const DEFAULT_MOMENTUM_PARAMS: MomentumParams = {
  minImpulsePct: 0.02,
  maxTightness: 0.5,
  minVolumeSurge: 1.5,
  consolidationMinBars: 3,
  consolidationMaxBars: 8,
  impulseLookback: 10,
  rsiMin: 50,
  rsiMax: 80,
};

const MIN_BARS_FOR_ANALYSIS = 20;

// ── Result shape ────────────────────────────────────────────────────

export interface BullFlagDetection {
  /** Number of consolidation bars before the breakout. */
  consolidationLength: number;
  /** Highest high during consolidation — what the breakout bar crossed. */
  consolidationHigh: number;
  /** Lowest low during consolidation — the natural stop. */
  consolidationLow: number;
  /** Impulse magnitude as a fraction of impulse-low price. */
  impulsePct: number;
  /** Consolidation range / impulse magnitude. Lower = tighter flag. */
  tightness: number;
  /** Current-bar volume / avg consolidation volume. */
  volumeMultiple: number;
  /** True when volumeMultiple >= params.minVolumeSurge. */
  volumeSurge: boolean;
  /** Price the breakout closed at. */
  breakoutPrice: number;
}

export interface MomentumAnalysisResult {
  symbol: string;
  signal: SignalType;
  confidence: number;
  price: number;
  volume: number;
  /** Suggested stop = consolidation low when a flag is detected, else null. */
  suggestedStop: number | null;
  /** Detected bull-flag setup, or null if no clean pattern. */
  pattern: BullFlagDetection | null;
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
  atr: number | null;
  reasons: string[];
  timestamp: string;
}

// ── Pattern detection ───────────────────────────────────────────────

function detectBullFlag(
  bars: Bar[],
  params: MomentumParams
): BullFlagDetection | null {
  const n = bars.length;
  const current = bars[n - 1];

  // Try each consolidation length; take the first valid setup that breaks out.
  for (
    let k = params.consolidationMinBars;
    k <= params.consolidationMaxBars;
    k++
  ) {
    // Need k consolidation bars + at least 2 impulse bars.
    if (n < k + 3) continue;

    const consStart = n - 1 - k;
    const consolidation = bars.slice(consStart, n - 1);
    const consHigh = Math.max(...consolidation.map((b) => b.high));
    const consLow = Math.min(...consolidation.map((b) => b.low));
    const consRange = consHigh - consLow;
    if (consRange <= 0) continue;

    // Breakout requirement: current bar closes above consolidation high.
    if (current.close <= consHigh) continue;

    // Impulse window: up to `impulseLookback` bars before consolidation.
    const impulseStart = Math.max(0, consStart - params.impulseLookback);
    const impulseBars = bars.slice(impulseStart, consStart);
    if (impulseBars.length < 2) continue;

    const impulseLow = Math.min(...impulseBars.map((b) => b.low));
    if (impulseLow <= 0) continue;
    const impulseMagnitude = consHigh - impulseLow;
    if (impulseMagnitude <= 0) continue;
    const impulsePct = impulseMagnitude / impulseLow;
    if (impulsePct < params.minImpulsePct) continue;

    const tightness = consRange / impulseMagnitude;
    if (tightness > params.maxTightness) continue;

    // A zero-volume consolidation (halted/illiquid base) must NOT auto-confirm
    // the breakout. The old `/ k || 1` substituted 1 share, fabricating a huge
    // volumeMultiple (audit #70). Require a real positive average.
    const avgConsVol = consolidation.reduce((s, b) => s + b.volume, 0) / k;
    const volumeMultiple = avgConsVol > 0 ? current.volume / avgConsVol : 0;
    const volumeSurge = avgConsVol > 0 && volumeMultiple >= params.minVolumeSurge;

    return {
      consolidationLength: k,
      consolidationHigh: consHigh,
      consolidationLow: consLow,
      impulsePct,
      tightness,
      volumeMultiple,
      volumeSurge,
      breakoutPrice: current.close,
    };
  }

  return null;
}

// ── Main analyzer ───────────────────────────────────────────────────

export function analyzeMomentumBars(
  symbol: string,
  bars: Bar[],
  params: MomentumParams = DEFAULT_MOMENTUM_PARAMS
): MomentumAnalysisResult {
  const timestamp = new Date().toISOString();
  const reasons: string[] = [];

  if (bars.length < MIN_BARS_FOR_ANALYSIS) {
    return {
      symbol,
      signal: SignalType.HOLD,
      confidence: 0.2,
      price: bars[bars.length - 1]?.close ?? 0,
      volume: bars[bars.length - 1]?.volume ?? 0,
      suggestedStop: null,
      pattern: null,
      vwap: null,
      ema9: null,
      ema21: null,
      rsi: null,
      atr: null,
      reasons: [`Insufficient bars (${bars.length} < ${MIN_BARS_FOR_ANALYSIS})`],
      timestamp,
    };
  }

  const ema9 = new EMA(9);
  const ema21 = new EMA(21);
  const vwap = new VWAP();
  const rsi = new RSI(14);
  const atr = new ATR(14);

  for (const bar of bars) {
    ema9.update(bar);
    ema21.update(bar);
    vwap.update(bar);
    rsi.update(bar);
    atr.update(bar);
  }

  const last = bars[bars.length - 1];
  const price = last.close;
  const volume = last.volume;
  const vwapVal = vwap.value();
  const ema9Val = ema9.value();
  const ema21Val = ema21.value();
  const rsiVal = rsi.value();
  const atrVal = atr.value();

  // Preconditions — cheapest gates first.
  let preconditionsOk = true;

  if (vwapVal !== null) {
    if (price > vwapVal) {
      reasons.push("Price above VWAP (bullish session positioning)");
    } else {
      reasons.push("Price below VWAP — momentum setup invalid");
      preconditionsOk = false;
    }
  }

  if (ema9Val !== null) {
    if (price > ema9Val) {
      reasons.push("Price riding 9 EMA (trend intact)");
    } else {
      reasons.push("Price below 9 EMA — short-term trend broken");
      preconditionsOk = false;
    }
  }

  if (rsiVal !== null) {
    if (rsiVal < params.rsiMin) {
      reasons.push(`RSI ${rsiVal.toFixed(1)} below ${params.rsiMin} — no momentum`);
      preconditionsOk = false;
    } else if (rsiVal > params.rsiMax) {
      reasons.push(
        `RSI ${rsiVal.toFixed(1)} above ${params.rsiMax} — exhausted, don't chase`
      );
      preconditionsOk = false;
    } else {
      reasons.push(`RSI ${rsiVal.toFixed(1)} in momentum sweet spot`);
    }
  }

  if (!preconditionsOk) {
    return {
      symbol,
      signal: SignalType.HOLD,
      confidence: 0.25,
      price,
      volume,
      suggestedStop: null,
      pattern: null,
      vwap: vwapVal,
      ema9: ema9Val,
      ema21: ema21Val,
      rsi: rsiVal,
      atr: atrVal,
      reasons,
      timestamp,
    };
  }

  const pattern = detectBullFlag(bars, params);

  if (pattern === null) {
    reasons.push("No bull-flag breakout detected on current bar");
    return {
      symbol,
      signal: SignalType.HOLD,
      confidence: 0.35,
      price,
      volume,
      suggestedStop: null,
      pattern: null,
      vwap: vwapVal,
      ema9: ema9Val,
      ema21: ema21Val,
      rsi: rsiVal,
      atr: atrVal,
      reasons,
      timestamp,
    };
  }

  reasons.push(
    `Bull flag: ${pattern.consolidationLength}-bar consolidation after ${(
      pattern.impulsePct * 100
    ).toFixed(1)}% impulse, tightness ${pattern.tightness.toFixed(2)}`
  );
  reasons.push(
    `Breakout at $${pattern.breakoutPrice.toFixed(
      2
    )} above flag high $${pattern.consolidationHigh.toFixed(2)}`
  );

  if (pattern.volumeSurge) {
    reasons.push(
      `Volume ${pattern.volumeMultiple.toFixed(1)}× consolidation avg (confirmed)`
    );
  } else {
    reasons.push(
      `Volume ${pattern.volumeMultiple.toFixed(1)}× consolidation avg — below ${
        params.minVolumeSurge
      }× threshold (unconfirmed)`
    );
  }

  // Without volume the breakout is a fake — momentum needs the surge.
  if (!pattern.volumeSurge) {
    return {
      symbol,
      signal: SignalType.HOLD,
      confidence: 0.4,
      price,
      volume,
      suggestedStop: pattern.consolidationLow,
      pattern,
      vwap: vwapVal,
      ema9: ema9Val,
      ema21: ema21Val,
      rsi: rsiVal,
      atr: atrVal,
      reasons,
      timestamp,
    };
  }

  // Score the confirmed setup. Tighter flag + bigger impulse + bigger volume =
  // stronger. The hardcoded ceilings (0.05 impulse, 3× volume) can fall at or
  // below a tuned min, making the denominator <= 0 → NaN/Infinity/negative
  // sub-scores (audit #69). Floor each denominator positive and clamp every
  // sub-score to [0,1].
  const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
  const tightnessScore = clamp01(1 - pattern.tightness / params.maxTightness);
  const impulseCeil = Math.max(params.minImpulsePct + 1e-6, 0.05);
  const impulseScore = clamp01(
    (pattern.impulsePct - params.minImpulsePct) / (impulseCeil - params.minImpulsePct)
  );
  const volumeCeil = Math.max(params.minVolumeSurge + 1e-6, 3);
  const volumeScore = clamp01(
    (pattern.volumeMultiple - params.minVolumeSurge) / (volumeCeil - params.minVolumeSurge)
  );
  const compositeScore =
    tightnessScore * 0.35 + impulseScore * 0.3 + volumeScore * 0.35;

  let signal: SignalType;
  let confidence: number;
  if (compositeScore >= 0.6) {
    signal = SignalType.STRONG_BUY;
    confidence = Math.min(0.95, 0.75 + compositeScore * 0.2);
    reasons.push("Strong setup: tight flag, sized impulse, confirmed volume");
  } else {
    signal = SignalType.BUY;
    confidence = Math.min(0.85, 0.55 + compositeScore * 0.25);
  }

  return {
    symbol,
    signal,
    confidence,
    price,
    volume,
    suggestedStop: pattern.consolidationLow,
    pattern,
    vwap: vwapVal,
    ema9: ema9Val,
    ema21: ema21Val,
    rsi: rsiVal,
    atr: atrVal,
    reasons,
    timestamp,
  };
}
