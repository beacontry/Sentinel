import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeBars } from "@/lib/indicators/analyzer";
import { STRATEGY_PRESETS } from "@/lib/strategy-presets";
import { db } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import type { Bar } from "@/types";

const log = createRouteLogger("mode-comparison");

const SCAN_UNIVERSE = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "JPM", "V",
  "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "BAC", "CRM", "AMD",
  "NFLX", "WMT", "PEP", "TMO", "AVGO", "LLY", "MRK", "ORCL", "ADBE", "CSCO",
  "ACN", "DIS", "INTC", "VZ", "CMCSA", "PFE", "T", "KO", "NKE", "MCD",
  "QCOM", "GS", "MS", "CAT", "BA", "GE", "RTX", "LOW", "SBUX", "PYPL",
];

interface ModeResult {
  mode: string;
  label: string;
  totalReturn: number;
  finalValue: number;
  maxDrawdown: number;
  sharpe: number;
  trades: number;
  timeInMarket: number; // percentage
}

interface StrategyParams {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
}

// Simple SMA helper
function sma(data: number[], period: number): number | null {
  if (data.length < period) return null;
  let s = 0;
  for (let i = data.length - period; i < data.length; i++) s += data[i];
  return s / period;
}

// Sector mapping for rotation
const SECTOR_MAP: Record<string, string> = {
  AAPL: "tech", MSFT: "tech", NVDA: "tech", AMD: "tech", INTC: "tech", GOOGL: "tech",
  META: "tech", ADBE: "tech", CRM: "tech", ORCL: "tech", CSCO: "tech", AVGO: "tech", QCOM: "tech",
  AMZN: "consumer", TSLA: "consumer", HD: "consumer", LOW: "consumer", MCD: "consumer",
  SBUX: "consumer", NKE: "consumer", COST: "consumer", WMT: "consumer", NFLX: "consumer",
  JPM: "finance", BAC: "finance", GS: "finance", MS: "finance", V: "finance", MA: "finance",
  UNH: "health", JNJ: "health", PFE: "health", ABBV: "health", LLY: "health", MRK: "health", TMO: "health",
  BA: "industrial", CAT: "industrial", GE: "industrial", RTX: "industrial",
  XOM: "energy", CVX: "energy", COP: "energy", SLB: "energy",
  PG: "staples", PEP: "staples", KO: "staples", PM: "staples",
  DIS: "comms", VZ: "comms", T: "comms", CMCSA: "comms",
  PYPL: "fintech", FI: "fintech", FISV: "fintech",
};

function calcMomentumAndVol(bars: Bar[]): { momentum: number; volatility: number } {
  if (bars.length < 60) return { momentum: 0, volatility: 1 };
  const recent = bars.slice(-60);
  const momentum = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return { momentum, volatility: Math.max(Math.sqrt(variance) * Math.sqrt(252), 0.01) };
}

/**
 * Simulate a signal-based strategy on the portfolio of stocks
 */
function simulateSignalStrategy(
  allBars: Map<string, Bar[]>,
  params: StrategyParams,
  maxPositions: number,
  positionPct: number,
): ModeResult & { mode: string; label: string } {
  // Build unified date index
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) {
      const dk = b.date.split("T")[0];
      dateSet.add(dk);
      lookup.set(dk, b);
    }
    barLookup.set(sym, lookup);
  }
  const dates = [...dateSet].sort();

  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number; peakPrice: number; entryIdx: number }>();
  const equityHistory: number[] = [INITIAL];
  let wins = 0, losses = 0;
  let daysInMarket = 0;
  const windows = new Map<string, Bar[]>();

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];

    // Update windows
    for (const sym of SCAN_UNIVERSE) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      let w = windows.get(sym);
      if (!w) { w = []; windows.set(sym, w); }
      w.push(bar);
      if (w.length > 50) w.shift();
    }

    if (positions.size > 0) daysInMarket++;

    // Check exits
    for (const [sym, pos] of [...positions]) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      if (bar.high > pos.peakPrice) pos.peakPrice = bar.high;

      let exit = false;
      const pPct = (pos.peakPrice - pos.entryPrice) / pos.entryPrice;
      const dynT = pPct > 0 ? 0.02 + (params.trailingStopPct - 0.02) * Math.exp(-3 * pPct) : params.trailingStopPct;
      const fixedStop = pos.entryPrice * (1 - params.stopLossPct);
      const trailStop = pos.peakPrice * (1 - dynT);
      if (bar.low <= Math.max(fixedStop, trailStop)) exit = true;
      if (bar.high >= pos.entryPrice * (1 + params.takeProfitPct)) exit = true;
      if (di - pos.entryIdx >= params.holdPeriod) exit = true;

      // Sell signal check every 15 days
      if (!exit && di % 15 === 0) {
        const w = windows.get(sym);
        if (w && w.length >= 30) {
          const result = analyzeBars(sym, w);
          if (result.signal === "SELL" || result.signal === "STRONG_SELL") exit = true;
        }
      }

      if (exit) {
        cash += pos.qty * bar.close;
        if (bar.close > pos.entryPrice) wins++; else losses++;
        positions.delete(sym);
      }
    }

    // Check entries every 15 days
    if (di % 15 === 0 && positions.size < maxPositions) {
      for (const sym of SCAN_UNIVERSE) {
        if (positions.has(sym)) continue;
        const w = windows.get(sym);
        if (!w || w.length < 30) continue;
        const bar = barLookup.get(sym)?.get(date);
        if (!bar) continue;

        const result = analyzeBars(sym, w);
        if (result.signal !== "BUY" && result.signal !== "STRONG_BUY") continue;
        if (positions.size >= maxPositions) break;

        let equity = cash;
        for (const [s, p] of positions) {
          const b = barLookup.get(s)?.get(date);
          equity += p.qty * (b?.close ?? p.entryPrice);
        }

        const posValue = equity * positionPct;
        const qty = Math.floor(posValue / bar.close);
        if (qty <= 0 || qty * bar.close > cash) continue;

        cash -= qty * bar.close;
        positions.set(sym, { qty, entryPrice: bar.close, peakPrice: bar.close, entryIdx: di });
      }
    }

    // Record equity
    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  // Close remaining
  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    const price = b?.close ?? pos.entryPrice;
    cash += pos.qty * price;
    if (price > pos.entryPrice) wins++; else losses++;
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;
  const tradeCount = wins + losses;

  // Max drawdown
  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe
  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "", label: "",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades: tradeCount,
    timeInMarket: Math.round((daysInMarket / dates.length) * 100),
  };
}

/**
 * Simulate tactical mode: always invested, exit on SPY weakness
 * - Graduated exit: caution SMA (30) sells 50% weakest, full exit on confirmed below 20 SMA
 * - Faster re-entry: SPY > 20 SMA AND RSI < 40 (oversold bounce), not just SPY > 50 SMA
 * - Sector rotation on entry: weight by stock momentum + sector strength + inverse volatility
 * - Inverse volatility sizing: more capital to lower-volatility stocks
 */
function simulateTactical(
  allBars: Map<string, Bar[]>,
  spyBars: Bar[],
): ModeResult {
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) { const dk = b.date.split("T")[0]; dateSet.add(dk); lookup.set(dk, b); }
    barLookup.set(sym, lookup);
  }
  const spyLookup = new Map<string, Bar>();
  for (const b of spyBars) spyLookup.set(b.date.split("T")[0], b);

  const dates = [...dateSet].sort();
  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number }>();
  const equityHistory: number[] = [INITIAL];
  let trades = 0, daysInMarket = 0;
  let isInvested = false;
  let cautionSold = false; // track whether we already did a 50% caution sell
  const spyCloses: number[] = [];
  const rollingBars = new Map<string, Bar[]>(); // rolling window for momentum/vol calc

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const spyBar = spyLookup.get(date);
    if (spyBar) spyCloses.push(spyBar.close);

    // Update rolling bars for each symbol (keep 65 for 60-bar momentum calc)
    for (const sym of SCAN_UNIVERSE) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      let w = rollingBars.get(sym);
      if (!w) { w = []; rollingBars.set(sym, w); }
      w.push(bar);
      if (w.length > 65) w.shift();
    }

    if (isInvested) daysInMarket++;

    const exitSMA = sma(spyCloses, 20);
    const cautionSMA = sma(spyCloses, 30);
    const trendSMA = sma(spyCloses, 50);
    const spyPrice = spyCloses.length > 0 ? spyCloses[spyCloses.length - 1] : 0;

    // Calculate RSI(14) for SPY for faster re-entry
    let spyRSI = 50; // default neutral
    if (spyCloses.length >= 15) {
      const rsiPeriod = 14;
      let avgGain = 0, avgLoss = 0;
      for (let i = spyCloses.length - rsiPeriod; i < spyCloses.length; i++) {
        const change = spyCloses[i] - spyCloses[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss -= change;
      }
      avgGain /= rsiPeriod;
      avgLoss /= rsiPeriod;
      spyRSI = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }

    // --- GRADUATED EXIT ---
    if (isInvested && cautionSMA && exitSMA) {
      // Caution zone: SPY below 30 SMA but above 20 SMA -> sell 50% weakest
      if (!cautionSold && spyPrice < cautionSMA && spyPrice >= exitSMA) {
        // Sort positions by P&L (weakest first)
        const posEntries = [...positions.entries()].map(([sym, pos]) => {
          const b = barLookup.get(sym)?.get(date);
          const currentPrice = b?.close ?? pos.entryPrice;
          const pnl = (currentPrice - pos.entryPrice) / pos.entryPrice;
          return { sym, pos, currentPrice, pnl };
        });
        posEntries.sort((a, b) => a.pnl - b.pnl); // weakest first

        const toSell = Math.ceil(posEntries.length / 2);
        for (let i = 0; i < toSell && i < posEntries.length; i++) {
          const { sym, pos, currentPrice } = posEntries[i];
          cash += pos.qty * currentPrice;
          trades++;
          positions.delete(sym);
        }
        cautionSold = true;
        if (positions.size === 0) isInvested = false;
      }

      // Full exit: SPY below 20 SMA (confirmed 3 days)
      if (spyPrice < exitSMA) {
        let belowCount = 0;
        for (let j = spyCloses.length - 3; j < spyCloses.length; j++) {
          if (j >= 0 && j < spyCloses.length) {
            const s = spyCloses.slice(Math.max(0, j - 19), j + 1);
            if (s.length >= 20) {
              const avg = s.reduce((a, b) => a + b, 0) / s.length;
              if (spyCloses[j] < avg) belowCount++;
            }
          }
        }

        if (belowCount >= 3) {
          // Sell everything
          for (const [sym, pos] of positions) {
            const b = barLookup.get(sym)?.get(date);
            cash += pos.qty * (b?.close ?? pos.entryPrice);
            trades++;
          }
          positions.clear();
          isInvested = false;
          cautionSold = false;
        }
      }
    }

    // --- ENTRY with sector rotation + inverse volatility sizing ---
    // Faster re-entry: SPY > exitSMA (20) AND RSI < 40 (oversold bounce), OR SPY > trendSMA (50)
    const fastReentry = exitSMA && spyPrice > exitSMA && spyRSI < 40;
    const normalEntry = trendSMA && spyPrice > trendSMA;

    if (!isInvested && (fastReentry || normalEntry)) {
      // Score each stock by momentum + sector strength + inverse volatility
      const candidates: { sym: string; score: number; invVol: number; price: number }[] = [];
      const sectorMomentum = new Map<string, { total: number; count: number }>();

      // First pass: compute per-stock momentum & vol, accumulate sector momentum
      for (const sym of SCAN_UNIVERSE) {
        const w = rollingBars.get(sym);
        if (!w || w.length < 60) continue;
        const b = barLookup.get(sym)?.get(date);
        if (!b) continue;

        const { momentum, volatility } = calcMomentumAndVol(w);
        const sector = SECTOR_MAP[sym] ?? "other";

        const existing = sectorMomentum.get(sector) ?? { total: 0, count: 0 };
        existing.total += momentum;
        existing.count++;
        sectorMomentum.set(sector, existing);

        candidates.push({ sym, score: momentum, invVol: 1 / volatility, price: b.close });
      }

      // Second pass: add sector strength to score
      for (const c of candidates) {
        const sector = SECTOR_MAP[c.sym] ?? "other";
        const secData = sectorMomentum.get(sector);
        const sectorAvg = secData && secData.count > 0 ? secData.total / secData.count : 0;
        c.score = c.score + sectorAvg + c.invVol * 0.1; // stock momentum + sector avg momentum + small invVol bonus
      }

      // Sort by composite score descending, take top 16
      candidates.sort((a, b) => b.score - a.score);
      const toBuy = candidates.slice(0, 16);

      // Inverse volatility sizing: allocate proportional to invVol
      const totalInvVol = toBuy.reduce((sum, c) => sum + c.invVol, 0);
      for (const { sym, invVol, price } of toBuy) {
        const weight = totalInvVol > 0 ? invVol / totalInvVol : 1 / toBuy.length;
        const posValue = cash * weight;
        const qty = Math.floor(posValue / price);
        if (qty <= 0) continue;
        // Deduct from a copy of remaining cash to avoid overdraft
        if (qty * price > cash) continue;
        cash -= qty * price;
        positions.set(sym, { qty, entryPrice: price });
        trades++;
      }
      isInvested = positions.size > 0;
      cautionSold = false;
    }

    // Record equity
    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  // Close remaining
  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    cash += pos.qty * (b?.close ?? pos.entryPrice);
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;

  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "tactical", label: "Tactical",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades,
    timeInMarket: Math.round((daysInMarket / (equityHistory.length - 1)) * 100),
  };
}

/**
 * Tactical Smart: same SPY exit logic but scores stocks at each re-entry
 * - Momentum as primary scorer: 3-month momentum (weighted 3x) + signal score + confidence
 * - Inverse volatility sizing: more capital to stable stocks
 */
function simulateTacticalSmart(
  allBars: Map<string, Bar[]>,
  spyBars: Bar[],
): ModeResult {
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) { const dk = b.date.split("T")[0]; dateSet.add(dk); lookup.set(dk, b); }
    barLookup.set(sym, lookup);
  }
  const spyLookup = new Map<string, Bar>();
  for (const b of spyBars) spyLookup.set(b.date.split("T")[0], b);

  const dates = [...dateSet].sort();
  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number }>();
  const equityHistory: number[] = [INITIAL];
  let trades = 0, daysInMarket = 0;
  let isInvested = false;
  const spyCloses: number[] = [];
  const windows = new Map<string, Bar[]>();

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const spyBar = spyLookup.get(date);
    if (spyBar) spyCloses.push(spyBar.close);

    // Update rolling windows for signal scoring
    for (const sym of SCAN_UNIVERSE) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      let w = windows.get(sym);
      if (!w) { w = []; windows.set(sym, w); }
      w.push(bar);
      if (w.length > 65) w.shift(); // keep 65 for 60-bar momentum calc
    }

    if (isInvested) daysInMarket++;

    const sma20 = spyCloses.length >= 20 ? spyCloses.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const sma50 = spyCloses.length >= 50 ? spyCloses.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const spyPrice = spyCloses.length > 0 ? spyCloses[spyCloses.length - 1] : 0;

    // EXIT: SPY below 20 SMA for 3 days
    if (isInvested && sma20 && spyPrice < sma20) {
      let belowCount = 0;
      for (let j = spyCloses.length - 3; j < spyCloses.length; j++) {
        if (j >= 0 && j < spyCloses.length) {
          const s = spyCloses.slice(Math.max(0, j - 19), j + 1);
          if (s.length >= 20 && spyCloses[j] < s.reduce((a, b) => a + b, 0) / s.length) belowCount++;
        }
      }
      if (belowCount >= 3) {
        for (const [sym, pos] of positions) {
          const b = barLookup.get(sym)?.get(date);
          cash += pos.qty * (b?.close ?? pos.entryPrice);
          trades++;
        }
        positions.clear();
        isInvested = false;
      }
    }

    // ENTRY: SPY above 50 SMA — score and rank stocks
    // Momentum as primary scorer: 3-month momentum (3x) + signal score + confidence
    // Inverse volatility sizing
    if (!isInvested && sma50 && spyPrice > sma50) {
      const scored: { symbol: string; score: number; invVol: number; price: number }[] = [];

      for (const sym of SCAN_UNIVERSE) {
        const w = windows.get(sym);
        if (!w || w.length < 30) continue;
        const bar = barLookup.get(sym)?.get(date);
        if (!bar) continue;

        // 3-month momentum + volatility
        const { momentum, volatility } = calcMomentumAndVol(w);
        const invVol = 1 / volatility;

        // Signal analysis
        const analysis = analyzeBars(sym, [...w]);
        let signalScore = 0;
        if (analysis.signal === "STRONG_BUY") signalScore = 4;
        else if (analysis.signal === "BUY") signalScore = 2;
        else if (analysis.signal === "HOLD") signalScore = 0;
        else signalScore = -2;

        // Composite: momentum weighted 3x + signal + confidence
        const composite = momentum * 3 + signalScore + analysis.confidence * 2;
        if (composite > 0) scored.push({ symbol: sym, score: composite, invVol, price: bar.close });
      }

      scored.sort((a, b) => b.score - a.score);
      const toBuy = scored.slice(0, 16);

      // Inverse volatility sizing: allocate proportional to invVol
      const totalInvVol = toBuy.reduce((sum, c) => sum + c.invVol, 0);

      for (const { symbol, invVol, price } of toBuy) {
        const weight = totalInvVol > 0 ? invVol / totalInvVol : 1 / toBuy.length;
        const posValue = cash * weight;
        const qty = Math.floor(posValue / price);
        if (qty <= 0) continue;
        if (qty * price > cash) continue;
        cash -= qty * price;
        positions.set(symbol, { qty, entryPrice: price });
        trades++;
      }
      isInvested = positions.size > 0;
    }

    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    cash += pos.qty * (b?.close ?? pos.entryPrice);
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;

  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "tactical-smart", label: "Tactical Smart",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades,
    timeInMarket: Math.round((daysInMarket / (equityHistory.length - 1)) * 100),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const provider = getMarketDataProvider();

    // Fetch 5Y data for all stocks + SPY
    log.info("Starting mode comparison backtest — fetching data");
    const allBars = new Map<string, Bar[]>();

    for (const sym of SCAN_UNIVERSE) {
      try {
        const bars = await Promise.race([
          provider.fetchBars(sym, 1825, "1d"),
          new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
        ]);
        if (bars.length > 200) allBars.set(sym, bars);
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 1)); // yield
    }

    const spyBars = await provider.fetchBars("SPY", 1825, "1d");

    // SPY buy-and-hold
    const spyReturn = spyBars.length > 1
      ? ((spyBars[spyBars.length - 1].close - spyBars[0].close) / spyBars[0].close) * 100
      : 0;
    let spyPeak = 10000, spyMaxDD = 0;
    const spyEquity = spyBars.map(b => 10000 * (b.close / spyBars[0].close));
    for (const v of spyEquity) {
      if (v > spyPeak) spyPeak = v;
      const dd = ((spyPeak - v) / spyPeak) * 100;
      if (dd > spyMaxDD) spyMaxDD = dd;
    }

    log.info({ symbols: allBars.size, spyBars: spyBars.length }, "Data fetched, running backtests");

    // Get latest optimizer params
    let optimizedParams = STRATEGY_PRESETS.optimized;
    try {
      const [run] = await db.select({ bestParams: optimizationRuns.bestParams })
        .from(optimizationRuns).where(eq(optimizationRuns.status, "complete"))
        .orderBy(desc(optimizationRuns.completedAt)).limit(1);
      if (run?.bestParams) {
        const p = run.bestParams as Record<string, number>;
        if (p.stopLossPct != null) {
          optimizedParams = {
            stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct,
            trailingStopPct: p.trailingStopPct ?? 0.09, holdPeriod: Math.round(p.holdPeriod ?? 43),
          };
        }
      }
    } catch { /* use default */ }

    // Run all modes
    const results: ModeResult[] = [];

    // SPY buy-and-hold
    results.push({
      mode: "spy", label: "SPY Buy & Hold",
      totalReturn: Math.round(spyReturn * 10) / 10,
      finalValue: Math.round(10000 * (1 + spyReturn / 100)),
      maxDrawdown: Math.round(spyMaxDD * 10) / 10,
      sharpe: 0, trades: 1, timeInMarket: 100,
    });

    // Signal-based modes
    const modes = [
      { mode: "conservative", label: "Conservative", params: STRATEGY_PRESETS.conservative, maxPos: 10, posPct: 0.10 },
      { mode: "moderate", label: "Moderate", params: STRATEGY_PRESETS.moderate, maxPos: 12, posPct: 0.12 },
      { mode: "optimized", label: "Optimized (GA)", params: optimizedParams, maxPos: 16, posPct: 0.15 },
      { mode: "aggressive", label: "Aggressive", params: STRATEGY_PRESETS.aggressive, maxPos: 14, posPct: 0.15 },
    ];

    for (const m of modes) {
      const r = simulateSignalStrategy(allBars, m.params, m.maxPos, m.posPct);
      results.push({ ...r, mode: m.mode, label: m.label });
      await new Promise(r => setTimeout(r, 1));
    }

    // Tactical
    const tactical = simulateTactical(allBars, spyBars);
    results.push(tactical);

    // Tactical Smart
    await new Promise(r => setTimeout(r, 1));
    const tacticalSmart = simulateTacticalSmart(allBars, spyBars);
    results.push(tacticalSmart);

    log.info("Mode comparison complete");

    return NextResponse.json({ results, period: "5 years", startingCapital: 10000 }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: msg }, "Mode comparison failed");
    return NextResponse.json({ error: "Comparison failed" }, { status: 500 });
  }
}
