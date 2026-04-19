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
  stopLossPct:    { min: 0.005, max: 0.10 },
  takeProfitPct:  { min: 0.01,  max: 0.20 },
  trailingStopPct:{ min: 0.005, max: 0.10 },
  holdPeriod:     { min: 3,     max: 60, step: 1 },
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
    // Cache valid for 24 hours
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

  // Fetch in batches with concurrency limit
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

    // Rate limit between batches
    if (i + FETCH_CONCURRENCY < symbols.length) {
      await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    }
  }

  return barsMap;
}

// ── Signal pre-computation ──────────────────────────────────────────

type SignalType = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

interface PrecomputedData {
  bars: Bar[];
  /** Signal at each bar index (from windowSize onward, step-aligned) */
  signals: Map<number, SignalType>;
  trainBars: Bar[];
  testBars: Bar[];
  trainSignals: Map<number, SignalType>;
  testSignals: Map<number, SignalType>;
}

function precomputeSignals(
  symbol: string,
  bars: Bar[],
  windowSize: number,
  stepSize: number
): Map<number, SignalType> {
  const signals = new Map<number, SignalType>();

  for (let i = windowSize; i < bars.length; i++) {
    if ((i - windowSize) % stepSize !== 0) continue;
    const windowBars = bars.slice(i - windowSize, i);
    if (windowBars.length < 30) continue;
    const result = analyzeBars(symbol, windowBars);
    signals.set(i, result.signal as SignalType);
  }

  return signals;
}

function prepareSymbolData(
  symbol: string,
  bars: Bar[],
  trainPct: number
): PrecomputedData {
  const splitIdx = Math.floor(bars.length * (trainPct / 100));
  const trainBars = bars.slice(0, splitIdx);
  const testBars = bars.slice(splitIdx);

  const signals = precomputeSignals(symbol, bars, WINDOW_SIZE, STEP_SIZE);
  const trainSignals = new Map<number, SignalType>();
  const testSignals = new Map<number, SignalType>();

  // Re-compute signals separately for train and test sets
  // This avoids look-ahead bias from the full signal set
  const trainSigs = precomputeSignals(symbol, trainBars, WINDOW_SIZE, STEP_SIZE);
  const testSigs = precomputeSignals(symbol, testBars, WINDOW_SIZE, STEP_SIZE);

  return {
    bars,
    signals,
    trainBars,
    testBars,
    trainSignals: trainSigs,
    testSignals: testSigs,
  };
}

// ── Fast backtester (uses pre-computed signals) ─────────────────────

interface FastBacktestResult {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  tradeCount: number;
}

function fastBacktest(
  bars: Bar[],
  signals: Map<number, SignalType>,
  params: OptimizableParams
): FastBacktestResult {
  const initialCash = 10000;
  let cash = initialCash;
  const equityPoints: number[] = [initialCash];
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

      // Fixed stop vs trailing stop — use tighter (higher)
      const fixedStop = position.entryPrice * (1 - params.stopLossPct);
      const trailingStop = position.peakPrice * (1 - params.trailingStopPct);
      const effectiveStop = Math.max(fixedStop, trailingStop);

      if (bar.low <= effectiveStop) {
        exitPrice = effectiveStop;
      }

      // Take profit
      if (!exitPrice) {
        const tpLevel = position.entryPrice * (1 + params.takeProfitPct);
        if (bar.high >= tpLevel) {
          exitPrice = tpLevel;
        }
      }

      // Sell signal
      if (!exitPrice) {
        const sig = signals.get(i);
        if (sig === "SELL" || sig === "STRONG_SELL") {
          exitPrice = bar.close;
        }
      }

      // Hold period expired
      if (!exitPrice && (i - position.entryIdx) >= params.holdPeriod) {
        exitPrice = bar.close;
      }

      if (exitPrice !== null) {
        const returnPct = (exitPrice - position.entryPrice) / position.entryPrice;
        cash += position.shares * exitPrice;
        if (returnPct > 0) wins++;
        else losses++;
        equityPoints.push(cash);
        position = null;
      }
      continue;
    }

    // Check for entry signal
    const sig = signals.get(i);
    if (sig !== "BUY" && sig !== "STRONG_BUY") continue;

    const entryPrice = bar.close;
    const stopDistance = entryPrice * params.stopLossPct;
    if (stopDistance <= 0) continue;

    const riskBasedShares = Math.floor(100 / stopDistance); // $100 max loss per trade
    const affordableShares = Math.floor(cash / entryPrice);
    const shares = Math.min(riskBasedShares, 100, affordableShares);
    if (shares <= 0) continue;

    cash -= shares * entryPrice;
    position = { entryPrice, entryIdx: i, shares, peakPrice: entryPrice };
  }

  // Close remaining position
  if (position) {
    const lastBar = bars[bars.length - 1];
    cash += position.shares * lastBar.close;
    const returnPct = (lastBar.close - position.entryPrice) / position.entryPrice;
    if (returnPct > 0) wins++;
    else losses++;
    equityPoints.push(cash);
  }

  const totalReturn = ((cash - initialCash) / initialCash) * 100;
  const tradeCount = wins + losses;
  const winRate = tradeCount > 0 ? wins / tradeCount : 0;

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

  return { totalReturn, sharpeRatio, maxDrawdown, winRate, tradeCount };
}

// ── Batch backtest across all symbols ───────────────────────────────

function batchBacktest(
  symbolData: Map<string, PrecomputedData>,
  params: OptimizableParams,
  segment: "train" | "test"
): { avgReturn: number; results: Map<string, FastBacktestResult> } {
  const results = new Map<string, FastBacktestResult>();
  let totalReturn = 0;
  let count = 0;

  for (const [symbol, data] of symbolData) {
    const bars = segment === "train" ? data.trainBars : data.testBars;
    const signals = segment === "train" ? data.trainSignals : data.testSignals;

    if (bars.length < WINDOW_SIZE + 20) continue;

    const result = fastBacktest(bars, signals, params);
    results.set(symbol, result);
    totalReturn += result.totalReturn;
    count++;
  }

  return { avgReturn: count > 0 ? totalReturn / count : 0, results };
}

// ── Genetic Algorithm ───────────────────────────────────────────────

function randomParam(key: keyof OptimizableParams): number {
  const range = PARAM_RANGES[key];
  const val = range.min + Math.random() * (range.max - range.min);
  return range.step ? Math.round(val / range.step) * range.step : val;
}

function randomIndividual(): OptimizableParams {
  return {
    stopLossPct: randomParam("stopLossPct"),
    takeProfitPct: randomParam("takeProfitPct"),
    trailingStopPct: randomParam("trailingStopPct"),
    holdPeriod: randomParam("holdPeriod"),
  };
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
  // Create DB record
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

  // Initialize progress
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

  // Fire and forget — runs in background
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

    // ── Phase 2: Pre-compute signals ──
    progress.status = "optimizing";
    progress.totalSymbols = barsMap.size;
    await db
      .update(optimizationRuns)
      .set({ status: "optimizing", totalSymbols: barsMap.size })
      .where(eq(optimizationRuns.id, runId));

    const symbolData = new Map<string, PrecomputedData>();
    for (const [symbol, bars] of barsMap) {
      symbolData.set(symbol, prepareSymbolData(symbol, bars, config.trainPct));
    }

    logger.info({ runId, symbols: symbolData.size }, "Signal pre-computation complete");

    // ── Phase 3: Baseline (moderate preset) ──
    const baselineParams: OptimizableParams = {
      stopLossPct: STRATEGY_PRESETS.moderate.stopLossPct,
      takeProfitPct: STRATEGY_PRESETS.moderate.takeProfitPct,
      trailingStopPct: STRATEGY_PRESETS.moderate.trailingStopPct,
      holdPeriod: STRATEGY_PRESETS.moderate.holdPeriod,
    };
    const baselineTrain = batchBacktest(symbolData, baselineParams, "train");
    const baselineTest = batchBacktest(symbolData, baselineParams, "test");

    logger.info(
      { runId, trainReturn: baselineTrain.avgReturn.toFixed(2), testReturn: baselineTest.avgReturn.toFixed(2) },
      "Baseline computed"
    );

    // ── Phase 4: Genetic Algorithm ──
    let population: Individual[] = [];

    // Seed population — include known presets + random
    const presetSeeds = Object.values(STRATEGY_PRESETS).map((p) => ({
      stopLossPct: p.stopLossPct,
      takeProfitPct: p.takeProfitPct,
      trailingStopPct: p.trailingStopPct,
      holdPeriod: p.holdPeriod,
    }));

    const initialParams: OptimizableParams[] = [
      ...presetSeeds,
      ...Array.from({ length: config.populationSize - presetSeeds.length }, () => randomIndividual()),
    ];

    // Evaluate initial population
    for (const params of initialParams) {
      const result = batchBacktest(symbolData, params, "train");
      population.push({ params, fitness: result.avgReturn });
    }
    population.sort((a, b) => b.fitness - a.fitness);

    let bestEver: Individual = population[0];

    for (let gen = 0; gen < config.generations; gen++) {
      // Yield event loop between generations
      await new Promise((r) => setTimeout(r, 0));

      const nextPop: Individual[] = [];

      // Elitism — keep top N
      for (let i = 0; i < ELITISM && i < population.length; i++) {
        nextPop.push(population[i]);
      }

      // Fill rest with crossover + mutation
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
        nextPop.push({ params: childParams, fitness: result.avgReturn });
      }

      population = nextPop.sort((a, b) => b.fitness - a.fitness);

      if (population[0].fitness > bestEver.fitness) {
        bestEver = population[0];
      }

      // Update progress
      progress.currentGeneration = gen + 1;
      progress.bestFitness = bestEver.fitness;
      progress.bestParams = bestEver.params;

      // Persist generation to DB
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
        { runId, gen: gen + 1, best: population[0].fitness.toFixed(2), avg: (fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length).toFixed(2) },
        "Generation complete"
      );
    }

    // ── Phase 5: Validate on test data ──
    const testResult = batchBacktest(symbolData, bestEver.params, "test");

    // Full backtest on all data with best params for per-symbol results
    const fullResult = batchBacktest(symbolData, bestEver.params, "test");
    const trainResult = batchBacktest(symbolData, bestEver.params, "train");

    // Store per-symbol results
    const symbolResultRows = [];
    for (const [symbol, data] of symbolData) {
      const tr = trainResult.results.get(symbol);
      const te = fullResult.results.get(symbol);
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

    // Insert in batches of 100
    for (let i = 0; i < symbolResultRows.length; i += 100) {
      const batch = symbolResultRows.slice(i, i + 100);
      await db.insert(optimizationSymbolResults).values(batch);
    }

    // Compute aggregate test metrics
    const testReturns = Array.from(fullResult.results.values());
    const avgTestSharpe = testReturns.length > 0
      ? testReturns.reduce((s, r) => s + r.sharpeRatio, 0) / testReturns.length
      : 0;
    const avgTestDrawdown = testReturns.length > 0
      ? testReturns.reduce((s, r) => s + r.maxDrawdown, 0) / testReturns.length
      : 0;

    const trainReturns = Array.from(trainResult.results.values());
    const avgTrainSharpe = trainReturns.length > 0
      ? trainReturns.reduce((s, r) => s + r.sharpeRatio, 0) / trainReturns.length
      : 0;
    const avgTrainDrawdown = trainReturns.length > 0
      ? trainReturns.reduce((s, r) => s + r.maxDrawdown, 0) / trainReturns.length
      : 0;

    // ── Phase 6: Finalize ──
    await db
      .update(optimizationRuns)
      .set({
        status: "complete",
        completedAt: new Date(),
        bestParams: bestEver.params,
        bestTrainReturn: bestEver.fitness,
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
        trainReturn: bestEver.fitness.toFixed(2),
        testReturn: testResult.avgReturn.toFixed(2),
        baselineTrain: baselineTrain.avgReturn.toFixed(2),
        baselineTest: baselineTest.avgReturn.toFixed(2),
      },
      "Optimization complete"
    );

    // Clean up in-memory job after 1 hour
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
