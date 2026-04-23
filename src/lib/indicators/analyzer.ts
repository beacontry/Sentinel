import type { Bar, AnalysisResult, IndicatorSnapshot, IndicatorSeries, SignalType } from "@/types";
import { INDICATOR_DEFAULTS, SIGNAL_CONFIG } from "../config";
import { SMA } from "./sma";
import { EMA } from "./ema";
import { VWAP } from "./vwap";
import { RSI } from "./rsi";
import { MACD } from "./macd";
import { ATR } from "./atr";
import { BollingerBands } from "./bollinger";
import { calculateFibLevels } from "./fibonacci";
import { translateSignal } from "../signal-translator";

// ── Tunable signal params (optimizer can override defaults) ─────────

export interface SignalParams {
  emaFast: number;       // default 9
  emaSlow: number;       // default 21
  rsiOversold: number;   // default 30
  rsiOverbought: number; // default 70
}

const DEFAULT_SIGNAL_PARAMS: SignalParams = {
  emaFast: INDICATOR_DEFAULTS.ema.windows[0],   // 9
  emaSlow: INDICATOR_DEFAULTS.ema.windows[1],    // 21
  rsiOversold: 30,
  rsiOverbought: 70,
};

// ── Indicator instances ─────────────────────────────────────────────

interface SymbolIndicators {
  sma9: SMA;
  sma20: SMA;
  sma50: SMA;
  emaFast: EMA;
  emaSlow: EMA;
  ema50: EMA;
  vwap: VWAP;
  rsi: RSI;
  macd: MACD;
  atr: ATR;
  bollinger: BollingerBands;
  volumeHistory: number[];
}

function createIndicators(sp?: SignalParams): SymbolIndicators {
  const p = sp ?? DEFAULT_SIGNAL_PARAMS;
  return {
    sma9: new SMA(INDICATOR_DEFAULTS.sma.windows[0]),
    sma20: new SMA(INDICATOR_DEFAULTS.sma.windows[1]),
    sma50: new SMA(INDICATOR_DEFAULTS.sma.windows[2]),
    emaFast: new EMA(p.emaFast),
    emaSlow: new EMA(p.emaSlow),
    ema50: new EMA(INDICATOR_DEFAULTS.ema.windows[2]),
    vwap: new VWAP(),
    rsi: new RSI(INDICATOR_DEFAULTS.rsi.period),
    macd: new MACD(
      INDICATOR_DEFAULTS.macd.fast,
      INDICATOR_DEFAULTS.macd.slow,
      INDICATOR_DEFAULTS.macd.signal
    ),
    atr: new ATR(14),
    bollinger: new BollingerBands(20),
    volumeHistory: [],
  };
}

function detectCrossover(
  fastHistory: number[],
  slowHistory: number[],
  lookback: number
): boolean {
  const minLen = Math.min(fastHistory.length, slowHistory.length);
  if (minLen < 2) return false;

  const start = Math.max(0, minLen - lookback - 1);
  for (let i = start; i < minLen - 1; i++) {
    if (fastHistory[i] <= slowHistory[i] && fastHistory[i + 1] > slowHistory[i + 1]) {
      return true;
    }
  }
  return false;
}

function detectCrossunder(
  fastHistory: number[],
  slowHistory: number[],
  lookback: number
): boolean {
  const minLen = Math.min(fastHistory.length, slowHistory.length);
  if (minLen < 2) return false;

  const start = Math.max(0, minLen - lookback - 1);
  for (let i = start; i < minLen - 1; i++) {
    if (fastHistory[i] >= slowHistory[i] && fastHistory[i + 1] < slowHistory[i + 1]) {
      return true;
    }
  }
  return false;
}

function evaluateSignal(
  price: number,
  volume: number,
  ind: SymbolIndicators,
  sp?: SignalParams
): { signal: SignalType; confidence: number; reasons: string[] } {
  const p = sp ?? DEFAULT_SIGNAL_PARAMS;
  const reasons: string[] = [];
  let bullScore = 0;
  let bearScore = 0;

  const vwap = ind.vwap.value();
  const ema9 = ind.emaFast.value();
  const ema21 = ind.emaSlow.value();
  const sma20 = ind.sma20.value();
  const sma50 = ind.sma50.value();
  const rsi = ind.rsi.value();
  const macdVals = ind.macd.values();

  // VWAP positioning
  if (vwap !== null) {
    if (price > vwap) {
      bullScore++;
      reasons.push("Price above VWAP (bullish positioning)");
    } else {
      bearScore++;
      reasons.push("Price below VWAP (bearish positioning)");
    }
  }

  // EMA trend
  if (ema9 !== null && ema21 !== null) {
    if (ema9 > ema21) {
      bullScore++;
      reasons.push("Short-term EMA above long-term EMA (uptrend)");
    } else {
      bearScore++;
      reasons.push("Short-term EMA below long-term EMA (downtrend)");
    }
  }

  // Price vs SMA 20
  if (sma20 !== null) {
    if (price > sma20) {
      bullScore++;
      reasons.push("Price above 20-period SMA (medium-term bullish)");
    } else {
      bearScore++;
      reasons.push("Price below 20-period SMA (medium-term bearish)");
    }
  }

  // Fresh crossover
  const ema9Hist = ind.emaFast.history();
  const ema21Hist = ind.emaSlow.history();
  const hasBullCross = detectCrossover(
    ema9Hist,
    ema21Hist,
    SIGNAL_CONFIG.crossoverLookback
  );
  const hasBearCross = detectCrossunder(
    ema9Hist,
    ema21Hist,
    SIGNAL_CONFIG.crossoverLookback
  );

  if (hasBullCross) {
    bullScore++;
    reasons.push("Fresh bullish EMA crossover detected");
  }
  if (hasBearCross) {
    bearScore++;
    reasons.push("Fresh bearish EMA crossover detected");
  }

  // RSI
  if (rsi !== null) {
    if (rsi < p.rsiOversold) {
      bullScore += 2;
      reasons.push(`RSI oversold at ${rsi.toFixed(1)} (potential reversal up)`);
    } else if (rsi > p.rsiOverbought) {
      bearScore += 2;
      reasons.push(`RSI overbought at ${rsi.toFixed(1)} (potential reversal down)`);
    } else if (rsi > 55) {
      bullScore++;
      reasons.push(`RSI at ${rsi.toFixed(1)} (bullish momentum)`);
    } else if (rsi < 45) {
      bearScore++;
      reasons.push(`RSI at ${rsi.toFixed(1)} (bearish momentum)`);
    } else {
      reasons.push(`RSI at ${rsi.toFixed(1)} (neutral)`);
    }
  }

  // MACD
  if (macdVals.histogram !== null) {
    if (macdVals.histogram > 0) {
      bullScore++;
      reasons.push("MACD histogram positive (bullish momentum)");
    } else {
      bearScore++;
      reasons.push("MACD histogram negative (bearish momentum)");
    }
  }

  // Volume confirmation
  const avgVolume =
    ind.volumeHistory.length >= SIGNAL_CONFIG.volumeAvgWindow
      ? ind.volumeHistory
          .slice(-SIGNAL_CONFIG.volumeAvgWindow)
          .reduce((a, b) => a + b, 0) / SIGNAL_CONFIG.volumeAvgWindow
      : null;

  const volumeConfirmed =
    avgVolume !== null &&
    volume > avgVolume * SIGNAL_CONFIG.volumeConfirmationMultiplier;

  if (volumeConfirmed) {
    reasons.push(
      `Volume ${((volume / avgVolume!) * 100).toFixed(0)}% of average (confirmed)`
    );
  }

  // SMA 50 alignment
  const sma50Aligned =
    sma50 !== null &&
    ((bullScore > bearScore && price > sma50) ||
      (bearScore > bullScore && price < sma50));

  // Determine signal
  let signal: SignalType;
  let confidence: number;
  const totalSignals = bullScore + bearScore;
  const dominance = totalSignals > 0 ? Math.abs(bullScore - bearScore) / totalSignals : 0;

  if (bullScore >= 4 && bullScore > bearScore + 2) {
    if (volumeConfirmed && sma50Aligned) {
      signal = "STRONG_BUY" as SignalType;
      confidence = Math.min(0.95, 0.75 + dominance * 0.2);
      reasons.push("Strong buy: volume confirmed with SMA 50 alignment");
    } else {
      signal = "BUY" as SignalType;
      confidence = Math.min(0.85, 0.55 + dominance * 0.25);
    }
  } else if (bearScore >= 4 && bearScore > bullScore + 2) {
    if (volumeConfirmed && sma50Aligned) {
      signal = "STRONG_SELL" as SignalType;
      confidence = Math.min(0.95, 0.75 + dominance * 0.2);
      reasons.push("Strong sell: volume confirmed with SMA 50 alignment");
    } else {
      signal = "SELL" as SignalType;
      confidence = Math.min(0.85, 0.55 + dominance * 0.25);
    }
  } else {
    signal = "HOLD" as SignalType;
    confidence = Math.max(0.2, Math.min(0.55, 0.5 - dominance * 0.3));
  }

  return { signal, confidence, reasons };
}

export function analyzeBars(symbol: string, bars: Bar[], signalParams?: SignalParams): AnalysisResult {
  const ind = createIndicators(signalParams);

  const series: IndicatorSeries = {
    sma_9: [],
    sma_20: [],
    sma_50: [],
    ema_9: [],
    ema_21: [],
    ema_50: [],
    vwap: [],
    rsi_14: [],
    macd_line: [],
    macd_signal: [],
    macd_histogram: [],
    atr_14: [],
    bollinger_upper: [],
    bollinger_middle: [],
    bollinger_lower: [],
  };

  for (const bar of bars) {
    ind.sma9.update(bar);
    ind.sma20.update(bar);
    ind.sma50.update(bar);
    ind.emaFast.update(bar);
    ind.emaSlow.update(bar);
    ind.ema50.update(bar);
    ind.vwap.update(bar);
    ind.rsi.update(bar);
    ind.macd.update(bar);
    ind.atr.update(bar);
    ind.bollinger.update(bar);
    // Only track non-zero volumes (zero = incomplete/after-hours bar)
    if (bar.volume > 0) {
      ind.volumeHistory.push(bar.volume);
      if (ind.volumeHistory.length > 100) {
        ind.volumeHistory.shift();
      }
    }

    // Record indicator values at each bar
    series.sma_9.push(ind.sma9.value());
    series.sma_20.push(ind.sma20.value());
    series.sma_50.push(ind.sma50.value());
    series.ema_9.push(ind.emaFast.value());
    series.ema_21.push(ind.emaSlow.value());
    series.ema_50.push(ind.ema50.value());
    series.vwap.push(ind.vwap.value());
    series.rsi_14.push(ind.rsi.value());
    const mv = ind.macd.values();
    series.macd_line.push(mv.macdLine);
    series.macd_signal.push(mv.signalLine);
    series.macd_histogram.push(mv.histogram);
    series.atr_14.push(ind.atr.value());
    series.bollinger_upper.push(ind.bollinger.upperBand(2));
    series.bollinger_middle.push(ind.bollinger.value());
    series.bollinger_lower.push(ind.bollinger.lowerBand(2));
  }

  const lastBar = bars[bars.length - 1];
  const price = lastBar.close;
  const volume = lastBar.volume;

  const { signal, confidence, reasons } = evaluateSignal(price, volume, ind, signalParams);

  const macdVals = ind.macd.values();
  const indicators: IndicatorSnapshot = {
    sma_9: ind.sma9.value(),
    sma_20: ind.sma20.value(),
    sma_50: ind.sma50.value(),
    ema_9: ind.emaFast.value(),
    ema_21: ind.emaSlow.value(),
    ema_50: ind.ema50.value(),
    vwap: ind.vwap.value(),
    vwap_upper_1: ind.vwap.upperBand(1),
    vwap_lower_1: ind.vwap.lowerBand(1),
    rsi_14: ind.rsi.value(),
    macd_line: macdVals.macdLine,
    macd_signal: macdVals.signalLine,
    macd_histogram: macdVals.histogram,
    atr_14: ind.atr.value(),
    bollinger_upper: ind.bollinger.upperBand(2),
    bollinger_middle: ind.bollinger.value(),
    bollinger_lower: ind.bollinger.lowerBand(2),
  };

  // Unusual volume detection (skip when last bar has 0 volume — incomplete data)
  const avgVolume =
    ind.volumeHistory.length >= SIGNAL_CONFIG.volumeAvgWindow
      ? ind.volumeHistory
          .slice(-SIGNAL_CONFIG.volumeAvgWindow)
          .reduce((a, b) => a + b, 0) / SIGNAL_CONFIG.volumeAvgWindow
      : null;
  const volumeRatio = avgVolume && volume > 0 ? volume / avgVolume : undefined;
  const unusualVolume = volumeRatio !== undefined && volumeRatio >= 3.0;

  // Fibonacci retracement levels
  const fibonacci = calculateFibLevels(bars);

  return {
    symbol,
    signal,
    confidence,
    price,
    volume,
    indicators,
    series,
    bars,
    reasons,
    plainEnglish: translateSignal(symbol, signal, confidence, price, reasons),
    timestamp: new Date().toISOString(),
    fibonacci: fibonacci ?? undefined,
    unusualVolume,
    volumeRatio,
  };
}

/**
 * Lightweight signal-only evaluation — same logic as analyzeBars() but skips
 * series building, fibonacci, reasons, and plainEnglish. Used by the optimizer
 * backtester where only the signal matters and performance is critical.
 */
export function analyzeSignalOnly(
  symbol: string,
  bars: Bar[],
  signalParams?: SignalParams
): { signal: SignalType; confidence: number } {
  const ind = createIndicators(signalParams);

  for (const bar of bars) {
    ind.sma9.update(bar);
    ind.sma20.update(bar);
    ind.sma50.update(bar);
    ind.emaFast.update(bar);
    ind.emaSlow.update(bar);
    ind.ema50.update(bar);
    ind.vwap.update(bar);
    ind.rsi.update(bar);
    ind.macd.update(bar);
    if (bar.volume > 0) {
      ind.volumeHistory.push(bar.volume);
      if (ind.volumeHistory.length > 100) ind.volumeHistory.shift();
    }
  }

  const lastBar = bars[bars.length - 1];
  const { signal, confidence } = evaluateSignal(lastBar.close, lastBar.volume, ind, signalParams);
  return { signal, confidence };
}
