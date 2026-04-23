import type { Bar } from "@/types";
import { getMarketDataProvider } from "./market-data";
import { SP500_SYMBOLS } from "./sp500";

/**
 * Top 50 most liquid S&P 500 stocks — used for portfolio optimization
 * to keep run times under 2 hours. Full S&P 500 list is still used
 * for per-symbol validation after the best params are found.
 */
const TOP_50 = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
  "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "BAC", "CRM", "AMD",
  "NFLX", "WMT", "PEP", "TMO", "AVGO", "LLY", "MRK", "ORCL", "ADBE", "CSCO",
  "ACN", "DIS", "INTC", "VZ", "CMCSA", "PFE", "T", "KO", "NKE", "MCD",
  "QCOM", "GS", "MS", "CAT", "BA", "GE", "RTX", "LOW", "SBUX", "PYPL",
];

/** Top 150 most liquid S&P 500 stocks by market cap + volume */
const TOP_150 = [
  // Top 50 (mega cap)
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
  "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "BAC", "CRM", "AMD",
  "NFLX", "WMT", "PEP", "TMO", "AVGO", "LLY", "MRK", "ORCL", "ADBE", "CSCO",
  "ACN", "DIS", "INTC", "VZ", "CMCSA", "PFE", "T", "KO", "NKE", "MCD",
  "QCOM", "GS", "MS", "CAT", "BA", "GE", "RTX", "LOW", "SBUX", "PYPL",
  // 51-100 (large cap)
  "INTU", "AMAT", "ISRG", "NOW", "AXP", "BKNG", "SYK", "GILD", "MDLZ", "BMY",
  "ADI", "LRCX", "BSX", "SCHW", "BLK", "CVX", "XOM", "COP", "SLB", "EOG",
  "TJX", "REGN", "VRTX", "PANW", "CME", "CB", "MMC", "ICE", "APH", "CDNS",
  "SNPS", "KLAC", "FTNT", "CRWD", "MCHP", "KKR", "BX", "ETN", "ITW", "EMR",
  "DHR", "ABT", "CI", "EW", "HCA", "CMG", "ROST", "ORLY", "AZO", "IDXX",
  // 101-150 (mid-large cap)
  "MNST", "DXCM", "ODFL", "FAST", "CPRT", "CTAS", "PCAR", "MKTX", "TDG", "ROP",
  "MSCI", "SPGI", "MCO", "FDS", "FICO", "TYL", "ANSS", "KEYS", "MPWR", "ON",
  "GWW", "URI", "PWR", "FANG", "MPC", "VLO", "PSX", "DVN", "HES", "OXY",
  "F", "GM", "DAL", "LUV", "UAL", "CCL", "RCL", "MAR", "HLT", "WYNN",
  "DE", "UNP", "UPS", "FDX", "LMT", "NOC", "GD", "HON", "WAB", "IR",
];
import { STRATEGY_PRESETS } from "./strategy-presets";
import { db } from "./db";
import {
  optimizationRuns,
  optimizationGenerations,
  optimizationSymbolResults,
} from "./db/schema";
import { eq } from "drizzle-orm";
import { writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import pino from "pino";

const logger = pino({ name: "optimizer" });

// ── Types ───────────────────────────────────────────────────────────

export interface OptimizableParams {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  emaFast: number;
  emaSlow: number;
  rsThreshold: number; // min 60-day return to buy (e.g., -0.10 = allow down 10%)
}

interface ParamRange { min: number; max: number; step?: number }

interface Individual { params: OptimizableParams; fitness: number }

export interface OptimizationConfig {
  populationSize: number;
  generations: number;
  trainPct: number;
  universe: "top50" | "top150" | "sp500";
}

export interface OptimizationProgress {
  runId: string;
  status: "pending" | "fetching_data" | "optimizing" | "complete" | "failed";
  symbolsFetched: number;
  totalSymbols: number;
  currentGeneration: number;
  totalGenerations: number;
  bestFitness: number;
  bestParams: OptimizableParams | null;
}

// ── Constants ───────────────────────────────────────────────────────

const PARAM_RANGES: Record<keyof OptimizableParams, ParamRange> = {
  stopLossPct:     { min: 0.01,  max: 0.12 },
  takeProfitPct:   { min: 0.10,  max: 1.00 },
  trailingStopPct: { min: 0.01,  max: 0.15 },
  holdPeriod:      { min: 5,     max: 60, step: 1 },
  rsiOversold:     { min: 20,    max: 40, step: 1 },
  rsiOverbought:   { min: 60,    max: 80, step: 1 },
  emaFast:         { min: 5,     max: 15, step: 1 },
  emaSlow:         { min: 15,    max: 50, step: 1 },
  rsThreshold:     { min: -0.20, max: 0.10 },
};

// Fixed position sizing for backtesting (user risk profiles control live sizing)
const BACKTEST_POSITION_PCT = 0.10;
const BACKTEST_MAX_POSITIONS = 10;

const WINDOW_SIZE = 90;
const STEP_SIZE = 15;
const ELITISM = 2;
const TOURNAMENT_SIZE = 3;
const MUTATION_RATE_BASE = 0.20;
const MUTATION_RATE_MIN = 0.10;
const MUTATION_RATE_MAX = 0.50;
const CROSSOVER_RATE = 0.85;
const DATA_DAYS = 1825;
const FETCH_CONCURRENCY = 3;
const FETCH_DELAY_MS = 300;
const INITIAL_CASH = 10000;

// ── Diversity constants ────────────────────────────────────────────
const DIVERSITY_LOW = 0.10;        // below this → boost mutation
const DIVERSITY_HIGH = 0.35;       // above this → ease off mutation
const IMMIGRANT_RATE = 0.05;       // 5% of pop replaced with random each gen
const STAGNATION_GENS = 8;         // gens without improvement before restart
const STAGNATION_IMMIGRANT_RATE = 0.15; // 15% replacement on stagnation

const CACHE_DIR = join(
  process.env.CACHE_DIR ?? (process.env.NODE_ENV === "production" ? "/data/cache" : join(process.cwd(), "data")),
  "optimizer-cache"
);

// ── In-memory job tracking ──────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __optimizerJobs?: Map<string, OptimizationProgress>;
};
g.__optimizerJobs ??= new Map();

export function getJobProgress(runId: string): OptimizationProgress | null {
  return g.__optimizerJobs?.get(runId) ?? null;
}

// ── Data fetching & caching ─────────────────────────────────────────

async function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(symbol: string): string {
  return join(CACHE_DIR, `${symbol.replace(/[^A-Z0-9]/g, "_")}.json`);
}

interface CachedData {
  bars: Bar[];
  fetchedAt: string;
  lastDate: string; // last bar date for incremental updates
}

async function getCachedData(symbol: string): Promise<CachedData | null> {
  try {
    const raw = await readFile(cacheKey(symbol), "utf-8");
    return JSON.parse(raw) as CachedData;
  } catch { return null; }
}

async function cacheBars(symbol: string, bars: Bar[]) {
  if (bars.length === 0) return;
  const lastDate = bars[bars.length - 1].date.split("T")[0];
  try {
    await writeFile(cacheKey(symbol), JSON.stringify({
      bars,
      fetchedAt: new Date().toISOString(),
      lastDate,
    }));
  } catch (err) {
    logger.warn({ symbol, err: (err as Error).message }, "Failed to cache bars");
  }
}

async function fetchSymbolBars(symbol: string): Promise<Bar[]> {
  const cached = await getCachedData(symbol);

  // If we have cached data, only fetch new bars since last date
  if (cached && cached.bars.length > 200 && cached.lastDate) {
    const lastDate = new Date(cached.lastDate);
    const daysSince = Math.ceil((Date.now() - lastDate.getTime()) / 86400000);

    // If cache is fresh (less than 1 day old), use as-is
    if (daysSince <= 1) return cached.bars;

    // Fetch only the missing days + a small overlap for safety
    const provider = getMarketDataProvider();
    try {
      const newBars = await Promise.race([
        provider.fetchBars(symbol, daysSince + 5, "1d"),
        new Promise<Bar[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
      ]);

      if (newBars.length > 0) {
        // Merge: keep cached bars, append new bars that are after the last cached date
        const existingDates = new Set(cached.bars.map(b => b.date.split("T")[0]));
        const uniqueNew = newBars.filter(b => !existingDates.has(b.date.split("T")[0]));
        const merged = [...cached.bars, ...uniqueNew];

        // Trim to keep only last 5 years worth
        const maxBars = 1300; // ~5 years of trading days
        const trimmed = merged.length > maxBars ? merged.slice(-maxBars) : merged;

        await cacheBars(symbol, trimmed);
        return trimmed;
      }

      return cached.bars; // fetch failed, use cached
    } catch {
      return cached.bars; // timeout, use cached
    }
  }

  // No cache or too small — full fetch
  const provider = getMarketDataProvider();
  try {
    const bars = await Promise.race([
      provider.fetchBars(symbol, DATA_DAYS, "1d"),
      new Promise<Bar[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
    ]);
    if (bars.length > 200) await cacheBars(symbol, bars);
    return bars;
  } catch (err) {
    logger.warn({ symbol, err: (err as Error).message }, "Failed to fetch");
    return [];
  }
}

async function fetchAllBars(
  symbols: string[],
  onProgress: (fetched: number) => void
): Promise<Map<string, Bar[]>> {
  await ensureCacheDir();
  const barsMap = new Map<string, Bar[]>();
  let fetched = 0;
  for (let i = 0; i < symbols.length; i += FETCH_CONCURRENCY) {
    const batch = symbols.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((s) => fetchSymbolBars(s)));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value.length > 200) barsMap.set(batch[j], r.value);
      fetched++;
    }
    onProgress(fetched);
    if (i + FETCH_CONCURRENCY < symbols.length) await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
  }
  return barsMap;
}

// ── Signal evaluation (uses same analyzer as live engine) ───────────

import { analyzeSignalOnly, type SignalParams } from "./indicators/analyzer";
import type { SignalType } from "@/types";
export type { SignalType };

// ── Portfolio data preparation ──────────────────────────────────────

interface PortfolioData {
  symbols: string[];
  dates: string[];
  dateIdx: Map<string, number>;
  barLookup: Map<string, Map<string, Bar>>; // symbol → dateKey → Bar
  trainEnd: number;   // index into dates
  avgBuyHoldTrain: number;
  avgBuyHoldTest: number;
}

function normalizeDate(d: string): string {
  return d.split("T")[0];
}

function buildPortfolioData(allBars: Map<string, Bar[]>, trainPct: number): PortfolioData {
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();

  for (const [symbol, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const bar of bars) {
      const dk = normalizeDate(bar.date);
      dateSet.add(dk);
      lookup.set(dk, bar);
    }
    barLookup.set(symbol, lookup);
  }

  const dates = [...dateSet].sort();
  const dateIdx = new Map<string, number>();
  dates.forEach((d, i) => dateIdx.set(d, i));

  const trainEnd = Math.floor(dates.length * (trainPct / 100));
  const symbols = [...allBars.keys()];

  // Compute average buy-and-hold for train and test
  let bhTrainSum = 0, bhTestSum = 0, bhTrainN = 0, bhTestN = 0;
  for (const [, lookup] of barLookup) {
    // Train period
    let firstTrain: number | null = null, lastTrain: number | null = null;
    let firstTest: number | null = null, lastTest: number | null = null;
    for (let i = 0; i < trainEnd; i++) {
      const bar = lookup.get(dates[i]);
      if (bar) { if (firstTrain === null) firstTrain = bar.close; lastTrain = bar.close; }
    }
    for (let i = trainEnd; i < dates.length; i++) {
      const bar = lookup.get(dates[i]);
      if (bar) { if (firstTest === null) firstTest = bar.close; lastTest = bar.close; }
    }
    if (firstTrain !== null && lastTrain !== null && firstTrain > 0) {
      bhTrainSum += ((lastTrain - firstTrain) / firstTrain) * 100;
      bhTrainN++;
    }
    if (firstTest !== null && lastTest !== null && firstTest > 0) {
      bhTestSum += ((lastTest - firstTest) / firstTest) * 100;
      bhTestN++;
    }
  }

  return {
    symbols,
    dates,
    dateIdx,
    barLookup,
    trainEnd,
    avgBuyHoldTrain: bhTrainN > 0 ? bhTrainSum / bhTrainN : 0,
    avgBuyHoldTest: bhTestN > 0 ? bhTestSum / bhTestN : 0,
  };
}

// ── Portfolio backtester ────────────────────────────────────────────

interface Position {
  symbol: string;
  entryPrice: number;
  entryDateIdx: number;
  shares: number;
  peakPrice: number;
}

interface PortfolioResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  avgPositions: number;
  buyHoldReturn: number;
  excessReturn: number;
  perSymbol: Map<string, { returnPct: number; trades: number }>;
}

function portfolioBacktest(
  data: PortfolioData,
  params: OptimizableParams,
  segment: "train" | "test"
): PortfolioResult {
  const startIdx = segment === "train" ? 0 : data.trainEnd;
  const endIdx = segment === "train" ? data.trainEnd : data.dates.length;
  const buyHold = segment === "train" ? data.avgBuyHoldTrain : data.avgBuyHoldTest;

  // Build signal params from optimizer's tunable values
  const signalParams: SignalParams = {
    emaFast: params.emaFast,
    emaSlow: params.emaSlow,
    rsiOversold: params.rsiOversold,
    rsiOverbought: params.rsiOverbought,
  };

  let cash = INITIAL_CASH;
  const positions: Position[] = [];
  let wins = 0, losses = 0;
  const equityHistory: number[] = [INITIAL_CASH];
  let totalPositionDays = 0;
  const perSymbol = new Map<string, { returnPct: number; trades: number }>();

  // Rolling windows per symbol (for signal evaluation)
  const windows = new Map<string, Bar[]>();

  for (let di = startIdx; di < endIdx; di++) {
    const date = data.dates[di];

    // Update rolling windows
    for (const symbol of data.symbols) {
      const bar = data.barLookup.get(symbol)?.get(date);
      if (!bar) continue;
      let w = windows.get(symbol);
      if (!w) { w = []; windows.set(symbol, w); }
      w.push(bar);
      if (w.length > WINDOW_SIZE) w.shift();
    }

    // ── Check exits ──
    const isStepBoundary = (di - startIdx) % STEP_SIZE === 0;

    for (let p = positions.length - 1; p >= 0; p--) {
      const pos = positions[p];
      const bar = data.barLookup.get(pos.symbol)?.get(date);
      if (!bar) continue;

      if (bar.high > pos.peakPrice) pos.peakPrice = bar.high;
      let exitPrice: number | null = null;

      // Stops with profit-based tightening
      const profitPct = (pos.peakPrice - pos.entryPrice) / pos.entryPrice;
      const dynTrail = profitPct > 0 ? 0.02 + (params.trailingStopPct - 0.02) * Math.exp(-3 * profitPct) : params.trailingStopPct;
      const fixedStop = pos.entryPrice * (1 - params.stopLossPct);
      const trailStop = pos.peakPrice * (1 - dynTrail);
      if (bar.low <= Math.max(fixedStop, trailStop)) exitPrice = Math.max(fixedStop, trailStop);

      // Take profit
      if (!exitPrice) {
        const tp = pos.entryPrice * (1 + params.takeProfitPct);
        if (bar.high >= tp) exitPrice = tp;
      }

      // Sell signal (step boundaries only) — uses same analyzer as live engine
      if (!exitPrice && isStepBoundary) {
        const w = windows.get(pos.symbol);
        if (w && w.length >= 60) {
          const { signal: sig } = analyzeSignalOnly(pos.symbol, w, signalParams);
          if (sig === "SELL" || sig === "STRONG_SELL") exitPrice = bar.close;
        }
      }

      // Hold period
      if (!exitPrice && (di - pos.entryDateIdx) >= params.holdPeriod) exitPrice = bar.close;

      if (exitPrice !== null) {
        cash += pos.shares * exitPrice;
        const ret = (exitPrice - pos.entryPrice) / pos.entryPrice;
        if (ret > 0) wins++; else losses++;

        // Track per-symbol
        const existing = perSymbol.get(pos.symbol) ?? { returnPct: 0, trades: 0 };
        existing.returnPct += ret * 100;
        existing.trades++;
        perSymbol.set(pos.symbol, existing);

        positions.splice(p, 1);
      }
    }

    // ── Check entries (step boundaries only) ──
    if (isStepBoundary && positions.length < BACKTEST_MAX_POSITIONS) {
      const heldSymbols = new Set(positions.map((p) => p.symbol));
      const candidates: { symbol: string; signal: SignalType; price: number }[] = [];

      for (const symbol of data.symbols) {
        if (heldSymbols.has(symbol)) continue;
        const w = windows.get(symbol);
        if (!w || w.length < 60) continue;
        const bar = data.barLookup.get(symbol)?.get(date);
        if (!bar) continue;

        // RS filter: check 60-day momentum against threshold
        if (w.length >= 60) {
          const rs60 = (w[w.length - 1].close - w[w.length - 60].close) / w[w.length - 60].close;
          if (rs60 < params.rsThreshold) continue;
        }

        const { signal: sig } = analyzeSignalOnly(symbol, w, signalParams);
        if (sig === "BUY" || sig === "STRONG_BUY") {
          candidates.push({ symbol, signal: sig, price: bar.close });
        }
      }

      // Rank: STRONG_BUY first
      candidates.sort((a, b) => (a.signal === "STRONG_BUY" ? 0 : 1) - (b.signal === "STRONG_BUY" ? 0 : 1));

      const slots = BACKTEST_MAX_POSITIONS - positions.length;
      for (const cand of candidates.slice(0, slots)) {
        // Size: fixed backtest position sizing
        let portfolioValue = cash;
        for (const pos of positions) {
          const b = data.barLookup.get(pos.symbol)?.get(date);
          portfolioValue += pos.shares * (b?.close ?? pos.entryPrice);
        }
        const posSize = portfolioValue * BACKTEST_POSITION_PCT;
        const shares = Math.floor(posSize / cand.price);
        if (shares <= 0 || shares * cand.price > cash) continue;

        cash -= shares * cand.price;
        positions.push({
          symbol: cand.symbol,
          entryPrice: cand.price,
          entryDateIdx: di,
          shares,
          peakPrice: cand.price,
        });
      }
    }

    // Record equity
    let equity = cash;
    for (const pos of positions) {
      const b = data.barLookup.get(pos.symbol)?.get(date);
      equity += pos.shares * (b?.close ?? pos.entryPrice);
    }
    equityHistory.push(equity);
    totalPositionDays += positions.length;
  }

  // Close remaining
  const lastDate = data.dates[endIdx - 1];
  for (const pos of positions) {
    const b = data.barLookup.get(pos.symbol)?.get(lastDate);
    const ep = b?.close ?? pos.entryPrice;
    cash += pos.shares * ep;
    const ret = (ep - pos.entryPrice) / pos.entryPrice;
    if (ret > 0) wins++; else losses++;
    const existing = perSymbol.get(pos.symbol) ?? { returnPct: 0, trades: 0 };
    existing.returnPct += ret * 100;
    existing.trades++;
    perSymbol.set(pos.symbol, existing);
  }

  const finalEquity = equityHistory[equityHistory.length - 1];
  const totalReturn = ((finalEquity - INITIAL_CASH) / INITIAL_CASH) * 100;
  const tradeCount = wins + losses;
  const daysInPeriod = endIdx - startIdx;

  // Sharpe from daily equity returns
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    dailyReturns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanRet = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const stdDev = dailyReturns.length > 1
    ? Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (dailyReturns.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0;

  // Max drawdown
  let peak = equityHistory[0], maxDrawdown = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    totalReturn,
    sharpeRatio,
    maxDrawdown,
    winRate: tradeCount > 0 ? wins / tradeCount : 0,
    tradeCount,
    avgPositions: daysInPeriod > 0 ? totalPositionDays / daysInPeriod : 0,
    buyHoldReturn: buyHold,
    excessReturn: totalReturn - buyHold,
    perSymbol,
  };
}

// ── Genetic Algorithm ───────────────────────────────────────────────

function randomParam(key: keyof OptimizableParams): number {
  const range = PARAM_RANGES[key];
  const val = range.min + Math.random() * (range.max - range.min);
  return range.step ? Math.round(val / range.step) * range.step : val;
}

function randomIndividual(): OptimizableParams {
  const p: Record<string, number> = {};
  for (const key of Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[]) p[key] = randomParam(key);
  if (p.emaFast >= p.emaSlow) p.emaSlow = p.emaFast + 5;
  return p as unknown as OptimizableParams;
}

function clampParam(key: keyof OptimizableParams, val: number): number {
  const range = PARAM_RANGES[key];
  let c = Math.max(range.min, Math.min(range.max, val));
  if (range.step) c = Math.round(c / range.step) * range.step;
  return c;
}

function crossover(a: OptimizableParams, b: OptimizableParams): OptimizableParams {
  const child: Record<string, number> = {};
  for (const key of Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[]) {
    child[key] = Math.random() < 0.5 ? a[key] : b[key];
  }
  if (child.emaFast >= child.emaSlow) child.emaSlow = child.emaFast + 5;
  return child as unknown as OptimizableParams;
}

function mutate(params: OptimizableParams, rate: number = MUTATION_RATE_BASE): OptimizableParams {
  const m = { ...params };
  for (const key of Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[]) {
    if (Math.random() < rate) {
      const range = PARAM_RANGES[key];
      m[key] = clampParam(key, params[key] + (Math.random() - 0.5) * (range.max - range.min) * 0.4);
    }
  }
  if (m.emaFast >= m.emaSlow) m.emaSlow = clampParam("emaSlow", m.emaFast + 5);
  return m;
}

function tournamentSelect(pop: Individual[]): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    if (!best || c.fitness > best.fitness) best = c;
  }
  return best!;
}

// ── Diversity helpers ──────────────────────────────────────────────

const paramKeys = Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[];
const paramRangeWidths = paramKeys.map((k) => PARAM_RANGES[k].max - PARAM_RANGES[k].min);

/** Average normalized Euclidean distance across sampled pairs (0 = identical, ~1 = max spread) */
function computeDiversity(pop: Individual[]): number {
  const n = pop.length;
  if (n < 2) return 0;

  const maxPairs = 500;
  let totalDist = 0;
  let pairs = 0;

  if ((n * (n - 1)) / 2 <= maxPairs) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dist = 0;
        for (let k = 0; k < paramKeys.length; k++) {
          const diff = (pop[i].params[paramKeys[k]] - pop[j].params[paramKeys[k]]) / paramRangeWidths[k];
          dist += diff * diff;
        }
        totalDist += Math.sqrt(dist);
        pairs++;
      }
    }
  } else {
    for (let s = 0; s < maxPairs; s++) {
      const i = Math.floor(Math.random() * n);
      let j = Math.floor(Math.random() * (n - 1));
      if (j >= i) j++;
      let dist = 0;
      for (let k = 0; k < paramKeys.length; k++) {
        const diff = (pop[i].params[paramKeys[k]] - pop[j].params[paramKeys[k]]) / paramRangeWidths[k];
        dist += diff * diff;
      }
      totalDist += Math.sqrt(dist);
      pairs++;
    }
  }

  return pairs > 0 ? totalDist / pairs : 0;
}

/** Scale mutation rate based on current population diversity */
function adaptiveMutationRate(diversity: number): number {
  if (diversity < DIVERSITY_LOW) {
    // Ramp up as diversity collapses
    return MUTATION_RATE_BASE + (MUTATION_RATE_MAX - MUTATION_RATE_BASE) * (1 - diversity / DIVERSITY_LOW);
  }
  if (diversity > DIVERSITY_HIGH) {
    // Ease off — population is well-spread
    return MUTATION_RATE_BASE - (MUTATION_RATE_BASE - MUTATION_RATE_MIN) * Math.min(1, (diversity - DIVERSITY_HIGH) / DIVERSITY_HIGH);
  }
  return MUTATION_RATE_BASE;
}

// ── Main Optimization Loop ──────────────────────────────────────────

export async function startOptimization(userId: string, config: OptimizationConfig): Promise<string> {
  const [run] = await db
    .insert(optimizationRuns)
    .values({
      userId, status: "pending", targetMetric: "total_return", universe: config.universe,
      populationSize: config.populationSize, generations: config.generations,
      trainPct: config.trainPct, totalSymbols: config.universe === "sp500" ? SP500_SYMBOLS.length : config.universe === "top150" ? TOP_150.length : TOP_50.length,
    })
    .returning({ id: optimizationRuns.id });

  const runId = run.id;
  g.__optimizerJobs!.set(runId, {
    runId, status: "pending", symbolsFetched: 0, totalSymbols: config.universe === "sp500" ? SP500_SYMBOLS.length : config.universe === "top150" ? TOP_150.length : TOP_50.length,
    currentGeneration: 0, totalGenerations: config.generations, bestFitness: 0, bestParams: null,
  });

  runOptimization(runId, config).catch((err) => {
    logger.error({ runId, err: (err as Error).message }, "Optimization failed");
  });
  return runId;
}

async function runOptimization(runId: string, config: OptimizationConfig) {
  const progress = g.__optimizerJobs!.get(runId)!;
  try {
    // ── Select universe ──
    const universeSymbols = config.universe === "sp500" ? SP500_SYMBOLS
      : config.universe === "top150" ? TOP_150
      : TOP_50;
    logger.info({ runId, universe: config.universe, symbols: universeSymbols.length }, "Universe selected");

    // ── Fetch data ──
    progress.status = "fetching_data";
    await db.update(optimizationRuns).set({ status: "fetching_data", startedAt: new Date() }).where(eq(optimizationRuns.id, runId));

    const barsMap = await fetchAllBars(universeSymbols, (fetched) => {
      progress.symbolsFetched = fetched;
      db.update(optimizationRuns).set({ symbolsFetched: fetched }).where(eq(optimizationRuns.id, runId)).catch(() => {});
    });
    logger.info({ runId, symbolCount: barsMap.size }, "Data fetching complete");

    // ── Build portfolio data ──
    progress.status = "optimizing";
    progress.totalSymbols = barsMap.size;
    await db.update(optimizationRuns).set({ status: "optimizing", totalSymbols: barsMap.size }).where(eq(optimizationRuns.id, runId));

    const portfolioData = buildPortfolioData(barsMap, config.trainPct);
    logger.info({ runId, symbols: portfolioData.symbols.length, dates: portfolioData.dates.length, buyHoldTrain: portfolioData.avgBuyHoldTrain.toFixed(1), buyHoldTest: portfolioData.avgBuyHoldTest.toFixed(1) }, "Portfolio data ready");

    // ── Baseline ──
    const baselineParams: OptimizableParams = {
      stopLossPct: 0.02, takeProfitPct: 0.03, trailingStopPct: 0.015, holdPeriod: 20,
      rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21, rsThreshold: -0.05,
    };
    const baselineTrain = portfolioBacktest(portfolioData, baselineParams, "train");
    const baselineTest = portfolioBacktest(portfolioData, baselineParams, "test");
    logger.info({ runId, baselineTrain: baselineTrain.totalReturn.toFixed(1), baselineTest: baselineTest.totalReturn.toFixed(1), buyHoldTrain: baselineTrain.buyHoldReturn.toFixed(1) }, "Baseline computed");

    // ── GA ──
    // Fitness = portfolio total return (excess over buy-and-hold)
    const presetSeeds: OptimizableParams[] = Object.values(STRATEGY_PRESETS).map((p) => ({
      stopLossPct: p.stopLossPct, takeProfitPct: p.takeProfitPct,
      trailingStopPct: p.trailingStopPct, holdPeriod: p.holdPeriod,
      rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21, rsThreshold: -0.05,
    }));

    let population: Individual[] = [];
    const initParams = [...presetSeeds, ...Array.from({ length: Math.max(0, config.populationSize - presetSeeds.length) }, () => randomIndividual())];

    for (let pi = 0; pi < initParams.length; pi++) {
      const r = portfolioBacktest(portfolioData, initParams[pi], "train");
      population.push({ params: initParams[pi], fitness: r.excessReturn });
      // Yield every 5 evaluations to keep HTTP alive
      if (pi % 5 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    population.sort((a, b) => b.fitness - a.fitness);
    let bestEver = population[0];

    let stagnationCount = 0;

    for (let gen = 0; gen < config.generations; gen++) {
      // ── Measure diversity & adapt mutation ──
      const diversity = computeDiversity(population);
      const isStagnant = stagnationCount >= STAGNATION_GENS;
      const mutRate = isStagnant
        ? MUTATION_RATE_MAX   // hypermutation on stagnation
        : adaptiveMutationRate(diversity);

      const nextPop: Individual[] = [];

      // ── Elitism: top N survive unchanged ──
      for (let i = 0; i < ELITISM && i < population.length; i++) nextPop.push(population[i]);

      // ── Random immigrants: inject fresh genes ──
      const immigrantCount = Math.floor(
        config.populationSize * (isStagnant ? STAGNATION_IMMIGRANT_RATE : IMMIGRANT_RATE)
      );
      let evalCount = 0;
      for (let i = 0; i < immigrantCount; i++) {
        const imm = randomIndividual();
        const r = portfolioBacktest(portfolioData, imm, "train");
        nextPop.push({ params: imm, fitness: r.excessReturn });
        if (++evalCount % 3 === 0) await new Promise((r) => setTimeout(r, 1));
      }

      // ── Breed the rest via crossover + adaptive mutation ──
      while (nextPop.length < config.populationSize) {
        const p1 = tournamentSelect(population), p2 = tournamentSelect(population);
        const childParams = Math.random() < CROSSOVER_RATE
          ? mutate(crossover(p1.params, p2.params), mutRate)
          : mutate(p1.params, mutRate);
        const r = portfolioBacktest(portfolioData, childParams, "train");
        nextPop.push({ params: childParams, fitness: r.excessReturn });
        if (++evalCount % 3 === 0) await new Promise((r) => setTimeout(r, 1));
      }

      population = nextPop.sort((a, b) => b.fitness - a.fitness);
      const prevBest = bestEver.fitness;
      if (population[0].fitness > bestEver.fitness) bestEver = population[0];

      // ── Stagnation tracking ──
      if (bestEver.fitness <= prevBest + 0.01) {
        stagnationCount++;
      } else {
        stagnationCount = 0;
      }

      progress.currentGeneration = gen + 1;
      progress.bestFitness = bestEver.fitness;
      progress.bestParams = bestEver.params;

      const fitnesses = population.map((i) => i.fitness);
      const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
      await db.insert(optimizationGenerations).values({
        runId, generation: gen + 1,
        bestFitness: population[0].fitness,
        avgFitness,
        worstFitness: fitnesses[fitnesses.length - 1],
        bestParams: population[0].params,
        diversity,
      });
      await db.update(optimizationRuns).set({ currentGeneration: gen + 1 }).where(eq(optimizationRuns.id, runId));

      logger.info({
        runId, gen: gen + 1,
        bestExcess: population[0].fitness.toFixed(1),
        avg: avgFitness.toFixed(1),
        diversity: diversity.toFixed(3),
        mutRate: mutRate.toFixed(2),
        immigrants: immigrantCount,
        stagnation: stagnationCount,
      }, "Generation complete");
    }

    // ── Validate ──
    const trainResult = portfolioBacktest(portfolioData, bestEver.params, "train");
    const testResult = portfolioBacktest(portfolioData, bestEver.params, "test");

    // Store per-symbol results
    const rows = [];
    for (const symbol of portfolioData.symbols) {
      const tr = trainResult.perSymbol.get(symbol);
      const te = testResult.perSymbol.get(symbol);
      rows.push({
        runId, symbol,
        totalReturn: (tr?.returnPct ?? 0) + (te?.returnPct ?? 0),
        sharpeRatio: null, maxDrawdown: null,
        winRate: null,
        tradeCount: (tr?.trades ?? 0) + (te?.trades ?? 0),
        trainReturn: tr?.returnPct ?? null,
        testReturn: te?.returnPct ?? null,
      });
    }
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(optimizationSymbolResults).values(rows.slice(i, i + 100));
    }

    await db.update(optimizationRuns).set({
      status: "complete", completedAt: new Date(),
      bestParams: bestEver.params,
      bestTrainReturn: trainResult.totalReturn,
      bestTestReturn: testResult.totalReturn,
      baselineTrainReturn: baselineTrain.totalReturn,
      baselineTestReturn: baselineTest.totalReturn,
      trainSharpe: trainResult.sharpeRatio,
      testSharpe: testResult.sharpeRatio,
      trainMaxDrawdown: trainResult.maxDrawdown,
      testMaxDrawdown: testResult.maxDrawdown,
    }).where(eq(optimizationRuns.id, runId));

    progress.status = "complete";
    logger.info({
      runId, trainReturn: trainResult.totalReturn.toFixed(1), testReturn: testResult.totalReturn.toFixed(1),
      trainExcess: trainResult.excessReturn.toFixed(1), testExcess: testResult.excessReturn.toFixed(1),
      avgPositions: trainResult.avgPositions.toFixed(1), buyHoldTrain: trainResult.buyHoldReturn.toFixed(1),
    }, "Optimization complete");

    setTimeout(() => g.__optimizerJobs!.delete(runId), 60 * 60 * 1000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ runId, err: msg }, "Optimization failed");
    progress.status = "failed";
    await db.update(optimizationRuns).set({ status: "failed", error: msg, completedAt: new Date() }).where(eq(optimizationRuns.id, runId)).catch(() => {});
    setTimeout(() => g.__optimizerJobs!.delete(runId), 10 * 60 * 1000);
  }
}
