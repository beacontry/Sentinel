import type { Bar } from "@/types";
import { getMarketDataProvider } from "./market-data";
import { SP500_SYMBOLS, getSP500Symbols, getSP500MembershipResolver } from "./sp500";

/**
 * Top 50/150 most liquid S&P 500 stocks by market cap — curated lists
 * for fast optimizer runs. Review periodically when major S&P changes
 * happen. The "sp500" universe uses the live Wikipedia-fetched list instead.
 */
export const TOP_50 = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
  "UNH", "MA", "HD", "PG", "JNJ", "COST", "ABBV", "BAC", "CRM", "AMD",
  "NFLX", "WMT", "PEP", "TMO", "AVGO", "LLY", "MRK", "ORCL", "ADBE", "CSCO",
  "ACN", "DIS", "INTC", "VZ", "CMCSA", "PFE", "T", "KO", "NKE", "MCD",
  "QCOM", "GS", "MS", "CAT", "BA", "GE", "RTX", "LOW", "SBUX", "PYPL",
];

/** Top 150 most liquid S&P 500 stocks by market cap + volume */
export const TOP_150 = [
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
import { BACKTEST_COSTS } from "./config";
import { shouldGraduateExit, promoteToGraduationFloor } from "./trading-engine";
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
import { Worker } from "node:worker_threads";
import pino from "pino";

const logger = pino({ name: "optimizer" });

// ── Types ───────────────────────────────────────────────────────────

export interface OptimizableParams {
  stopLossPct: number;
  takeProfitAtrMult: number; // take profit = entry + ATR × this multiplier
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

/**
 * Margin-gated promotion decision for the auto-optimizer (2026-07-23).
 *
 * Pure so the money-moving rule is unit-tested away from all the DB / backtest
 * I/O around it. Both scores must be the candidate-vs-incumbent OUT-OF-SAMPLE
 * excess return computed on the SAME held-out `PortfolioData` (see the cron's
 * shared-holdout comparison) — the stored per-run `bestTestReturn`s are NOT
 * comparable across runs (each run fetches its own data snapshot/split).
 *
 * Rules:
 *   - No incumbent (first-ever active preset)  → promote unconditionally.
 *   - Non-finite candidate score               → never promote (bad backtest).
 *   - Otherwise promote iff candidateOOS > incumbentOOS + margin.
 *
 * `margin` is in the same units as the OOS score (excess-return percentage
 * points, e.g. 2 = candidate must beat the incumbent by 2pp). A strictly
 * positive margin creates hysteresis so noise-level improvements don't churn
 * the global active slot on every run.
 */
export function decidePromotion(input: {
  candidateOOS: number;
  incumbentOOS: number | null;
  margin: number;
}): { promote: boolean; reason: "no_incumbent" | "beat_margin" | "below_margin" | "invalid_candidate" } {
  const { candidateOOS, incumbentOOS, margin } = input;
  if (!Number.isFinite(candidateOOS)) return { promote: false, reason: "invalid_candidate" };
  if (incumbentOOS === null || !Number.isFinite(incumbentOOS))
    return { promote: true, reason: "no_incumbent" };
  const threshold = incumbentOOS + Math.max(0, margin);
  return candidateOOS > threshold
    ? { promote: true, reason: "beat_margin" }
    : { promote: false, reason: "below_margin" };
}

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
  stopLossPct:      { min: 0.01,  max: 0.12 },
  takeProfitAtrMult:{ min: 3,     max: 15, step: 0.5 },
  trailingStopPct:  { min: 0.01,  max: 0.15 },
  holdPeriod:      { min: 5,     max: 60, step: 1 },
  rsiOversold:     { min: 20,    max: 40, step: 1 },
  rsiOverbought:   { min: 60,    max: 80, step: 1 },
  emaFast:         { min: 5,     max: 15, step: 1 },
  emaSlow:         { min: 15,    max: 50, step: 1 },
  rsThreshold:     { min: -0.10, max: 0.10 },
};

// Per-side slippage as a fraction (5 bps → 0.0005). See BACKTEST_COSTS.
const SLIP = BACKTEST_COSTS.slippageBps / 10000;
const COMMISSION = BACKTEST_COSTS.commissionPerFill;
// Trailing-stop floor — mirrors the live engine's TRAIL_FLOOR (2%) and
// backtester.ts. The profit-based decay range is clamped at 0 so a sub-floor
// base trail can't be widened toward it (audit #39).
const TRAIL_FLOOR = 0.02;

// Fixed position sizing for backtesting (user risk profiles control live sizing)
const BACKTEST_POSITION_PCT = 0.10;
const BACKTEST_MAX_POSITIONS = 10;
/**
 * STRONG_BUY hard cap mirroring live runScan (Math.floor(maxPositions × 1.5)).
 * Lets the GA-tuned strategy enter strong signals beyond the normal cap when
 * conviction is high. Without parity, the backtester underestimates how
 * many positions the live engine actually opens during strong-signal windows.
 * PR 17 (2026-05-26) audit-driven addition.
 */
const BACKTEST_HARD_CAP_STRONG_BUY = Math.floor(BACKTEST_MAX_POSITIONS * 1.5);

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

// P2 audit (2026-06-09) — same fix as market-data.ts: prod container runs
// as non-root nextjs without /data, so the previous default silently
// disabled the incremental cache. Default is now /app/cache (chowned by
// Dockerfile). One-shot warning emitted on mkdir failure.
const CACHE_DIR = join(
  process.env.CACHE_DIR ?? (process.env.NODE_ENV === "production" ? "/app/cache" : join(process.cwd(), "data")),
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

let cacheDirWarned = false;
async function ensureCacheDir() {
  try {
    if (!existsSync(CACHE_DIR)) {
      await mkdir(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    if (!cacheDirWarned) {
      cacheDirWarned = true;
      logger.warn(
        { dir: CACHE_DIR, err: (err as Error).message },
        "Optimizer cache disabled — incremental fetch falls back to full refetch every run until CACHE_DIR points at a writable path"
      );
    }
    throw err;
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
    let incTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const newBars = await Promise.race([
        provider.fetchBars(symbol, daysSince + 5, "1d"),
        new Promise<Bar[]>((_, reject) => {
          incTimeoutId = setTimeout(() => reject(new Error("timeout")), 10000);
        }),
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
    } finally {
      clearTimeout(incTimeoutId); // clear the race timer so it doesn't linger (audit #74)
    }
  }

  // No cache or too small — full fetch
  const provider = getMarketDataProvider();
  let fullTimeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const bars = await Promise.race([
      provider.fetchBars(symbol, DATA_DAYS, "1d"),
      new Promise<Bar[]>((_, reject) => {
        fullTimeoutId = setTimeout(() => reject(new Error("timeout")), 10000);
      }),
    ]);
    if (bars.length > 200) await cacheBars(symbol, bars);
    return bars;
  } catch (err) {
    logger.warn({ symbol, err: (err as Error).message }, "Failed to fetch");
    return [];
  } finally {
    clearTimeout(fullTimeoutId); // clear the race timer (audit #74)
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

import { analyzeBars, analyzeSignalOnly, type SignalParams } from "./indicators/analyzer";
import type { SignalType } from "@/types";
export type { SignalType };

// ── Portfolio data preparation ──────────────────────────────────────

export interface PortfolioData {
  symbols: string[];
  dates: string[];
  dateIdx: Map<string, number>;
  barLookup: Map<string, Map<string, Bar>>; // symbol → dateKey → Bar
  trainEnd: number;   // index into dates
  // Equal-weight buy-and-hold PORTFOLIO return for each segment, on the same
  // INITIAL_CASH + integer-share + entry-cost basis as the strategy's
  // totalReturn (see portfolioBuyHold). Named "avg…" for back-compat; the
  // value is now a portfolio terminal-wealth return, not an average of
  // per-symbol simple returns (audit #11).
  avgBuyHoldTrain: number;
  avgBuyHoldTest: number;
}

function normalizeDate(d: string): string {
  return d.split("T")[0];
}

/**
 * Equal-weight buy-and-hold PORTFOLIO return over [startIdx, endIdx), as a
 * percent of INITIAL_CASH (audit #11).
 *
 * The GA's excessReturn = strategy.totalReturn − benchmark must compare like
 * with like. The old benchmark was the equal-weight AVERAGE of each symbol's
 * single-name simple return — an incomparable basis against the strategy's
 * compounded, cash-constrained, ≤10-name, integer-share portfolio measured as
 * terminal wealth on INITIAL_CASH. This simulates the benchmark the SAME way:
 *
 *  - Split INITIAL_CASH equally across every symbol with a bar in the window.
 *  - Buy INTEGER shares at each symbol's first available close, paying the same
 *    entry slippage + commission the strategy pays on entries; leftover cash
 *    (rounding + unspendable sleeves) sits idle, as a real buy-and-hold would.
 *  - Mark each holding at its last available close (no exit cost) — matching how
 *    the strategy values its still-open terminal positions in finalEquity.
 *
 * For a fully-present universe this lands a touch below the old mean-of-returns
 * (integer-share cash drag + entry cost); under point-in-time membership it also
 * tracks which names were actually holdable. Either way it is now a true
 * portfolio-vs-portfolio excess return.
 */
export function portfolioBuyHold(
  barLookup: Map<string, Map<string, Bar>>,
  dates: string[],
  startIdx: number,
  endIdx: number
): number {
  const sleeves: Array<{ first: number; last: number }> = [];
  for (const [, lookup] of barLookup) {
    let first: number | null = null;
    let last: number | null = null;
    for (let i = startIdx; i < endIdx; i++) {
      const bar = lookup.get(dates[i]);
      if (bar && bar.close > 0) {
        if (first === null) first = bar.close;
        last = bar.close;
      }
    }
    if (first !== null && last !== null) sleeves.push({ first, last });
  }
  if (sleeves.length === 0) return 0;

  const perSleeveCash = INITIAL_CASH / sleeves.length;
  let cash = INITIAL_CASH;
  let holdingsValue = 0;
  for (const s of sleeves) {
    const entryFill = s.first * (1 + SLIP);
    const shares = Math.floor(perSleeveCash / entryFill);
    if (shares <= 0) continue; // sleeve too small to buy a whole share — cash idles
    cash -= shares * entryFill + COMMISSION;
    holdingsValue += shares * s.last; // marked at last close, like the strategy's terminal MTM
  }
  const terminal = cash + holdingsValue;
  return ((terminal - INITIAL_CASH) / INITIAL_CASH) * 100;
}

export function buildPortfolioData(allBars: Map<string, Bar[]>, trainPct: number): PortfolioData {
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

  // Equal-weight buy-and-hold PORTFOLIO benchmark for each segment — same
  // INITIAL_CASH + integer-share + entry-cost basis as the strategy, so
  // excessReturn is a like-for-like portfolio comparison (audit #11).
  const avgBuyHoldTrain = portfolioBuyHold(barLookup, dates, 0, trainEnd);
  const avgBuyHoldTest = portfolioBuyHold(barLookup, dates, trainEnd, dates.length);

  return {
    symbols,
    dates,
    dateIdx,
    barLookup,
    trainEnd,
    avgBuyHoldTrain,
    avgBuyHoldTest,
  };
}

// ── Portfolio backtester ────────────────────────────────────────────

interface Position {
  symbol: string;
  entryPrice: number;
  entryDateIdx: number;
  shares: number;
  peakPrice: number;
  takeProfitPrice: number; // entry + ATR × multiplier (computed at entry)
  /**
   * Mutable fixed-stop floor. Initialized to entry × (1 - stopLossPct);
   * promoted upward by take-profit graduation to entry × 1.30 when the
   * graduation gate fires. Mirrors the live engine's TrackedPosition.stopLoss.
   * Without this field, every stop check recomputed from stopLossPct would
   * silently undo the graduation lock.
   */
  stopLoss: number;
}

export interface PortfolioResult {
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

export function portfolioBacktest(
  data: PortfolioData,
  params: OptimizableParams,
  segment: "train" | "test",
  // Point-in-time membership gate (sp500 universe). When provided, ENTRIES are
  // only allowed for symbols that were index members on the bar's date —
  // reducing survivorship bias. Exits are always allowed. Omitted/undefined =
  // no gating (top50/top150 use today's static lists).
  eligibleOn?: (dateKey: string) => Set<string>
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

      // Intrabar look-ahead fix (audit #9/#10): anchor THIS bar's trail to the
      // peak as of the PRIOR bar. Folding this bar's high into the peak before
      // testing this bar's low against the just-raised trail assumes high-
      // before-low ordering and over-rewards tight trailing stops — exactly the
      // GA-tuned param (trailingStopPct). The high is folded into the peak only
      // AFTER the exit checks (below), so it tightens the NEXT bar's trail.
      // Mirrors backtester.ts.
      const peakForTrail = pos.peakPrice;
      let exitPrice: number | null = null;

      // Stops with profit-based tightening. pos.stopLoss is the mutable
      // fixed-stop floor (mirrors the live engine's TrackedPosition.stopLoss).
      // Initialized to entry × (1 - stopLossPct), promoted upward by take-
      // profit graduation to entry × 1.30 when graduation gate fires below.
      const profitPct = (peakForTrail - pos.entryPrice) / pos.entryPrice;
      // Trail-floor clamp (audit #39): Math.max(0, base - floor) so a base
      // trail tighter than the 2% floor isn't widened toward it as profit grows
      // (the old `0.02 + (base - 0.02)*exp(…)` inverted for base < 2%). Matches
      // the live engine's getDynamicTrailingPct and backtester.ts.
      const dynTrail = profitPct > 0 ? TRAIL_FLOOR + Math.max(0, params.trailingStopPct - TRAIL_FLOOR) * Math.exp(-3 * profitPct) : params.trailingStopPct;
      const trailStop = peakForTrail * (1 - dynTrail);

      // Take-profit graduation (PR 14 parity, 2026-05-26). The GA tunes
      // takeProfitAtrMult; the optimizer historically treated that as a
      // hard exit. Live engine treats it as a graduation point (locks
      // +30% floor, holds until 2-of-3 weakness signals fire). For GA
      // fitness to be predictive of live performance, the backtester
      // must model the same gate. Mirror modes are tactical-smart +
      // optimized; portfolioBacktest is for the GA which only tunes
      // optimized, so always treat as enabled here.
      const graduationEnabled = true;
      if (graduationEnabled && bar.high >= pos.takeProfitPrice) {
        promoteToGraduationFloor(pos);
        const win = windows.get(pos.symbol);
        if (win && win.length >= 20) {
          // analyzeBars produces the indicators object shouldGraduateExit
          // reads (rsi_14 in particular). Costlier than analyzeSignalOnly
          // but only invoked when above takeProfit — rare per position.
          const analysis = analyzeBars(pos.symbol, win);
          const ind = analysis.indicators as unknown as Record<string, number | null | undefined>;
          const graduation = shouldGraduateExit(pos, win, ind, bar.close);
          if (graduation) {
            exitPrice = bar.close;
          }
          // Otherwise: hold past takeProfit. The +30% floor (now in
          // pos.stopLoss) catches a reversal via the stop check below.
        }
      }

      // Effective stop check uses the (possibly graduation-promoted)
      // pos.stopLoss instead of recomputing entry × (1 - stopLossPct)
      // every bar — recomputing would silently undo the graduation lock.
      // Gap-through fill (audit #48): a bar that OPENED below the stop blew
      // through it overnight, so fill at min(stopLevel, bar.open) rather than
      // optimistically at the (higher) stop level — otherwise gap-down exits
      // are systematically overstated and bias the GA's risk picture upward.
      const stopLevel = Math.max(pos.stopLoss, trailStop);
      if (!exitPrice && bar.low <= stopLevel) {
        exitPrice = Math.min(stopLevel, bar.open);
      }

      // Hard take-profit (only when graduation gate didn't already act).
      // Now that graduationEnabled=true above always intercepts the
      // takeProfit crossing, this branch is dormant for optimized. Kept
      // for parity in case graduationEnabled becomes mode-conditional later.
      // Gap-up fill (audit #48): fills above the TP when the bar gapped up.
      if (!exitPrice && !graduationEnabled && bar.high >= pos.takeProfitPrice) {
        exitPrice = Math.max(pos.takeProfitPrice, bar.open);
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
        // Sells fill below the trigger level (slippage); pay commission.
        // pos.entryPrice already includes entry-side slippage, so `ret` is the
        // realistic round-trip return net of execution cost.
        const exitFill = exitPrice * (1 - SLIP);
        cash += pos.shares * exitFill - COMMISSION;
        const ret = (exitFill - pos.entryPrice) / pos.entryPrice;
        if (ret > 0) wins++; else losses++;

        // Track per-symbol
        const existing = perSymbol.get(pos.symbol) ?? { returnPct: 0, trades: 0 };
        existing.returnPct += ret * 100;
        existing.trades++;
        perSymbol.set(pos.symbol, existing);

        positions.splice(p, 1);
      } else if (bar.high > pos.peakPrice) {
        // Still in position — NOW fold this bar's high into the peak so the
        // NEXT bar's trail can tighten off it (deferred per the intrabar
        // look-ahead fix, audit #9/#10).
        pos.peakPrice = bar.high;
      }
    }

    // ── Check entries (step boundaries only) ──
    //
    // Note on swap-sell parity: the runScan path in trading-engine.ts has a
    // post-loop "swap-sell redeploy" that buys cap-blocked candidates after
    // exits free slots within the same scan. The backtester does NOT need
    // that mechanism because exits run at the TOP of each bar (the for loop
    // at line ~402) and entries run at the BOTTOM (here). positions.length
    // already reflects any exits-this-bar by the time we evaluate slots.
    // Functionally equivalent to swap-sell, structurally simpler.
    //
    // STRONG_BUY hardCap overshoot (PR 17 parity): when the next candidate
    // is STRONG_BUY and positions.length < BACKTEST_HARD_CAP_STRONG_BUY,
    // allow it through. Mirrors runScan's hardCap = 1.5x maxPositions for
    // strong signals — without this, the GA underestimates how many
    // STRONG_BUY positions the live engine can carry in strong-signal windows.
    if (isStepBoundary && positions.length < BACKTEST_HARD_CAP_STRONG_BUY) {
      const heldSymbols = new Set(positions.map((p) => p.symbol));
      // Point-in-time membership for this bar's date (sp500 only). Resolved
      // once per step-boundary, not per symbol. null = no gating.
      const eligible = eligibleOn ? eligibleOn(date) : null;
      const candidates: { symbol: string; signal: SignalType; price: number; atr: number; confidence: number }[] = [];

      for (const symbol of data.symbols) {
        if (heldSymbols.has(symbol)) continue;
        if (eligible && !eligible.has(symbol)) continue; // wasn't an index member on this date
        const w = windows.get(symbol);
        if (!w || w.length < 60) continue;
        const bar = data.barLookup.get(symbol)?.get(date);
        if (!bar) continue;

        // RS filter: 60-day momentum vs threshold. Off-by-one fix (audit #49):
        // w[length-1] vs w[length-60] is a 59-interval return (index distance
        // 59), not the 60 days the param name implies. Use w[length-61] for a
        // true 60-interval lookback and require >=61 bars. On the single
        // warm-up bar where the window is exactly 60, the filter is skipped
        // (best-effort, one-bar boundary — the rsThreshold gate re-applies from
        // 61 bars on).
        if (w.length >= 61) {
          const past = w[w.length - 61].close;
          if (past > 0) {
            const rs60 = (w[w.length - 1].close - past) / past;
            if (rs60 < params.rsThreshold) continue;
          }
        }

        const { signal: sig, atr, confidence } = analyzeSignalOnly(symbol, w, signalParams);
        if ((sig === "BUY" || sig === "STRONG_BUY") && atr !== null) {
          candidates.push({ symbol, signal: sig, price: bar.close, atr, confidence });
        }
      }

      // Rank: STRONG_BUY first, then by confidence desc within signal type
      // (PR 17 parity — runScan's swap-sell ranks deferred candidates by
      // confidence; the backtester now applies the same ordering up front).
      candidates.sort((a, b) => {
        const sigOrder = (a.signal === "STRONG_BUY" ? 0 : 1) - (b.signal === "STRONG_BUY" ? 0 : 1);
        if (sigOrder !== 0) return sigOrder;
        return b.confidence - a.confidence;
      });

      // Slot allocation: STRONG_BUYs get the hardCap (1.5x); BUYs only get
      // the regular cap. Iterate candidates and let each one's signal type
      // determine the cap that applies to it.
      for (const cand of candidates) {
        const capForThisCandidate =
          cand.signal === "STRONG_BUY" ? BACKTEST_HARD_CAP_STRONG_BUY : BACKTEST_MAX_POSITIONS;
        if (positions.length >= capForThisCandidate) continue;
        // Size: fixed backtest position sizing
        let portfolioValue = cash;
        for (const pos of positions) {
          const b = data.barLookup.get(pos.symbol)?.get(date);
          portfolioValue += pos.shares * (b?.close ?? pos.entryPrice);
        }
        // Buys fill above the close (slippage); pay commission. entryPrice
        // (cost basis) carries the slippage; trigger levels stay on the raw
        // market price so exit detection is unchanged.
        const fillPrice = cand.price * (1 + SLIP);
        const posSize = portfolioValue * BACKTEST_POSITION_PCT;
        const shares = Math.floor(posSize / fillPrice);
        if (shares <= 0 || shares * fillPrice + COMMISSION > cash) continue;

        cash -= shares * fillPrice + COMMISSION;
        positions.push({
          symbol: cand.symbol,
          entryPrice: fillPrice,
          entryDateIdx: di,
          shares,
          peakPrice: cand.price,
          takeProfitPrice: cand.price + cand.atr * params.takeProfitAtrMult,
          stopLoss: cand.price * (1 - params.stopLossPct),
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

function universeSize(universe: OptimizationConfig["universe"]): number {
  return universe === "sp500" ? SP500_SYMBOLS.length : universe === "top150" ? TOP_150.length : TOP_50.length;
}

/** Seed the in-memory progress entry runOptimization reads/mutates. Exported
 *  so the worker thread can seed its own globalThis map before running. */
export function initJobProgress(runId: string, config: OptimizationConfig): void {
  g.__optimizerJobs!.set(runId, {
    runId, status: "pending", symbolsFetched: 0, totalSymbols: universeSize(config.universe),
    currentGeneration: 0, totalGenerations: config.generations, bestFitness: 0, bestParams: null,
  });
}

export async function startOptimization(userId: string, config: OptimizationConfig): Promise<string> {
  const [run] = await db
    .insert(optimizationRuns)
    .values({
      userId, status: "pending", targetMetric: "total_return", universe: config.universe,
      populationSize: config.populationSize, generations: config.generations,
      trainPct: config.trainPct, totalSymbols: universeSize(config.universe),
    })
    .returning({ id: optimizationRuns.id });

  const runId = run.id;
  initJobProgress(runId, config);

  // The GA is CPU-bound and Node is single-threaded, so running it inline
  // starves the event loop — every other request (broker status, dashboard
  // polls) stalls until the run finishes. Offload to a worker thread so the
  // main event loop stays responsive. Falls back to in-process when the
  // bundled worker isn't present (dev / unbuilt) or spawn fails, so the worst
  // case is exactly today's behavior — never a regression.
  if (!trySpawnOptimizationWorker(runId, config)) {
    runOptimization(runId, config).catch((err) => {
      logger.error({ runId, err: (err as Error).message }, "Optimization failed");
    });
  }
  return runId;
}

// The standalone build copies .next/standalone → /app, so the esbuild-bundled
// worker lands at <cwd>/optimizer-worker.cjs. Absent in dev (no standalone
// build) → existsSync gate routes to the in-process path.
function trySpawnOptimizationWorker(runId: string, config: OptimizationConfig): boolean {
  const workerPath = join(process.cwd(), "optimizer-worker.cjs");
  if (!existsSync(workerPath)) return false;
  try {
    const worker = new Worker(workerPath, { workerData: { runId, config } });
    worker.on("message", (msg: { type?: string; progress?: OptimizationProgress; message?: string }) => {
      if (msg?.type === "progress" && msg.progress) {
        g.__optimizerJobs!.set(runId, msg.progress); // feed the GET route's live view
      } else if (msg?.type === "done") {
        setTimeout(() => g.__optimizerJobs!.delete(runId), 60 * 60 * 1000);
      } else if (msg?.type === "error") {
        const p = g.__optimizerJobs!.get(runId);
        if (p) p.status = "failed";
        logger.error({ runId, err: msg.message }, "Optimization worker reported failure");
        setTimeout(() => g.__optimizerJobs!.delete(runId), 10 * 60 * 1000);
      }
    });
    worker.on("error", (err) => {
      // Catastrophic worker failure (the run never wrote its own result row).
      logger.error({ runId, err: err.message }, "Optimizer worker thread crashed");
      const p = g.__optimizerJobs!.get(runId);
      if (p) p.status = "failed";
      db.update(optimizationRuns)
        .set({ status: "failed", error: err.message, completedAt: new Date() })
        .where(eq(optimizationRuns.id, runId))
        .catch(() => { /* best-effort; already in failure path */ });
      setTimeout(() => g.__optimizerJobs!.delete(runId), 10 * 60 * 1000);
    });
    worker.on("exit", (code) => {
      if (code !== 0) logger.warn({ runId, code }, "Optimizer worker exited non-zero");
    });
    logger.info({ runId }, "Optimization dispatched to worker thread");
    return true;
  } catch (err) {
    logger.warn({ runId, err: (err as Error).message }, "Worker spawn failed — running optimization in-process");
    return false;
  }
}

export async function runOptimization(runId: string, config: OptimizationConfig) {
  const progress = g.__optimizerJobs!.get(runId)!;
  try {
    // ── Select universe ──
    // sp500: reconstruct point-in-time membership (entries gated per-date to
    //   reduce survivorship bias) and fetch the union of all historical members.
    // top50/top150: hardcoded *today's* top-by-cap lists — inherently
    //   survivorship-biased; no PIT data exists, so no gating (a full-history
    //   guard below at least drops recent IPOs/additions).
    let eligibleOn: ((dateKey: string) => Set<string>) | undefined;
    let universeSymbols: string[];
    if (config.universe === "sp500") {
      const membership = await getSP500MembershipResolver().catch(() => null);
      if (membership) {
        universeSymbols = membership.universe;
        eligibleOn = membership.eligibleOn;
      } else {
        universeSymbols = await getSP500Symbols().catch(() => SP500_SYMBOLS);
      }
    } else {
      universeSymbols = config.universe === "top150" ? TOP_150 : TOP_50;
    }
    logger.info({ runId, universe: config.universe, symbols: universeSymbols.length, pit: !!eligibleOn }, "Universe selected");

    // ── Fetch data ──
    progress.status = "fetching_data";
    await db.update(optimizationRuns).set({ status: "fetching_data", startedAt: new Date() }).where(eq(optimizationRuns.id, runId));

    const barsMap = await fetchAllBars(universeSymbols, (fetched) => {
      progress.symbolsFetched = fetched;
      // Progress write is best-effort — a single failed update shouldn't
      // kill the optimization, but we want to know if writes are failing
      // systematically (the run will appear "stuck" in the UI).
      db.update(optimizationRuns).set({ symbolsFetched: fetched }).where(eq(optimizationRuns.id, runId))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ runId, err: msg }, "Failed to write optimizer progress (run continues)");
        });
    });
    logger.info({ runId, symbolCount: barsMap.size }, "Data fetching complete");

    // ── Full-history guard (non-sp500 only) ──
    // top50/top150 are *today's* top-by-cap lists, so a name that IPO'd mid-
    // window is a survivorship winner with only partial history. Drop symbols
    // whose first bar is well after the window start. (sp500 skips this — PIT
    // gating already prevents trading a name before it joined the index, and a
    // legitimately mid-window-added member SHOULD be tradeable from its add date.)
    if (config.universe !== "sp500" && barsMap.size > 0) {
      const firsts = [...barsMap.values()]
        .map((b) => b[0]?.date?.split("T")[0])
        .filter((d): d is string => !!d)
        .sort();
      const windowStart = firsts[0];
      if (windowStart) {
        const cutoff = new Date(new Date(windowStart).getTime() + 15 * 86400000).toISOString().slice(0, 10);
        let dropped = 0;
        for (const [sym, bars] of barsMap) {
          const first = bars[0]?.date?.split("T")[0];
          if (!first || first > cutoff) { barsMap.delete(sym); dropped++; }
        }
        if (dropped) logger.info({ runId, dropped, cutoff }, "Full-history guard: dropped late-listing symbols");
      }
    }

    // ── Build portfolio data ──
    progress.status = "optimizing";
    progress.totalSymbols = barsMap.size;
    await db.update(optimizationRuns).set({ status: "optimizing", totalSymbols: barsMap.size }).where(eq(optimizationRuns.id, runId));

    const portfolioData = buildPortfolioData(barsMap, config.trainPct);
    logger.info({ runId, symbols: portfolioData.symbols.length, dates: portfolioData.dates.length, buyHoldTrain: portfolioData.avgBuyHoldTrain.toFixed(1), buyHoldTest: portfolioData.avgBuyHoldTest.toFixed(1) }, "Portfolio data ready");

    // ── Baseline ──
    const baselineParams: OptimizableParams = {
      stopLossPct: 0.02, takeProfitAtrMult: 5, trailingStopPct: 0.015, holdPeriod: 20,
      rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21, rsThreshold: -0.05,
    };
    const baselineTrain = portfolioBacktest(portfolioData, baselineParams, "train", eligibleOn);
    const baselineTest = portfolioBacktest(portfolioData, baselineParams, "test", eligibleOn);
    logger.info({ runId, baselineTrain: baselineTrain.totalReturn.toFixed(1), baselineTest: baselineTest.totalReturn.toFixed(1), buyHoldTrain: baselineTrain.buyHoldReturn.toFixed(1) }, "Baseline computed");

    // ── GA ──
    // Fitness = portfolio total return (excess over buy-and-hold)
    const presetSeeds: OptimizableParams[] = Object.values(STRATEGY_PRESETS).map((p) => ({
      stopLossPct: p.stopLossPct, takeProfitAtrMult: 6,
      trailingStopPct: p.trailingStopPct, holdPeriod: p.holdPeriod,
      rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21, rsThreshold: -0.05,
    }));

    // Multi-objective blended fitness (PR 14, 2026-05-26; audit-revised PR 16).
    //
    // Before: pure excessReturn (0.6 train + 0.4 test). Rewarded any
    // return regardless of risk profile.
    //
    // After: scale excessReturn by two risk multipliers but ONLY when the
    // return is positive. Multipliers applied to negative returns invert
    // the GA's preference (a -50% strategy × 0.5 sharpeMult = -25 beats
    // -50 × 0.0 = 0, so the GA would prefer the higher-drawdown loser).
    // Audit P1 #4 (2026-05-26). For positive returns, both multipliers
    // are floored at 0.05 so the GA has gradient even in the "bad
    // drawdown" regime (audit P1 #5 — flat 0 at maxDrawdown >= 0.20
    // had no signal to climb away from).
    //   - Sharpe multiplier: clamped to [0.05, 1.0]
    //   - Drawdown multiplier: clamped to [0.05, 1.0], soft penalty across
    //     a 30% drawdown window so a 20%-drawdown strategy isn't tied
    //     with a 50%-drawdown one
    //
    // Fitness is TRAIN-ONLY (2026-05-28). It previously blended
    // 0.6*train + 0.4*test, which put the test window INTO the selection
    // objective — data leakage. The GA was literally optimizing the "test"
    // return, so it was not out-of-sample: test ≈ train by construction and
    // the reported OOS number was meaningless. Now the test window is a true
    // holdout — evaluated ONCE on the final winner below and reported as
    // genuine out-of-sample validation.
    function riskAdjust(r: PortfolioResult): number {
      // Negative returns: skip multipliers (otherwise GA prefers worse risk).
      // The base excessReturn already orders losers correctly.
      if (r.excessReturn <= 0) return r.excessReturn;
      const sharpeMult = Math.min(Math.max(r.sharpeRatio, 0) / 1.0, 1.0);
      // r.maxDrawdown is a PERCENT (portfolioBacktest returns (peak-v)/peak*100),
      // so the 30% window is `/ 30`, not `/ 0.30`. The old `/ 0.30` treated the
      // percent as a fraction → 1 - 9.2/0.30 ≈ -30 → floored to 0.05 for every
      // run, silently DISABLING the drawdown penalty so the GA chased raw
      // return with no risk control (the source of the fantasy-return overfit).
      const drawdownMult = Math.max(0, 1 - r.maxDrawdown / 30);
      // Soft floor so the GA still has a gradient at extreme risk profiles.
      const softSharpe = Math.max(0.05, sharpeMult);
      const softDrawdown = Math.max(0.05, drawdownMult);
      return r.excessReturn * softSharpe * softDrawdown;
    }
    // Train-only. The test set is NOT evaluated here — it must stay unseen by
    // selection to be a valid out-of-sample holdout (see comment above).
    function fitness(params: OptimizableParams): number {
      return riskAdjust(portfolioBacktest(portfolioData, params, "train", eligibleOn));
    }

    let population: Individual[] = [];
    const initParams = [...presetSeeds, ...Array.from({ length: Math.max(0, config.populationSize - presetSeeds.length) }, () => randomIndividual())];

    for (let pi = 0; pi < initParams.length; pi++) {
      population.push({ params: initParams[pi], fitness: fitness(initParams[pi]) });
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
        nextPop.push({ params: imm, fitness: fitness(imm) });
        if (++evalCount % 3 === 0) await new Promise((r) => setTimeout(r, 1));
      }

      // ── Breed the rest via crossover + adaptive mutation ──
      while (nextPop.length < config.populationSize) {
        const p1 = tournamentSelect(population), p2 = tournamentSelect(population);
        const childParams = Math.random() < CROSSOVER_RATE
          ? mutate(crossover(p1.params, p2.params), mutRate)
          : mutate(p1.params, mutRate);
        nextPop.push({ params: childParams, fitness: fitness(childParams) });
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
    const trainResult = portfolioBacktest(portfolioData, bestEver.params, "train", eligibleOn);
    const testResult = portfolioBacktest(portfolioData, bestEver.params, "test", eligibleOn);

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
      testTradeCount: testResult.tradeCount,
      testAvgPositions: testResult.avgPositions,
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
    await db
      .update(optimizationRuns)
      .set({ status: "failed", error: msg, completedAt: new Date() })
      .where(eq(optimizationRuns.id, runId))
      .catch((dbErr) => {
        // Already in the error-recovery path — log but don't re-throw,
        // we're cleaning up after a primary failure.
        const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        logger.error({ runId, dbErr: dbMsg, primaryErr: msg }, "Failed to mark optimizer run as failed (DB unreachable?)");
      });
    setTimeout(() => g.__optimizerJobs!.delete(runId), 10 * 60 * 1000);
  }
}
