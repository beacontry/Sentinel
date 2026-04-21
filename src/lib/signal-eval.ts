/**
 * Shared signal evaluation — used by both the optimizer and compare route.
 * Accepts tunable params (EMA periods, RSI thresholds) so the same signal
 * logic runs everywhere.
 */

import type { Bar } from "@/types";

export interface SignalParams {
  emaFast: number;
  emaSlow: number;
  rsiOversold: number;
  rsiOverbought: number;
}

export type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

const DEFAULT_SIGNAL_PARAMS: SignalParams = {
  emaFast: 9,
  emaSlow: 21,
  rsiOversold: 30,
  rsiOverbought: 70,
};

export function evaluateBarSignal(bars: Bar[], params?: Partial<SignalParams>): SignalType {
  const p = { ...DEFAULT_SIGNAL_PARAMS, ...params };
  if (bars.length < 50) return "HOLD";

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const price = closes[closes.length - 1];
  const volume = volumes[volumes.length - 1];
  let bull = 0, bear = 0;

  const emaF = ema(closes, p.emaFast), emaS = ema(closes, p.emaSlow);
  if (emaF !== null && emaS !== null) {
    if (emaF > emaS) bull++; else bear++;
    const pF = ema(closes.slice(0, -1), p.emaFast), pS = ema(closes.slice(0, -1), p.emaSlow);
    if (pF !== null && pS !== null) {
      if (pF <= pS && emaF > emaS) bull++;
      if (pF >= pS && emaF < emaS) bear++;
    }
  }

  const r = rsi(closes, 14);
  if (r !== null) {
    if (r < p.rsiOversold) bull += 2;
    else if (r > p.rsiOverbought) bear += 2;
    else if (r > 55) bull++;
    else if (r < 45) bear++;
  }

  const s20 = sma(closes, 20);
  if (s20 !== null) { if (price > s20) bull++; else bear++; }

  const s50 = sma(closes, 50);
  const aligned = s50 !== null && ((bull > bear && price > s50) || (bear > bull && price < s50));

  const mh = macdHist(closes);
  if (mh !== null) { if (mh > 0) bull++; else bear++; }

  const av = volumes.length >= 20 ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
  const volConf = av !== null && volume > av * 1.5;

  if (bull >= 4 && bull > bear + 2) return volConf && aligned ? "STRONG_BUY" : "BUY";
  if (bear >= 4 && bear > bull + 2) return volConf && aligned ? "STRONG_SELL" : "SELL";
  return "HOLD";
}

export function sma(d: number[], p: number): number | null {
  if (d.length < p) return null;
  let s = 0; for (let i = d.length - p; i < d.length; i++) s += d[i]; return s / p;
}

export function ema(d: number[], p: number): number | null {
  if (d.length < p) return null;
  const k = 2 / (p + 1); let e = d[0];
  for (let i = 1; i < d.length; i++) e = d[i] * k + e * (1 - k);
  return e;
}

export function rsi(d: number[], p: number): number | null {
  if (d.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = d.length - p; i < d.length; i++) { const c = d[i] - d[i - 1]; if (c > 0) g += c; else l -= c; }
  g /= p; l /= p; if (l === 0) return 100; return 100 - 100 / (1 + g / l);
}

function macdHist(d: number[]): number | null {
  if (d.length < 35) return null;
  const e12 = ema(d, 12), e26 = ema(d, 26);
  if (e12 === null || e26 === null) return null;
  const ml = e12 - e26;
  const rm: number[] = [];
  for (let len = d.length - 9; len <= d.length; len++) {
    const a = ema(d.slice(0, len), 12), b = ema(d.slice(0, len), 26);
    if (a !== null && b !== null) rm.push(a - b);
  }
  const sl = rm.length >= 9 ? ema(rm, 9) : null;
  return sl !== null ? ml - sl : (ml > 0 ? 1 : -1);
}
