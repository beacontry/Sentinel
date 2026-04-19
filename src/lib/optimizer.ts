import type { Bar } from "@/types";
import { analyzeBars } from "./indicators/analyzer";
import { runBacktest, type BacktestResult } from "./backtester";
import { getMarketDataProvider } from "./market-data";
import { SP500_SYMBOLS } from "./sp500";
import { STRATEGY_PRESETS } from "./strategy-presets";
import { db } from "./db";
import {
  optimizationRuns,
  optimizationGenerations,
  optimizationSymbolResults,
} from "./db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
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
  positionPct: number;       // % of account to risk per trade (5-50%)
  rsiOversold: number;       // RSI threshold for bullish signal (20-40)
  rsiOverbought: number;     // RSI threshold for bearish signal (60-80)
  emaFast: number;           // Fast EMA period (5-15)
  emaSlow: number;           // Slow EMA period (15-50)
}

interface ParamRange {
  min: number;
  max: number;
  step?: number;
}

interface Individual {
  params: OptimizableParams;
  fitness: number;
}

export interface OptimizationConfig {
  populationSize: number;
  generations: number;
  trainPct: number;
  universe: "sp500" | "sp100";
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
  takeProfitPct:   { min: 0.02,  max: 0.25 },
  trailingStopPct: { min: 0.008, max: 0.12 },
  holdPeriod:      { min: 3,     max: 60, step: 1 },
  positionPct:     { min: 0.05,  max: 0.50 },
  rsiOversold:     { min: 20,    max: 40, step: 1 },
  rsiOverbought:   { min: 60,    max: 80, step: 1 },
  emaFast:         { min: 5,     max: 15, step: 1 },
  emaSlow:         { min: 15,    max: 50, step: 1 },
};

const WINDOW_SIZE = 50;
const STEP_SIZE = 5;
const ELITISM = 2;
const TOURNAMENT_SIZE = 3;
const MUTATION_RATE = 0.20;
const CROSSOVER_RATE = 0.85;
const DATA_DAYS = 1825; // 5 years
const FETCH_CONCURRENCY = 3;
const FETCH_DELAY_MS = 300;
const INITIAL_CASH = 10000;

const CACHE_DIR = join(
  process.env.NODE_ENV === "production" ? "/tmp" : join(process.cwd(), "data"),
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

function setJobProgress(runId: string, progress: OptimizationProgress) {
  g.__optimizerJobs!.set(runId, progress);
}

function removeJob(runId: string) {
  g.__optimizerJobs!.delete(runId);
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

async function getCachedBars(symbol: string): Promise<Bar[] | null> {
  const path = cacheKey(symbol);
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as { bars: Bar[]; fetchedAt: string };
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return data.bars;
    }
    return null;
  } catch {
    return null;
  }
}

async function cacheBars(symbol: string, bars: Bar[]) {
  const path = cacheKey(symbol);
  try {
    await writeFile(path, JSON.stringify({ bars, fetchedAt: new Date().toISOString() }));
  } catch (err) {
    logger.warn({ symbol, err: (err as Error).message }, "Failed to cache bars");
  }
}

async function fetchSymbolBars(symbol: string): Promise<Bar[]> {
  const cached = await getCachedBars(symbol);
  if (cached && cached.length > 200) return cached;

  const provider = getMarketDataProvider();
  try {
    const bars = await provider.fetchBars(symbol, DATA_DAYS, "1d");
    if (bars.length > 200) {
      await cacheBars(symbol, bars);
    }
    return bars;
  } catch (err) {
    logger.warn({ symbol, err: (err as Error).message }, "Failed to fetch bars");
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
    const results = await Promise.allSettled(
      batch.map((sym) => fetchSymbolBars(sym))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value.length > 200) {
        barsMap.set(batch[j], result.value);
      }
      fetched++;
    }

    onProgress(fetched);

    if (i + FETCH_CONCURRENCY < symbols.length) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    }
  }

  return barsMap;
}

// ── Inline signal evaluation (optimizable parameters) ───────────────

type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

/**
 * Lightweight signal evaluator with tunable RSI/EMA thresholds.
 * Uses the same indicators as analyzeBars but with customizable params.
 */
function evaluateBarSignal(
  bars: Bar[],
  params: OptimizableParams
): SignalType {
  if (bars.length < 50) return "HOLD";

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const price = closes[closes.length - 1];
  const volume = volumes[volumes.length - 1];

  let bullScore = 0;
  let bearScore = 0;

  // ── EMA crossover (tunable periods) ──
  const emaFast = calcEMA(closes, params.emaFast);
  const emaSlow = calcEMA(closes, params.emaSlow);
  if (emaFast !== null && emaSlow !== null) {
    if (emaFast > emaSlow) bullScore++;
    else bearScore++;

    // Fresh crossover detection (last 3 bars)
    const prevFast = calcEMA(closes.slice(0, -1), params.emaFast);
    const prevSlow = calcEMA(closes.slice(0, -1), params.emaSlow);
    if (prevFast !== null && prevSlow !== null) {
      if (prevFast <= prevSlow && emaFast > emaSlow) bullScore++;
      if (prevFast >= prevSlow && emaFast < emaSlow) bearScore++;
    }
  }

  // ── RSI (tunable thresholds) ──
  const rsi = calcRSI(closes, 14);
  if (rsi !== null) {
    if (rsi < params.rsiOversold) {
      bullScore += 2;
    } else if (rsi > params.rsiOverbought) {
      bearScore += 2;
    } else if (rsi > 55) {
      bullScore++;
    } else if (rsi < 45) {
      bearScore++;
    }
  }

  // ── SMA 20 trend ──
  const sma20 = calcSMA(closes, 20);
  if (sma20 !== null) {
    if (price > sma20) bullScore++;
    else bearScore++;
  }

  // ── SMA 50 alignment ──
  const sma50 = calcSMA(closes, 50);
  const sma50Aligned = sma50 !== null &&
    ((bullScore > bearScore && price > sma50) ||
     (bearScore > bullScore && price < sma50));

  // ── MACD ──
  const macdHist = calcMACDHistogram(closes);
  if (macdHist !== null) {
    if (macdHist > 0) bullScore++;
    else bearScore++;
  }

  // ── Volume confirmation ──
  const avgVol = volumes.length >= 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : null;
  const volumeConfirmed = avgVol !== null && volume > avgVol * 1.5;

  // ── Determine signal ──
  if (bullScore >= 4 && bullScore > bearScore + 2) {
    if (volumeConfirmed && sma50Aligned) return "STRONG_BUY";
    return "BUY";
  } else if (bearScore >= 4 && bearScore > bullScore + 2) {
    if (volumeConfirmed && sma50Aligned) return "STRONG_SELL";
    return "SELL";
  }
  return "HOLD";
}

// ── Minimal indicator helpers (avoid full indicator class overhead) ──

function calcSMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  let sum = 0;
  for (let i = data.length - period; i < data.length; i++) sum += data[i];
  return sum / period;
}

function calcEMA(data: number[], period: number): number | null {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(data: number[], period: number): number | null {
  if (data.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMACDHistogram(data: number[]): number | null {
  if (data.length < 35) return null;
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  if (ema12 === null || ema26 === null) return null;
  const macdLine = ema12 - ema26;
  // Approximate signal line from recent MACD values
  const recentMacd: number[] = [];
  for (let len = data.length - 9; len <= data.length; len++) {
    const e12 = calcEMA(data.slice(0, len), 12);
    const e26 = calcEMA(data.slice(0, len), 26);
    if (e12 !== null && e26 !== null) recentMacd.push(e12 - e26);
  }
  const signalLine = recentMacd.length >= 9 ? calcEMA(recentMacd, 9) : null;
  if (signalLine === null) return macdLine > 0 ? 1 : -1;
  return macdLine - signalLine;
}

// ── Signal pre-computation (with tunable params) ────────────────────

interface PrecomputedBars {
  trainBars: Bar[];
  testBars: Bar[];
  /** Buy-and-hold return for comparison */
  trainBuyHold: number;
  testBuyHold: number;
}

function prepareSymbolData(
  bars: Bar[],
  trainPct: number
): PrecomputedBars {
  const splitIdx = Math.floor(bars.length * (trainPct / 100));
  const trainBars = bars.slice(0, splitIdx);
  const testBars = bars.slice(splitIdx);

  const trainBuyHold = trainBars.length > 1
    ? ((trainBars[trainBars.length - 1].close - trainBars[0].close) / trainBars[0].close) * 100
    : 0;
  const testBuyHold = testBars.length > 1
    ? ((testBars[testBars.length - 1].close - testBars[0].close) / testBars[0].close) * 100
    : 0;

  return { trainBars, testBars, trainBuyHold, testBuyHold };
}

// ── Fast backtester (inline signals + tunable position sizing) ──────

interface FastBacktestResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
  buyHoldReturn: number;
  excessReturn: number;
}

function fastBacktest(
  bars: Bar[],
  params: OptimizableParams,
  buyHoldReturn: number
): FastBacktestResult {
  let cash = INITIAL_CASH;
  const equityPoints: number[] = [INITIAL_CASH];
  let wins = 0;
  let losses = 0;

  let position: {
    entryPrice: number;
    entryIdx: number;
    shares: number;
    peakPrice: number;
  } | null = null;

  for (let i = WINDOW_SIZE; i < bars.length; i++) {
    const bar = bars[i];

    if (position) {
      if (bar.high > position.peakPrice) {
        position.peakPrice = bar.high;
      }

      let exitPrice: number | null = null;

      const fixedStop = position.entryPrice * (1 - params.stopLossPct);
      const trailingStop = position.peakPrice * (1 - params.trailingStopPct);
      const effectiveStop = Math.max(fixedStop, trailingStop);

      if (bar.low <= effectiveStop) {
        exitPrice = effectiveStop;
      }

      if (!exitPrice) {
        const tpLevel = position.entryPrice * (1 + params.takeProfitPct);
        if (bar.high >= tpLevel) {
          exitPrice = tpLevel;
        }
      }

      // Sell signal check (every stepSize bars)
      if (!exitPrice && (i - WINDOW_SIZE) % STEP_SIZE === 0) {
        const windowBars = bars.slice(Math.max(0, i - WINDOW_SIZE), i);
        const sig = evaluateBarSignal(windowBars, params);
        if (sig === "SELL" || sig === "STRONG_SELL") {
          exitPrice = bar.close;
        }
      }

      if (!exitPrice && (i - position.entryIdx) >= params.holdPeriod) {
        exitPrice = bar.close;
      }

      if (exitPrice !== null) {
        cash += position.shares * exitPrice;
        if (exitPrice > position.entryPrice) wins++;
        else losses++;
        equityPoints.push(cash);
        position = null;
      }
      continue;
    }

    // Entry: check signal at step boundaries
    if ((i - WINDOW_SIZE) % STEP_SIZE !== 0) continue;

    const windowBars = bars.slice(Math.max(0, i - WINDOW_SIZE), i);
    const sig = evaluateBarSignal(windowBars, params);
    if (sig !== "BUY" && sig !== "STRONG_BUY") continue;

    const entryPrice = bar.close;
    const stopDistance = entryPrice * params.stopLossPct;
    if (stopDistance <= 0) continue;

    // Position sizing: risk positionPct of current equity
    const totalEquity = cash;
    const riskAmount = totalEquity * params.positionPct;
    const riskBasedShares = Math.floor(riskAmount / stopDistance);
    const affordableShares = Math.floor(cash / entryPrice);
    const shares = Math.min(riskBasedShares, affordableShares);
    if (shares <= 0) continue;

    cash -= shares * entryPrice;
    position = { entryPrice, entryIdx: i, shares, peakPrice: entryPrice };
  }

  // Close remaining position
  if (position) {
    const lastBar = bars[bars.length - 1];
    cash += position.shares * lastBar.close;
    if (lastBar.close > position.entryPrice) wins++;
    else losses++;
    equityPoints.push(cash);
  }

  const totalReturn = ((cash - INITIAL_CASH) / INITIAL_CASH) * 100;
  const tradeCount = wins + losses;
  const winRate = tradeCount > 0 ? wins / tradeCount : 0;
  const excessReturn = totalReturn - buyHoldReturn;

  // Max drawdown
  let peak = equityPoints[0];
  let maxDrawdown = 0;
  for (const val of equityPoints) {
    if (val > peak) peak = val;
    const dd = ((peak - val) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio
  const returns: number[] = [];
  for (let i = 1; i < equityPoints.length; i++) {
    returns.push((equityPoints[i] - equityPoints[i - 1]) / equityPoints[i - 1]);
  }
  const meanRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0;

  return { totalReturn, sharpeRatio, maxDrawdown, winRate, tradeCount, buyHoldReturn, excessReturn };
}

// ── Batch backtest across all symbols ───────────────────────────────

function batchBacktest(
  symbolData: Map<string, PrecomputedBars>,
  params: OptimizableParams,
  segment: "train" | "test"
): { avgReturn: number; avgExcess: number; results: Map<string, FastBacktestResult> } {
  const results = new Map<string, FastBacktestResult>();
  let totalReturn = 0;
  let totalExcess = 0;
  let count = 0;

  for (const [symbol, data] of symbolData) {
    const bars = segment === "train" ? data.trainBars : data.testBars;
    const buyHold = segment === "train" ? data.trainBuyHold : data.testBuyHold;

    if (bars.length < WINDOW_SIZE + 20) continue;

    const result = fastBacktest(bars, params, buyHold);
    results.set(symbol, result);
    totalReturn += result.totalReturn;
    totalExcess += result.excessReturn;
    count++;
  }

  return {
    avgReturn: count > 0 ? totalReturn / count : 0,
    avgExcess: count > 0 ? totalExcess / count : 0,
    results,
  };
}

// ── Genetic Algorithm ───────────────────────────────────────────────

function randomParam(key: keyof OptimizableParams): number {
  const range = PARAM_RANGES[key];
  const val = range.min + Math.random() * (range.max - range.min);
  return range.step ? Math.round(val / range.step) * range.step : val;
}

function randomIndividual(): OptimizableParams {
  const params: Record<string, number> = {};
  for (const key of Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[]) {
    params[key] = randomParam(key);
  }
  // Enforce emaFast < emaSlow
  if (params.emaFast >= params.emaSlow) {
    params.emaSlow = params.emaFast + 5;
  }
  return params as unknown as OptimizableParams;
}

function clampParam(key: keyof OptimizableParams, val: number): number {
  const range = PARAM_RANGES[key];
  let clamped = Math.max(range.min, Math.min(range.max, val));
  if (range.step) clamped = Math.round(clamped / range.step) * range.step;
  return clamped;
}

function crossover(a: OptimizableParams, b: OptimizableParams): OptimizableParams {
  const keys = Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[];
  const child: Record<string, number> = {};
  for (const key of keys) {
    child[key] = Math.random() < 0.5 ? a[key] : b[key];
  }
  // Enforce emaFast < emaSlow
  if (child.emaFast >= child.emaSlow) {
    child.emaSlow = child.emaFast + 5;
  }
  return child as unknown as OptimizableParams;
}

function mutate(params: OptimizableParams): OptimizableParams {
  const keys = Object.keys(PARAM_RANGES) as (keyof OptimizableParams)[];
  const mutated = { ...params };
  for (const key of keys) {
    if (Math.random() < MUTATION_RATE) {
      const range = PARAM_RANGES[key];
      const span = range.max - range.min;
      const perturbation = (Math.random() - 0.5) * span * 0.4;
      mutated[key] = clampParam(key, params[key] + perturbation);
    }
  }
  // Enforce emaFast < emaSlow
  if (mutated.emaFast >= mutated.emaSlow) {
    mutated.emaSlow = clampParam("emaSlow", mutated.emaFast + 5);
  }
  return mutated;
}

function tournamentSelect(population: Individual[]): Individual {
  let best: Individual | null = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (!best || population[idx].fitness > best.fitness) {
      best = population[idx];
    }
  }
  return best!;
}

// ── Main Optimization Loop ──────────────────────────────────────────

export async function startOptimization(
  userId: string,
  config: OptimizationConfig
): Promise<string> {
  const [run] = await db
    .insert(optimizationRuns)
    .values({
      userId,
      status: "pending",
      targetMetric: "total_return",
      universe: config.universe,
      populationSize: config.populationSize,
      generations: config.generations,
      trainPct: config.trainPct,
      totalSymbols: SP500_SYMBOLS.length,
    })
    .returning({ id: optimizationRuns.id });

  const runId = run.id;

  setJobProgress(runId, {
    runId,
    status: "pending",
    symbolsFetched: 0,
    totalSymbols: SP500_SYMBOLS.length,
    currentGeneration: 0,
    totalGenerations: config.generations,
    bestFitness: 0,
    bestParams: null,
  });

  runOptimization(runId, config).catch((err) => {
    logger.error({ runId, err: (err as Error).message }, "Optimization failed");
  });

  return runId;
}

async function runOptimization(runId: string, config: OptimizationConfig) {
  const progress = g.__optimizerJobs!.get(runId)!;

  try {
    // ── Phase 1: Fetch data ──
    progress.status = "fetching_data";
    await db
      .update(optimizationRuns)
      .set({ status: "fetching_data", startedAt: new Date() })
      .where(eq(optimizationRuns.id, runId));

    const symbols = SP500_SYMBOLS;
    const barsMap = await fetchAllBars(symbols, (fetched) => {
      progress.symbolsFetched = fetched;
      db.update(optimizationRuns)
        .set({ symbolsFetched: fetched })
        .where(eq(optimizationRuns.id, runId))
        .then(() => {})
        .catch(() => {});
    });

    logger.info({ runId, symbolCount: barsMap.size }, "Data fetching complete");

    // ── Phase 2: Prepare data (with buy-and-hold benchmarks) ──
    progress.status = "optimizing";
    progress.totalSymbols = barsMap.size;
    await db
      .update(optimizationRuns)
      .set({ status: "optimizing", totalSymbols: barsMap.size })
      .where(eq(optimizationRuns.id, runId));

    const symbolData = new Map<string, PrecomputedBars>();
    for (const [symbol, bars] of barsMap) {
      symbolData.set(symbol, prepareSymbolData(bars, config.trainPct));
    }

    logger.info({ runId, symbols: symbolData.size }, "Data preparation complete");

    // ── Phase 3: Baseline (moderate preset) ──
    const baselineParams: OptimizableParams = {
      stopLossPct: STRATEGY_PRESETS.moderate.stopLossPct,
      takeProfitPct: STRATEGY_PRESETS.moderate.takeProfitPct,
      trailingStopPct: STRATEGY_PRESETS.moderate.trailingStopPct,
      holdPeriod: STRATEGY_PRESETS.moderate.holdPeriod,
      positionPct: 0.10,
      rsiOversold: 30,
      rsiOverbought: 70,
      emaFast: 9,
      emaSlow: 21,
    };
    const baselineTrain = batchBacktest(symbolData, baselineParams, "train");
    const baselineTest = batchBacktest(symbolData, baselineParams, "test");

    logger.info(
      {
        runId,
        trainReturn: baselineTrain.avgReturn.toFixed(2),
        trainExcess: baselineTrain.avgExcess.toFixed(2),
        testReturn: baselineTest.avgReturn.toFixed(2),
      },
      "Baseline computed"
    );

    // ── Phase 4: Genetic Algorithm ──
    // Fitness = average excess return over buy-and-hold
    let population: Individual[] = [];

    // Seed with presets + random
    const presetSeeds: OptimizableParams[] = Object.values(STRATEGY_PRESETS).map((p) => ({
      stopLossPct: p.stopLossPct,
      takeProfitPct: p.takeProfitPct,
      trailingStopPct: p.trailingStopPct,
      holdPeriod: p.holdPeriod,
      positionPct: 0.15,
      rsiOversold: 30,
      rsiOverbought: 70,
      emaFast: 9,
      emaSlow: 21,
    }));

    const initialParams: OptimizableParams[] = [
      ...presetSeeds,
      ...Array.from({ length: Math.max(0, config.populationSize - presetSeeds.length) }, () => randomIndividual()),
    ];

    for (const params of initialParams) {
      const result = batchBacktest(symbolData, params, "train");
      population.push({ params, fitness: result.avgExcess });
    }
    population.sort((a, b) => b.fitness - a.fitness);

    let bestEver: Individual = population[0];

    for (let gen = 0; gen < config.generations; gen++) {
      await new Promise((r) => setTimeout(r, 0));

      const nextPop: Individual[] = [];

      for (let i = 0; i < ELITISM && i < population.length; i++) {
        nextPop.push(population[i]);
      }

      while (nextPop.length < config.populationSize) {
        const parent1 = tournamentSelect(population);
        const parent2 = tournamentSelect(population);

        let childParams: OptimizableParams;
        if (Math.random() < CROSSOVER_RATE) {
          childParams = mutate(crossover(parent1.params, parent2.params));
        } else {
          childParams = mutate(parent1.params);
        }

        const result = batchBacktest(symbolData, childParams, "train");
        nextPop.push({ params: childParams, fitness: result.avgExcess });
      }

      population = nextPop.sort((a, b) => b.fitness - a.fitness);

      if (population[0].fitness > bestEver.fitness) {
        bestEver = population[0];
      }

      progress.currentGeneration = gen + 1;
      progress.bestFitness = bestEver.fitness;
      progress.bestParams = bestEver.params;

      const fitnesses = population.map((ind) => ind.fitness);
      await db.insert(optimizationGenerations).values({
        runId,
        generation: gen + 1,
        bestFitness: population[0].fitness,
        avgFitness: fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length,
        worstFitness: fitnesses[fitnesses.length - 1],
        bestParams: population[0].params,
      });

      await db
        .update(optimizationRuns)
        .set({ currentGeneration: gen + 1 })
        .where(eq(optimizationRuns.id, runId));

      logger.info(
        { runId, gen: gen + 1, bestExcess: population[0].fitness.toFixed(2), avg: (fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length).toFixed(2) },
        "Generation complete"
      );
    }

    // ── Phase 5: Validate on test data ──
    const testResult = batchBacktest(symbolData, bestEver.params, "test");
    const trainResult = batchBacktest(symbolData, bestEver.params, "train");

    // Store per-symbol results
    const symbolResultRows = [];
    for (const [symbol] of symbolData) {
      const tr = trainResult.results.get(symbol);
      const te = testResult.results.get(symbol);
      if (!tr && !te) continue;

      symbolResultRows.push({
        runId,
        symbol,
        totalReturn: (tr?.totalReturn ?? 0) + (te?.totalReturn ?? 0),
        sharpeRatio: te?.sharpeRatio ?? tr?.sharpeRatio ?? null,
        maxDrawdown: te?.maxDrawdown ?? tr?.maxDrawdown ?? null,
        winRate: te?.winRate ?? tr?.winRate ?? null,
        tradeCount: (tr?.tradeCount ?? 0) + (te?.tradeCount ?? 0),
        trainReturn: tr?.totalReturn ?? null,
        testReturn: te?.totalReturn ?? null,
      });
    }

    for (let i = 0; i < symbolResultRows.length; i += 100) {
      const batch = symbolResultRows.slice(i, i + 100);
      await db.insert(optimizationSymbolResults).values(batch);
    }

    // Aggregate metrics
    const testReturns = Array.from(testResult.results.values());
    const avgTestSharpe = testReturns.length > 0
      ? testReturns.reduce((s, r) => s + r.sharpeRatio, 0) / testReturns.length : 0;
    const avgTestDrawdown = testReturns.length > 0
      ? testReturns.reduce((s, r) => s + r.maxDrawdown, 0) / testReturns.length : 0;
    const trainReturns = Array.from(trainResult.results.values());
    const avgTrainSharpe = trainReturns.length > 0
      ? trainReturns.reduce((s, r) => s + r.sharpeRatio, 0) / trainReturns.length : 0;
    const avgTrainDrawdown = trainReturns.length > 0
      ? trainReturns.reduce((s, r) => s + r.maxDrawdown, 0) / trainReturns.length : 0;

    // ── Phase 6: Finalize ──
    await db
      .update(optimizationRuns)
      .set({
        status: "complete",
        completedAt: new Date(),
        bestParams: bestEver.params,
        bestTrainReturn: trainResult.avgReturn,
        bestTestReturn: testResult.avgReturn,
        baselineTrainReturn: baselineTrain.avgReturn,
        baselineTestReturn: baselineTest.avgReturn,
        trainSharpe: avgTrainSharpe,
        testSharpe: avgTestSharpe,
        trainMaxDrawdown: avgTrainDrawdown,
        testMaxDrawdown: avgTestDrawdown,
      })
      .where(eq(optimizationRuns.id, runId));

    progress.status = "complete";

    logger.info(
      {
        runId,
        bestParams: bestEver.params,
        trainReturn: trainResult.avgReturn.toFixed(2),
        trainExcess: bestEver.fitness.toFixed(2),
        testReturn: testResult.avgReturn.toFixed(2),
        testExcess: testResult.avgExcess.toFixed(2),
      },
      "Optimization complete"
    );

    setTimeout(() => removeJob(runId), 60 * 60 * 1000);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ runId, err: message }, "Optimization failed");

    progress.status = "failed";

    await db
      .update(optimizationRuns)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(optimizationRuns.id, runId))
      .catch(() => {});

    setTimeout(() => removeJob(runId), 10 * 60 * 1000);
  }
}
