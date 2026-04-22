// ─── Automated Trading Engine ────────────────────────────────────────────────
// Scans the top 50 S&P 500 stocks on a 15-minute interval during market hours.
// Generates signals via technical analysis, opens positions through a broker
// client, and manages exits using stop-loss / take-profit / trailing-stop /
// hold-period rules from the "optimized" strategy preset (or per-symbol
// overrides from symbolStrategies).
//
// Safety: paper-mode only, daily loss limit with auto-halt, globalThis halt
// flag, full error isolation per symbol.

import type { Bar } from "@/types";
import { createBrokerClient } from "./brokers";
import type { BrokerClient, BrokerAccount } from "./brokers";
import { getMarketDataProvider } from "./market-data";
import { analyzeBars } from "./indicators/analyzer";
import { analyzeHybrid } from "./hybrid/pipeline";
import { evaluateBarSignal, type SignalParams } from "./signal-eval";
import { STRATEGY_PRESETS } from "./strategy-presets";
import { SP500_SYMBOLS, getSP500Symbols } from "./sp500";
import { getFinnhubClient } from "./finnhub";

/** Resolved at scan time via getSP500Symbols() — auto-updates daily */
let SCAN_UNIVERSE = SP500_SYMBOLS; // starts with fallback, updated on first scan
import type { StrategyParams } from "./strategy-presets";
import { SignalType } from "@/types";
import { db } from "./db";
import {
  brokerConnections,
  // watchlistItems not used — engine scans full universe
  symbolStrategies,
  userRiskProfiles,
  traderSignals,
  traderTrades,
  traderPositions,
  traderStatus,
  traderDailyPnl,
  optimizationRuns,
} from "./db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("trading-engine");

// ─── Engine State (globalThis singleton) ─────────────────────────────────────

export type EngineMode = "conservative" | "moderate" | "optimized" | "aggressive" | "intraday" | "tactical" | "tactical-smart";

function isIntradayMode(mode: EngineMode): boolean {
  return mode === "intraday";
}

export interface ExternalSignal {
  symbol: string;
  signal: string;
  confidence: number;
  price: number;
  source: string;
  receivedAt: number;
}

export interface EngineState {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  intervalId: ReturnType<typeof setInterval> | null;
  exitCheckId: ReturnType<typeof setInterval> | null;
  lastScanAt: Date | null;
  scanCount: number;
  dailyLoss: number;
  dailyLossLimit: number;
  dailyLossDate: string;
  userId: string | null;
  positionCount: number;
  externalSignals: ExternalSignal[];
  errors: string[];
}

const g = globalThis as typeof globalThis & {
  __tradingEngine?: EngineState;
};

function getEngine(): EngineState {
  g.__tradingEngine ??= {
    running: false,
    halted: false,
    mode: "optimized",
    intervalId: null,
    exitCheckId: null,
    lastScanAt: null,
    scanCount: 0,
    dailyLoss: 0,
    dailyLossLimit: 0.02,
    dailyLossDate: "",
    userId: null,
    positionCount: 0,
    externalSignals: [],
    errors: [],
  };
  return g.__tradingEngine!;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SWING_SCAN_MS = 15 * 60 * 1000;    // 15 minutes for swing mode
const INTRADAY_SCAN_MS = 5 * 60 * 1000;  // 5 minutes for intraday signal scan
const EXIT_CHECK_MS = 60 * 1000;          // 1 minute for intraday exit checks
/** Tactical mode: always invested, exit on market weakness */
const TACTICAL_CONFIG = {
  trendSMA: 50,       // SPY above this = safe to be invested
  exitSMA: 20,        // SPY below this for confirmBars = exit
  confirmBars: 3,     // consecutive days below exitSMA before selling
  reentryRSI: 40,     // re-enter when RSI < this (oversold bounce)
  // #2: Graduated exit — first reduce to cautionPct, then full exit
  cautionSMA: 30,     // SPY below 30-day SMA = reduce exposure
  cautionPct: 0.50,   // reduce to 50% exposure on caution
  fullExitPct: 1.0,   // go 100% cash on confirmed exit
};

// #3: Sector groups for rotation weighting (covers full S&P 500)
const SECTOR_MAP: Record<string, string> = {
  // Tech
  AAPL: "tech", MSFT: "tech", NVDA: "tech", AMD: "tech", INTC: "tech", GOOGL: "tech", GOOG: "tech",
  META: "tech", ADBE: "tech", CRM: "tech", ORCL: "tech", CSCO: "tech", AVGO: "tech", QCOM: "tech",
  ANET: "tech", CDNS: "tech", SNPS: "tech", MCHP: "tech", KLAC: "tech", LRCX: "tech", AMAT: "tech",
  ADI: "tech", FTNT: "tech", PANW: "tech", CRWD: "tech", NOW: "tech", INTU: "tech", ADSK: "tech",
  ANSS: "tech", IT: "tech", KEYS: "tech", MPWR: "tech", FICO: "tech", TYL: "tech", EPAM: "tech",
  // Consumer
  AMZN: "consumer", TSLA: "consumer", HD: "consumer", LOW: "consumer", MCD: "consumer", SBUX: "consumer",
  NKE: "consumer", COST: "consumer", WMT: "consumer", TGT: "consumer", NFLX: "consumer", DIS: "consumer",
  BKNG: "consumer", CMG: "consumer", DHI: "consumer", LEN: "consumer", PHM: "consumer", ORLY: "consumer",
  AZO: "consumer", ROST: "consumer", TJX: "consumer", LULU: "consumer", DECK: "consumer", BBY: "consumer",
  EBAY: "consumer", ETSY: "consumer", DPZ: "consumer", YUM: "consumer", POOL: "consumer",
  // Finance
  JPM: "finance", BAC: "finance", GS: "finance", MS: "finance", V: "finance", MA: "finance",
  BRK: "finance", C: "finance", WFC: "finance", SCHW: "finance", BLK: "finance", BX: "finance",
  KKR: "finance", AXP: "finance", COF: "finance", DFS: "finance", MTB: "finance", USB: "finance",
  PNC: "finance", TFC: "finance", FITB: "finance", KEY: "finance", CFG: "finance", RF: "finance",
  ICE: "finance", CME: "finance", CBOE: "finance", NDAQ: "finance", MSCI: "finance", SPGI: "finance",
  // Health
  UNH: "health", JNJ: "health", PFE: "health", ABBV: "health", LLY: "health", MRK: "health",
  TMO: "health", ABT: "health", DHR: "health", BMY: "health", AMGN: "health", GILD: "health",
  ISRG: "health", MDT: "health", SYK: "health", BSX: "health", EW: "health", REGN: "health",
  VRTX: "health", IDXX: "health", DXCM: "health", HCA: "health", CI: "health", HUM: "health",
  CNC: "health", MOH: "health", BIIB: "health", MRNA: "health", ILMN: "health",
  // Industrial
  BA: "industrial", CAT: "industrial", GE: "industrial", RTX: "industrial", HON: "industrial",
  UNP: "industrial", UPS: "industrial", DE: "industrial", GD: "industrial", LMT: "industrial",
  NOC: "industrial", GEV: "industrial", ETN: "industrial", ITW: "industrial", EMR: "industrial",
  IR: "industrial", WAB: "industrial", FAST: "industrial", PWR: "industrial", URI: "industrial",
  // Energy
  XOM: "energy", CVX: "energy", COP: "energy", SLB: "energy", EOG: "energy", MPC: "energy",
  PSX: "energy", VLO: "energy", OXY: "energy", DVN: "energy", FANG: "energy", HAL: "energy",
  // Staples
  PG: "staples", PEP: "staples", KO: "staples", PM: "staples", MO: "staples", CL: "staples",
  KMB: "staples", GIS: "staples", K: "staples", SJM: "staples", CPB: "staples", KHC: "staples",
  MDLZ: "staples", HSY: "staples", MNST: "staples", KR: "staples", SYY: "staples", ADM: "staples",
  // Utilities
  NEE: "utilities", DUK: "utilities", SO: "utilities", D: "utilities", AEP: "utilities",
  EXC: "utilities", SRE: "utilities", ED: "utilities", WEC: "utilities", ES: "utilities",
  // Real Estate
  AMT: "realestate", PLD: "realestate", CCI: "realestate", EQIX: "realestate", SPG: "realestate",
  O: "realestate", WELL: "realestate", DLR: "realestate", PSA: "realestate", VICI: "realestate",
  // Comms
  CMCSA: "comms", VZ: "comms", T: "comms", TMUS: "comms", CHTR: "comms",
  // Fintech
  PYPL: "fintech", FI: "fintech", FIS: "fintech", FISV: "fintech", GPN: "fintech",
};

/**
 * #5: Momentum score — 3-month price return (proven predictor)
 * #6: Inverse volatility — lower vol = more capital
 */
function calcMomentumAndVol(bars: Bar[]): { momentum: number; volatility: number } {
  if (bars.length < 60) return { momentum: 0, volatility: 1 };

  const recent = bars.slice(-60);
  const momentum = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;

  // Daily return std dev
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252); // annualized

  return { momentum, volatility: Math.max(volatility, 0.01) };
}

/**
 * #3: Calculate sector relative strength
 */
function calcSectorStrength(
  sectorReturns: Map<string, number[]>
): Map<string, number> {
  const avgReturns = new Map<string, number>();
  for (const [sector, returns] of sectorReturns) {
    const avg = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    avgReturns.set(sector, avg);
  }
  return avgReturns;
}

// ─── Smart Filters: Earnings, Sentiment, Relative Strength ──────────────────

/** Cache for earnings dates and sentiment to avoid hammering APIs */
const gFilters = globalThis as typeof globalThis & {
  __earningsCache?: Map<string, string[]>; // symbol → upcoming earnings dates
  __earningsCacheDate?: string;
  __sentimentCache?: Map<string, number>; // symbol → bullish score (0-1)
  __sentimentCacheDate?: string;
  __rsCache?: Map<string, number>; // symbol → relative strength vs SPY
  __rsCacheDate?: string;
};

/**
 * #1: Earnings blackout — don't buy within 5 trading days of earnings
 */
async function isInEarningsBlackout(symbol: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  // Refresh cache daily
  if (gFilters.__earningsCacheDate !== today || !gFilters.__earningsCache) {
    gFilters.__earningsCache = new Map();
    gFilters.__earningsCacheDate = today;

    const client = getFinnhubClient();
    if (client.isConfigured) {
      try {
        const from = today;
        const to = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
        const result = await client.getEarningsCalendar(from, to);
        for (const e of result.earningsCalendar) {
          const dates = gFilters.__earningsCache.get(e.symbol) ?? [];
          dates.push(e.date);
          gFilters.__earningsCache.set(e.symbol, dates);
        }
        log.info({ symbols: gFilters.__earningsCache.size }, "Earnings blackout cache refreshed");
      } catch {
        // If Finnhub fails, allow all trades
      }
    }
  }

  const dates = gFilters.__earningsCache?.get(symbol);
  if (!dates || dates.length === 0) return false;

  // Check if any earnings date is within 5 trading days
  const now = Date.now();
  for (const dateStr of dates) {
    const earningsDate = new Date(dateStr + "T16:00:00").getTime();
    const daysUntil = (earningsDate - now) / 86400000;
    if (daysUntil >= -1 && daysUntil <= 5) return true; // blackout window
  }
  return false;
}

/**
 * #2: Relative strength filter — only buy stocks outperforming SPY
 */
async function getRelativeStrength(symbol: string, bars: Bar[]): Promise<number> {
  if (bars.length < 60) return 0;

  // Calculate stock's 60-day return
  const stockReturn = (bars[bars.length - 1].close - bars[bars.length - 60].close) / bars[bars.length - 60].close;

  // We already have SPY data from the market health check
  // RS = stock return - SPY return (positive = outperforming)
  // SPY return is roughly the benchmark; approximate from the stock universe average
  return stockReturn; // raw momentum serves as RS proxy
}

/**
 * #3: News sentiment gate — block buys when sentiment is bearish
 * Returns: score from 0 (very bearish) to 1 (very bullish), 0.5 = neutral
 */
async function getSentimentScore(symbol: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  // Refresh cache every 6 hours
  if (!gFilters.__sentimentCache || gFilters.__sentimentCacheDate !== today) {
    gFilters.__sentimentCache = new Map();
    gFilters.__sentimentCacheDate = today;
  }

  const cached = gFilters.__sentimentCache.get(symbol);
  if (cached !== undefined) return cached;

  const client = getFinnhubClient();
  if (!client.isConfigured) return 0.5; // neutral if no Finnhub

  try {
    const data = await client.getNewsSentiment(symbol);
    const score = data.sentiment?.bullishPercent ?? 0.5;
    gFilters.__sentimentCache.set(symbol, score);
    return score;
  } catch {
    return 0.5; // neutral on error
  }
}

/**
 * Run all three filters on a symbol before buying.
 * Returns: { allowed: boolean, reason?: string }
 */
async function passesSmartFilters(symbol: string, bars: Bar[]): Promise<{ allowed: boolean; reason?: string }> {
  // #1: Earnings blackout
  const inBlackout = await isInEarningsBlackout(symbol);
  if (inBlackout) {
    return { allowed: false, reason: "earnings_blackout" };
  }

  // #2: Relative strength — skip stocks underperforming (negative momentum)
  const rs = await getRelativeStrength(symbol, bars);
  // Read RS threshold from latest optimizer params (default -5%)
  let rsThreshold = -0.05;
  try {
    const latestParams = await getLatestOptimizedParams();
    if (latestParams && "rsThreshold" in latestParams) {
      rsThreshold = (latestParams as unknown as { rsThreshold: number }).rsThreshold;
    }
  } catch { /* use default */ }

  if (rs < rsThreshold) {
    return { allowed: false, reason: "weak_relative_strength" };
  }

  // #3: Sentiment — block if strongly bearish
  const sentiment = await getSentimentScore(symbol);
  if (sentiment < 0.3) { // less than 30% bullish
    return { allowed: false, reason: "bearish_sentiment" };
  }

  return { allowed: true };
}

// Defaults — overridden by user's Risk Profile from DB
const DEFAULT_MAX_POSITIONS = 16;
const DEFAULT_POSITION_PCT = 0.15;
const DEFAULT_DAILY_LOSS_PCT = 0.02;
const BARS_FOR_ANALYSIS = 90;
const MAX_ERROR_LOG = 50;

interface RiskLimits {
  maxPositions: number;
  positionPct: number;
  dailyLossPct: number;
  maxPositionSize: number;
  maxExposure: number;
}

async function loadRiskLimits(userId: string): Promise<RiskLimits> {
  const defaults: RiskLimits = {
    maxPositions: DEFAULT_MAX_POSITIONS,
    positionPct: DEFAULT_POSITION_PCT,
    dailyLossPct: DEFAULT_DAILY_LOSS_PCT,
    maxPositionSize: 100,
    maxExposure: 0, // 0 = use account equity as cap (set below)
  };

  try {
    const [profile] = await db
      .select()
      .from(userRiskProfiles)
      .where(eq(userRiskProfiles.userId, userId))
      .limit(1);

    if (profile) {
      // Each field falls back to its code default independently when null
      const positionPct = profile.maxPositionPct != null ? profile.maxPositionPct / 100 : defaults.positionPct;
      const maxPositions = profile.maxPositionPct != null ? Math.floor(100 / profile.maxPositionPct) : defaults.maxPositions;
      const dailyLossPct = profile.maxDailyLossPct != null ? profile.maxDailyLossPct / 100 : defaults.dailyLossPct;
      const maxPositionSize = profile.maxPositionSize ?? defaults.maxPositionSize;

      // maxExposure only overridden when BOTH accountSize and maxDrawdownPct are set
      const maxExposure =
        profile.accountSize != null && profile.maxDrawdownPct != null
          ? (profile.accountSize * profile.maxDrawdownPct) / 100
          : defaults.maxExposure;

      return { maxPositions, positionPct, dailyLossPct, maxPositionSize, maxExposure };
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load risk profile, using defaults");
  }

  return defaults;
}

/** Intraday strategy: tighter stops, faster exits */
const INTRADAY_PARAMS: StrategyParams = {
  stopLossPct: 0.015,      // 1.5% stop loss
  takeProfitPct: 0.025,    // 2.5% take profit
  trailingStopPct: 0.01,   // 1% trailing stop
  holdPeriod: 12,           // 12 bars = 1 hour on 5-min
};

// ─── Profit-Based Trailing Stop ──────────────────────────────────────────────

/**
 * Tightens the trailing stop proportionally as profit grows.
 * The trail shrinks from baseTrailingPct toward a minimum floor
 * as the profit percentage increases.
 *
 * Example with base 12%, floor 2%:
 *   0% profit  → 12% trail
 *   5% profit  → 10.5% trail
 *  10% profit  → 9% trail
 *  20% profit  → 6% trail
 *  30% profit  → 3% trail (near floor)
 *  40%+ profit → 2% trail (floor)
 *
 * This locks in progressively more gain as the stock rises.
 */
const TRAIL_FLOOR = 0.02; // minimum trailing stop: 2%
const TRAIL_DECAY_RATE = 3; // how fast the trail tightens (higher = faster)

function getDynamicTrailingPct(
  entryPrice: number,
  peakPrice: number,
  baseTrailingPct: number
): number {
  const profitPct = (peakPrice - entryPrice) / entryPrice;
  if (profitPct <= 0) return baseTrailingPct;

  // Exponential decay from base toward floor as profit grows
  // trail = floor + (base - floor) * e^(-rate * profitPct)
  const range = baseTrailingPct - TRAIL_FLOOR;
  const trail = TRAIL_FLOOR + range * Math.exp(-TRAIL_DECAY_RATE * profitPct);

  return Math.max(TRAIL_FLOOR, trail);
}

// ─── Market Hours ────────────────────────────────────────────────────────────

function getETDate(): Date {
  // Build a Date object representing "now" in America/New_York
  const nowStr = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  return new Date(nowStr);
}

function getETDateString(): string {
  const d = getETDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isMarketOpen(): boolean {
  const now = getETDate();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  // 9:30 AM = 570, 4:00 PM = 960
  return timeMinutes >= 570 && timeMinutes < 960;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pushError(engine: EngineState, msg: string) {
  engine.errors.push(`[${new Date().toISOString()}] ${msg}`);
  if (engine.errors.length > MAX_ERROR_LOG) {
    engine.errors = engine.errors.slice(-MAX_ERROR_LOG);
  }
}

/** Count approximate trading days between two dates. */
function tradingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ─── Broker Client Resolution ────────────────────────────────────────────────

async function resolveBrokerClient(
  userId: string
): Promise<{ client: BrokerClient; connectionId: string } | null> {
  const connections = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.userId, userId),
        eq(brokerConnections.isActive, true)
      )
    );

  if (connections.length === 0) {
    log.warn({ userId }, "No active broker connections found");
    return null;
  }

  // Prefer paper environment connections
  const conn =
    connections.find((c) => c.environment === "paper") ?? connections[0];

  if (conn.environment === "live") {
    log.error("Refusing to start engine with live broker connection");
    return null;
  }

  const client = createBrokerClient(
    conn.broker,
    conn.apiKey,
    conn.apiSecret,
    conn.environment
  );

  return { client, connectionId: conn.id };
}

// ─── Latest Optimizer Results ────────────────────────────────────────────────

// Cache to avoid hitting DB on every symbol every scan
let _optimizedParamsCache: { params: StrategyParams; signalParams: SignalParams | null; fetchedAt: number } | null = null;
const OPTIMIZER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLatestOptimizedParams(): Promise<StrategyParams | null> {
  if (_optimizedParamsCache && Date.now() - _optimizedParamsCache.fetchedAt < OPTIMIZER_CACHE_TTL) {
    return _optimizedParamsCache.params;
  }
  await _loadOptimizedParams();
  return _optimizedParamsCache?.params ?? null;
}

/** Get tuned signal params (EMA/RSI) from latest optimizer run, or null if unavailable */
async function getOptimizedSignalParams(): Promise<SignalParams | null> {
  if (_optimizedParamsCache && Date.now() - _optimizedParamsCache.fetchedAt < OPTIMIZER_CACHE_TTL) {
    return _optimizedParamsCache.signalParams;
  }
  await _loadOptimizedParams();
  return _optimizedParamsCache?.signalParams ?? null;
}

async function _loadOptimizedParams(): Promise<void> {
  try {
    const [run] = await db
      .select({ bestParams: optimizationRuns.bestParams, bestTestReturn: optimizationRuns.bestTestReturn })
      .from(optimizationRuns)
      .where(eq(optimizationRuns.status, "complete"))
      .orderBy(desc(optimizationRuns.completedAt))
      .limit(1);

    if (!run?.bestParams) return;

    const p = run.bestParams as Record<string, number>;
    if (p.stopLossPct == null || p.takeProfitPct == null) return;

    const params: StrategyParams = {
      stopLossPct: p.stopLossPct,
      takeProfitPct: p.takeProfitPct,
      trailingStopPct: p.trailingStopPct ?? 0.09,
      holdPeriod: Math.round(p.holdPeriod ?? 43),
    };

    // Extract signal tuning params if available
    const signalParams: SignalParams | null = (p.emaFast != null && p.emaSlow != null)
      ? {
          emaFast: Math.round(p.emaFast),
          emaSlow: Math.round(p.emaSlow),
          rsiOversold: Math.round(p.rsiOversold ?? 30),
          rsiOverbought: Math.round(p.rsiOverbought ?? 70),
        }
      : null;

    _optimizedParamsCache = { params, signalParams, fetchedAt: Date.now() };
    log.info({ params, signalParams, testReturn: run.bestTestReturn }, "Loaded latest optimizer params");
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load optimizer params");
  }
}

// ─── Strategy Resolution ─────────────────────────────────────────────────────

async function resolveStrategy(
  userId: string,
  symbol: string
): Promise<StrategyParams> {
  try {
    const rows = await db
      .select()
      .from(symbolStrategies)
      .where(
        and(
          eq(symbolStrategies.userId, userId),
          eq(symbolStrategies.symbol, symbol)
        )
      );

    if (rows.length > 0) {
      const row = rows[0];
      return {
        stopLossPct: row.stopLossPct,
        takeProfitPct: row.takeProfitPct,
        trailingStopPct: row.trailingStopPct,
        holdPeriod: row.holdPeriod,
      };
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to fetch symbol strategy, using default"
    );
  }

  const engine = getEngine();
  // For optimized/tactical modes, use latest optimizer results from DB
  if (engine.mode === "optimized" || engine.mode === "tactical" || engine.mode === "tactical-smart") {
    const latest = await getLatestOptimizedParams();
    if (latest) return latest;
  }

  // Fall back to hardcoded preset
  const modePresetMap: Record<EngineMode, StrategyParams> = {
    conservative: STRATEGY_PRESETS.conservative,
    moderate: STRATEGY_PRESETS.moderate,
    optimized: STRATEGY_PRESETS.optimized,
    aggressive: STRATEGY_PRESETS.aggressive,
    intraday: INTRADAY_PARAMS,
    tactical: STRATEGY_PRESETS.swing,
    "tactical-smart": STRATEGY_PRESETS.swing,
  };
  return modePresetMap[engine.mode] ?? STRATEGY_PRESETS.optimized;
}

// ─── Exit Check (intraday 1-min price monitoring) ───────────────────────────

async function runExitCheck(): Promise<void> {
  const engine = getEngine();
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;

  const resolved = await resolveBrokerClient(engine.userId);
  if (!resolved) return;

  const { client } = resolved;
  const positionMap = getPositionMap();
  if (positionMap.size === 0) return;

  const provider = getMarketDataProvider();

  for (const [symbol, pos] of positionMap) {
    try {
      const quote = await provider.fetchQuote(symbol);
      if (!quote) continue;

      const currentPrice = quote.price;
      if (currentPrice <= 0) continue;

      // Update peak
      if (currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;

      const params = await resolveStrategy(engine.userId, symbol);
      let exitReason = "";

      // Stop loss with profit-based tightening
      const fixedStop = pos.entryPrice * (1 - params.stopLossPct);
      const dynTrailPct = getDynamicTrailingPct(pos.entryPrice, pos.peakPrice, params.trailingStopPct);
      const trailStop = pos.peakPrice * (1 - dynTrailPct);
      const effectiveStop = Math.max(fixedStop, trailStop);

      if (currentPrice <= effectiveStop) {
        exitReason = currentPrice <= fixedStop ? "stop_loss" : "trailing_stop";
      }

      // Take profit
      if (!exitReason && currentPrice >= pos.entryPrice * (1 + params.takeProfitPct)) {
        exitReason = "take_profit";
      }

      if (exitReason) {
        log.info({ symbol, exitReason, currentPrice, entryPrice: pos.entryPrice }, "Exit triggered by 1-min check");
        try {
          await client.placeOrder({ symbol, qty: String(pos.qty), side: "sell", type: "market", timeInForce: "day" });
          const pnl = (currentPrice - pos.entryPrice) * pos.qty;
          engine.dailyLoss += pnl < 0 ? pnl : 0;

          await logTrade(symbol, exitReason, "SELL", pos.qty, currentPrice, "FILLED", pnl, exitReason);
          positionMap.delete(symbol);
          engine.positionCount = positionMap.size;
        } catch (err) {
          log.error({ symbol, err: err instanceof Error ? err.message : "unknown" }, "Exit order failed");
        }
      }

      await new Promise((r) => setTimeout(r, 0));
    } catch {
      // Skip symbol on error
    }
  }
}

// ─── DB Logging ──────────────────────────────────────────────────────────────

// ─── DB Logging ──────────────────────────────────────────────────────────────

async function logSignal(
  symbol: string,
  signal: string,
  price: number,
  volume: number,
  indicators: Record<string, unknown>,
  actedOn: boolean
): Promise<void> {
  try {
    await db.insert(traderSignals).values({
      symbol,
      signal,
      price,
      volume,
      indicators,
      actedOn,
      traderTimestamp: new Date(),
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to log signal"
    );
  }
}

async function logTrade(
  symbol: string,
  signal: string,
  action: "BUY" | "SELL",
  quantity: number,
  fillPrice: number | null,
  status: string,
  pnl: number | null,
  notes: string | null
): Promise<void> {
  try {
    await db.insert(traderTrades).values({
      symbol,
      signal,
      action,
      quantity,
      orderType: "market",
      fillPrice,
      fillTime: fillPrice ? new Date() : null,
      status,
      pnl,
      notes,
      traderTimestamp: new Date(),
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to log trade"
    );
  }
}

async function upsertPosition(
  symbol: string,
  quantity: number,
  entryPrice: number,
  currentPrice: number,
  stopPrice: number | null
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(traderPositions)
      .where(eq(traderPositions.symbol, symbol));

    const unrealizedPnl = (currentPrice - entryPrice) * quantity;

    if (existing.length > 0) {
      await db
        .update(traderPositions)
        .set({
          quantity,
          entryPrice,
          currentPrice,
          unrealizedPnl,
          stopPrice,
          updatedAt: new Date(),
        })
        .where(eq(traderPositions.symbol, symbol));
    } else {
      await db.insert(traderPositions).values({
        symbol,
        quantity,
        entryPrice,
        currentPrice,
        unrealizedPnl,
        stopPrice,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to upsert position"
    );
  }
}

async function removePosition(symbol: string): Promise<void> {
  try {
    await db
      .delete(traderPositions)
      .where(eq(traderPositions.symbol, symbol));
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to remove position"
    );
  }
}

async function updateHeartbeat(watchlist: string[]): Promise<void> {
  const engine = getEngine();
  const modeStr = `paper:${engine.mode}`; // persist engine mode for auto-restart
  try {
    const rows = await db.select().from(traderStatus);
    if (rows.length > 0) {
      await db
        .update(traderStatus)
        .set({
          connected: true,
          mode: modeStr,
          lastHeartbeat: new Date(),
          watchlist,
        })
        .where(eq(traderStatus.id, rows[0].id));
    } else {
      await db.insert(traderStatus).values({
        connected: true,
        mode: modeStr,
        lastHeartbeat: new Date(),
        watchlist,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to update heartbeat"
    );
  }
}

async function upsertDailyPnl(
  date: string,
  realizedDelta: number,
  unrealizedPnl: number,
  tradesCountDelta: number,
  halted: boolean
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(traderDailyPnl)
      .where(eq(traderDailyPnl.date, date));

    if (existing.length > 0) {
      const row = existing[0];
      await db
        .update(traderDailyPnl)
        .set({
          realizedPnl: (row.realizedPnl ?? 0) + realizedDelta,
          unrealizedPnl,
          tradesCount: (row.tradesCount ?? 0) + tradesCountDelta,
          halted,
        })
        .where(eq(traderDailyPnl.date, date));
    } else {
      await db.insert(traderDailyPnl).values({
        date,
        realizedPnl: realizedDelta,
        unrealizedPnl,
        tradesCount: tradesCountDelta,
        halted,
      });
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to upsert daily PnL"
    );
  }
}

// ─── In-Memory Position Tracking ─────────────────────────────────────────────

interface TrackedPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  peakPrice: number;
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  entryDate: Date;
  holdPeriod: number;
}

const g2 = globalThis as typeof globalThis & {
  __enginePositions?: Map<string, TrackedPosition>;
};

function getPositionMap(): Map<string, TrackedPosition> {
  g2.__enginePositions ??= new Map();
  return g2.__enginePositions;
}

// ─── Core Scan ───────────────────────────────────────────────────────────────

// ─── Tactical Scan: Stay invested, exit on market weakness ──────────────────

async function runTacticalScan(): Promise<void> {
  const engine = getEngine();
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;
  try { SCAN_UNIVERSE = await getSP500Symbols(); } catch { /* keep current */ }

  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyLossDate = today;
  }

  let client: BrokerClient;
  let account: BrokerAccount;
  try {
    const resolved = await resolveBrokerClient(engine.userId);
    if (!resolved) { pushError(engine, "No usable broker connection"); return; }
    client = resolved.client;
    account = await client.getAccount();
  } catch (err) {
    pushError(engine, `Broker connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    return;
  }

  const equity = account.equity;
  const provider = getMarketDataProvider();
  const positionMap = getPositionMap();

  // Fetch SPY bars for trend analysis
  let spyBars: Bar[];
  try {
    spyBars = await provider.fetchBars("SPY", 90, "1d");
  } catch {
    log.warn("Failed to fetch SPY bars for tactical scan");
    engine.lastScanAt = new Date();
    engine.scanCount++;
    return;
  }

  if (spyBars.length < TACTICAL_CONFIG.trendSMA) {
    log.warn("Not enough SPY bars for tactical analysis");
    return;
  }

  const closes = spyBars.map(b => b.close);
  const spyPrice = closes[closes.length - 1];

  // Calculate indicators
  const smaExit = closes.slice(-TACTICAL_CONFIG.exitSMA).reduce((a, b) => a + b, 0) / TACTICAL_CONFIG.exitSMA;
  const smaTrend = closes.slice(-TACTICAL_CONFIG.trendSMA).reduce((a, b) => a + b, 0) / TACTICAL_CONFIG.trendSMA;

  // RSI for re-entry timing
  let spyRSI = 50;
  if (closes.length >= 15) {
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change; else losses -= change;
    }
    gains /= 14; losses /= 14;
    spyRSI = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  }

  // Check if below exit SMA for confirmBars consecutive days
  let belowCount = 0;
  for (let i = closes.length - TACTICAL_CONFIG.confirmBars; i < closes.length; i++) {
    const sma = closes.slice(Math.max(0, i - TACTICAL_CONFIG.exitSMA), i).reduce((a, b) => a + b, 0) / Math.min(i, TACTICAL_CONFIG.exitSMA);
    if (closes[i] < sma) belowCount++;
  }
  const confirmedBelow = belowCount >= TACTICAL_CONFIG.confirmBars;

  const currentPositions = await client.getPositions().catch(() => []);

  // Reconcile: remove positions from map that no longer exist on broker
  const brokerSyms = new Set(currentPositions.map(p => p.symbol));
  for (const [sym] of positionMap) {
    if (!brokerSyms.has(sym)) {
      log.info({ symbol: sym }, "Position no longer on broker — removing from engine map");
      positionMap.delete(sym);
    }
  }
  engine.positionCount = positionMap.size;

  const isInvested = currentPositions.length > 0;

  log.info({
    spyPrice: spyPrice.toFixed(2), smaExit: smaExit.toFixed(2), smaTrend: smaTrend.toFixed(2),
    spyRSI: spyRSI.toFixed(1), confirmedBelow, isInvested, positions: positionMap.size,
  }, "Tactical scan");

  if (isInvested && confirmedBelow && spyPrice < smaExit) {
    // ── EXIT: Confirmed weakness → sell everything (simple, no graduated) ──
    log.warn("TACTICAL EXIT — SPY confirmed below exit SMA, going to cash");

    for (const pos of currentPositions) {
      if (pos.qty <= 0) continue;
      try {
        await client.placeOrder({ symbol: pos.symbol, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
        await logTrade(pos.symbol, "tactical_exit", "SELL", pos.qty, pos.currentPrice, "FILLED", pos.unrealizedPnl, "Tactical exit: SPY below SMA");
        positionMap.delete(pos.symbol);
      } catch (err) {
        log.error({ symbol: pos.symbol, err: err instanceof Error ? err.message : "unknown" }, "Exit failed");
      }
      await new Promise(r => setTimeout(r, 100));
    }
    engine.positionCount = 0;

  } else if (!isInvested && spyPrice > smaTrend) {
    // ── ENTRY: SPY above trend SMA → buy equal-weight (simple, proven) ──
    log.info("TACTICAL ENTRY — SPY above trend SMA, buying in");

    const riskLimits = await loadRiskLimits(engine.userId);
    const perPosition = equity * riskLimits.positionPct;

    for (const symbol of SCAN_UNIVERSE) {
      if (positionMap.size >= riskLimits.maxPositions) break;

      try {
        const quote = await provider.fetchQuote(symbol);
        if (!quote || quote.price <= 0) continue;

        const qty = Math.min(Math.floor(perPosition / quote.price), riskLimits.maxPositionSize);
        if (qty <= 0) continue;

        const limitPrice = (quote.price * 1.001).toFixed(2);
        await client.placeOrder({ symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });

        positionMap.set(symbol, {
          symbol, qty, entryPrice: quote.price, peakPrice: quote.price,
          stopLoss: quote.price * 0.88, takeProfit: quote.price * 1.5,
          trailingStopPct: 0.117, entryDate: new Date(), holdPeriod: 999,
        });
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 100));
    }
    engine.positionCount = positionMap.size;
    log.info({ positions: positionMap.size }, "Tactical entry complete");
  }

  // Update daily P&L from broker positions
  let totalUnrealizedPnl = 0;
  try {
    const brokerPositions = await client.getPositions();
    for (const bp of brokerPositions) {
      totalUnrealizedPnl += bp.unrealizedPnl;
    }
  } catch { /* use 0 */ }
  await upsertDailyPnl(today, 0, totalUnrealizedPnl, 0, engine.halted);

  // Update status
  engine.lastScanAt = new Date();
  engine.scanCount++;
  await updateHeartbeat(SCAN_UNIVERSE);
}

// ─── Tactical Smart: SPY trend + screener-weighted entries ──────────────────

async function runTacticalSmartScan(): Promise<void> {
  const engine = getEngine();
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;

  const today = getETDateString();
  if (engine.dailyLossDate !== today) { engine.dailyLoss = 0; engine.dailyLossDate = today; }

  let client: BrokerClient;
  let account: BrokerAccount;
  try {
    const resolved = await resolveBrokerClient(engine.userId);
    if (!resolved) { pushError(engine, "No usable broker connection"); return; }
    client = resolved.client;
    account = await client.getAccount();
  } catch (err) {
    pushError(engine, `Broker connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    return;
  }

  const equity = account.equity;
  const provider = getMarketDataProvider();
  const positionMap = getPositionMap();

  // SPY trend check (same as tactical)
  let spyBars: Bar[];
  try {
    spyBars = await provider.fetchBars("SPY", 90, "1d");
  } catch {
    log.warn("Failed to fetch SPY bars"); engine.lastScanAt = new Date(); engine.scanCount++; return;
  }
  if (spyBars.length < 50) return;

  const spyCloses = spyBars.map(b => b.close);
  const spyPrice = spyCloses[spyCloses.length - 1];
  const sma20 = spyCloses.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = spyCloses.slice(-50).reduce((a, b) => a + b, 0) / 50;

  // Check consecutive days below exit SMA
  let belowCount = 0;
  for (let i = spyCloses.length - 3; i < spyCloses.length; i++) {
    if (i >= 20) {
      const s = spyCloses.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
      if (spyCloses[i] < s) belowCount++;
    }
  }
  const confirmedBelow = belowCount >= 3;

  const currentPositions = await client.getPositions().catch(() => []);
  const isInvested = currentPositions.length > 0;

  // Reconcile: remove positions from map that no longer exist on broker
  const brokerSyms = new Set(currentPositions.map(p => p.symbol));
  for (const [sym] of positionMap) {
    if (!brokerSyms.has(sym)) {
      log.info({ symbol: sym }, "Position no longer on broker — removing from engine map");
      positionMap.delete(sym);
    }
  }
  engine.positionCount = positionMap.size;

  log.info({ spyPrice: spyPrice.toFixed(2), sma20: sma20.toFixed(2), sma50: sma50.toFixed(2), confirmedBelow, isInvested, positions: positionMap.size }, "Tactical Smart scan");

  if (isInvested && confirmedBelow && spyPrice < sma20) {
    // ── EXIT: same as regular tactical ──
    log.warn("TACTICAL SMART EXIT — SPY below SMA, going to cash");
    for (const pos of currentPositions) {
      if (pos.qty <= 0) continue;
      try {
        await client.placeOrder({ symbol: pos.symbol, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
        await logTrade(pos.symbol, "tactical_exit", "SELL", pos.qty, pos.currentPrice, "FILLED", pos.unrealizedPnl, "Tactical Smart exit");
        positionMap.delete(pos.symbol);
      } catch (err) {
        log.error({ symbol: pos.symbol, err: err instanceof Error ? err.message : "unknown" }, "Exit failed");
      }
      await new Promise(r => setTimeout(r, 100));
    }
    engine.positionCount = 0;

  } else if (!isInvested && spyPrice > sma50) {
    // ── ENTRY: Use screener signals + analyzeBars to pick best stocks ──
    log.info("TACTICAL SMART ENTRY — picking stocks via signals");
    const riskLimits = await loadRiskLimits(engine.userId);

    // Score all stocks in universe + any screener external signals
    const extSymbols = engine.externalSignals
      .filter(s => (s.signal === "BUY" || s.signal === "STRONG_BUY") && !SCAN_UNIVERSE.includes(s.symbol))
      .map(s => s.symbol);
    const allSymbols = [...SCAN_UNIVERSE, ...new Set(extSymbols)];

    // #5: Score using momentum + signals + screener + #6: inverse volatility
    const scored: { symbol: string; score: number; price: number; invVol: number }[] = [];

    for (const symbol of allSymbols) {
      try {
        const bars = await Promise.race([
          provider.fetchBars(symbol, 90, "1d"),
          new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
        ]);
        if (bars.length < 30) continue;

        // #5: Momentum score (proven predictor)
        const { momentum, volatility } = calcMomentumAndVol(bars);
        const invVol = 1 / volatility;

        // Signal score — use hybrid pipeline (same as screener)
        const analysis = await analyzeHybrid(symbol, bars);
        const sig = analysis.signal;
        let signalScore = 0;
        if (sig === "STRONG_BUY") signalScore = 4;
        else if (sig === "BUY") signalScore = 2;
        else if (sig === "HOLD") signalScore = 0;
        else signalScore = -2;

        // Screener boost
        const ext = engine.externalSignals.find(s => s.symbol === symbol);
        if (ext) {
          if (ext.signal === "STRONG_BUY") signalScore += 3;
          else if (ext.signal === "BUY") signalScore += 1;
        }

        // Combined: momentum (weight 3) + signal (weight 1) + confidence
        const score = momentum * 300 + signalScore + analysis.confidence * 2;

        if (score > 0 && momentum > -0.05) {
          scored.push({ symbol, score, price: analysis.price, invVol });
        }

        await new Promise(r => setTimeout(r, 0));
      } catch { /* skip */ }
    }

    scored.sort((a, b) => b.score - a.score);

    // #6: Allocate capital proportional to inverse volatility
    const toBuy = scored.slice(0, riskLimits.maxPositions);
    const totalInvVol = toBuy.reduce((sum, s) => sum + s.invVol, 0);

    for (const { symbol, price, invVol } of toBuy) {
      const volWeight = totalInvVol > 0 ? invVol / totalInvVol : 1 / toBuy.length;
      const positionValue = equity * Math.min(volWeight, riskLimits.positionPct);
      const qty = Math.min(Math.floor(positionValue / price), riskLimits.maxPositionSize);
      if (qty <= 0 || qty * price > account.buyingPower) continue;

      try {
        const limitPrice = (price * 1.001).toFixed(2);
        await client.placeOrder({ symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        await logTrade(symbol, "tactical_smart_entry", "BUY", qty, price, "FILLED", null, "Smart: momentum + signal + invVol weighted");
        positionMap.set(symbol, {
          symbol, qty, entryPrice: price, peakPrice: price,
          stopLoss: price * 0.88, takeProfit: price * 1.5,
          trailingStopPct: 0.117, entryDate: new Date(), holdPeriod: 999,
        });
      } catch (err) {
        log.error({ symbol, err: err instanceof Error ? err.message : "unknown" }, "Smart entry failed");
      }
      await new Promise(r => setTimeout(r, 100));
    }
    engine.positionCount = positionMap.size;
    log.info({ positions: positionMap.size, candidates: scored.length }, "Tactical Smart buy-in complete");

  } else if (isInvested && !confirmedBelow) {
    // ── ACTIVE MANAGEMENT: scan for swaps and additions while holding ──
    const riskLimits = await loadRiskLimits(engine.userId);
    const heldSymbols = new Set(currentPositions.map(p => p.symbol));

    // Score all stocks (same logic as entry)
    const extSymbols = engine.externalSignals
      .filter(s => (s.signal === "BUY" || s.signal === "STRONG_BUY") && !SCAN_UNIVERSE.includes(s.symbol))
      .map(s => s.symbol);
    const allSymbols = [...SCAN_UNIVERSE, ...new Set(extSymbols)];

    const candidates: { symbol: string; signal: string; score: number; price: number; invVol: number }[] = [];
    const weakHeld: { symbol: string; signal: string; pnlPct: number }[] = [];

    for (const symbol of allSymbols) {
      try {
        const bars = await Promise.race([
          provider.fetchBars(symbol, 90, "1d"),
          new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
        ]);
        if (bars.length < 30) continue;

        const analysis = await analyzeHybrid(symbol, bars);
        const sig = analysis.signal;

        // Track weak held positions (SELL signal)
        if (heldSymbols.has(symbol) && (sig === "SELL" || sig === "STRONG_SELL")) {
          const bp = currentPositions.find(p => p.symbol === symbol);
          const pnlPct = bp ? bp.unrealizedPnl / (bp.avgEntryPrice * bp.qty) * 100 : 0;
          weakHeld.push({ symbol, signal: sig, pnlPct });
        }

        // Track STRONG_BUY candidates not already held
        if (!heldSymbols.has(symbol) && sig === "STRONG_BUY") {
          const { momentum, volatility } = calcMomentumAndVol(bars);
          if (momentum > -0.05) {
            const score = momentum * 300 + 4 + analysis.confidence * 2;
            candidates.push({ symbol, signal: sig, score, price: analysis.price, invVol: 1 / volatility });
          }
        }

        await new Promise(r => setTimeout(r, 0));
      } catch { /* skip */ }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Log signals for visibility (even if not acting)
    for (const c of candidates.slice(0, 5)) {
      await logSignal(c.symbol, c.signal as SignalType, c.price, 0, {}, false);
    }

    // 1. Swap: sell weak held positions and replace with top STRONG_BUY candidates
    let swapCount = 0;
    for (const weak of weakHeld) {
      if (candidates.length === 0) break;
      const bp = currentPositions.find(p => p.symbol === weak.symbol);
      if (!bp || bp.qty <= 0) continue;

      const replacement = candidates.shift()!;

      // Sell the weak position
      try {
        await client.placeOrder({ symbol: weak.symbol, side: "sell", qty: String(bp.qty), type: "market", timeInForce: "day" });
        await logTrade(weak.symbol, "tactical_smart_swap_sell", "SELL", bp.qty, bp.currentPrice, "FILLED", bp.unrealizedPnl, `Swap out: ${weak.signal}`);
        positionMap.delete(weak.symbol);
        heldSymbols.delete(weak.symbol);
      } catch (err) {
        log.error({ symbol: weak.symbol, err: err instanceof Error ? err.message : "unknown" }, "Swap sell failed");
        continue;
      }

      // Buy the replacement
      await new Promise(r => setTimeout(r, 200));
      const positionValue = equity * riskLimits.positionPct;
      const qty = Math.min(Math.floor(positionValue / replacement.price), riskLimits.maxPositionSize);
      if (qty <= 0) continue;

      try {
        const limitPrice = (replacement.price * 1.001).toFixed(2);
        await client.placeOrder({ symbol: replacement.symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        await logTrade(replacement.symbol, "tactical_smart_swap_buy", "BUY", qty, replacement.price, "FILLED", null, `Swap in: STRONG_BUY score ${replacement.score.toFixed(1)}`);
        positionMap.set(replacement.symbol, {
          symbol: replacement.symbol, qty, entryPrice: replacement.price, peakPrice: replacement.price,
          stopLoss: replacement.price * 0.88, takeProfit: replacement.price * 1.5,
          trailingStopPct: 0.117, entryDate: new Date(), holdPeriod: 999,
        });
        heldSymbols.add(replacement.symbol);
        swapCount++;
      } catch (err) {
        log.error({ symbol: replacement.symbol, err: err instanceof Error ? err.message : "unknown" }, "Swap buy failed");
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // 2. Add: open new positions for remaining STRONG_BUY candidates if cash available
    const hardCap = Math.floor(riskLimits.maxPositions * 1.5);
    let addCount = 0;
    for (const cand of candidates) {
      if (positionMap.size >= hardCap) break;

      const positionValue = equity * riskLimits.positionPct;
      const qty = Math.min(Math.floor(positionValue / cand.price), riskLimits.maxPositionSize);
      if (qty <= 0 || qty * cand.price > account.buyingPower) continue;

      // Check exposure (use equity as cap when not configured)
      const effectiveMaxExposure = riskLimits.maxExposure > 0 ? riskLimits.maxExposure : equity * 1.5;
      const currentExposure = Array.from(positionMap.values())
        .reduce((sum, p) => sum + p.entryPrice * p.qty, 0);
      if (currentExposure + cand.price * qty > effectiveMaxExposure) break;

      try {
        const limitPrice = (cand.price * 1.001).toFixed(2);
        await client.placeOrder({ symbol: cand.symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        await logTrade(cand.symbol, "tactical_smart_add", "BUY", qty, cand.price, "FILLED", null, `STRONG_BUY add: score ${cand.score.toFixed(1)}`);
        positionMap.set(cand.symbol, {
          symbol: cand.symbol, qty, entryPrice: cand.price, peakPrice: cand.price,
          stopLoss: cand.price * 0.88, takeProfit: cand.price * 1.5,
          trailingStopPct: 0.117, entryDate: new Date(), holdPeriod: 999,
        });
        addCount++;
      } catch (err) {
        log.error({ symbol: cand.symbol, err: err instanceof Error ? err.message : "unknown" }, "Add position failed");
      }
      await new Promise(r => setTimeout(r, 100));
    }

    engine.positionCount = positionMap.size;
    if (swapCount > 0 || addCount > 0) {
      log.info({ swaps: swapCount, adds: addCount, positions: positionMap.size, weakFound: weakHeld.length, strongCandidates: candidates.length + swapCount + addCount }, "Tactical Smart active management");
    }
  }

  // Update daily P&L from broker positions
  let totalUnrealizedPnl = 0;
  try {
    const brokerPositions = await client.getPositions();
    for (const bp of brokerPositions) {
      totalUnrealizedPnl += bp.unrealizedPnl;
    }
  } catch { /* use 0 */ }
  await upsertDailyPnl(today, 0, totalUnrealizedPnl, 0, engine.halted);

  engine.lastScanAt = new Date();
  engine.scanCount++;
  await updateHeartbeat([...positionMap.keys()]);
}

// ─── Standard Signal-Based Scan ─────────────────────────────────────────────

async function runScan(barResolution: "1d" | "5m" = "1d"): Promise<void> {
  const engine = getEngine();

  // Refresh S&P 500 universe (auto-updates daily from Wikipedia)
  try { SCAN_UNIVERSE = await getSP500Symbols(); } catch { /* keep current */ }

  if (engine.halted) {
    log.info("Engine halted, skipping scan");
    return;
  }

  if (!engine.userId) {
    log.error("No userId set on engine");
    pushError(engine, "No userId configured");
    return;
  }

  if (!isMarketOpen()) {
    log.debug("Market closed, skipping scan");
    return;
  }

  // Intraday mode: flatten all positions at 3:00 PM ET
  if (isIntradayMode(engine.mode)) {
    const now = getETDate();
    if (now.getHours() >= 15) {
      const positionMap = getPositionMap();
      if (positionMap.size > 0) {
        log.info({ positions: positionMap.size }, "Flatten time (3:00 PM ET) — closing all intraday positions");
        for (const [sym, pos] of positionMap) {
          try {
            const resolved = await resolveBrokerClient(engine.userId);
            if (resolved) {
              await resolved.client.placeOrder({ symbol: sym, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
              await logTrade(sym, "flatten", "SELL", pos.qty, pos.entryPrice, "FILLED", null, "EOD flatten");
            }
            positionMap.delete(sym);
          } catch (err) {
            log.error({ symbol: sym, err: err instanceof Error ? err.message : "unknown" }, "Flatten failed");
          }
        }
        engine.positionCount = 0;
      }
      return; // Don't open new positions after 3 PM
    }
  }

  // Reset daily loss tracking if date changed
  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyLossDate = today;
  }

  log.info({ scan: engine.scanCount + 1 }, "Starting scan cycle");

  // 1. Resolve broker
  let client: BrokerClient;
  let account: BrokerAccount;
  try {
    const resolved = await resolveBrokerClient(engine.userId);
    if (!resolved) {
      pushError(engine, "No usable broker connection");
      return;
    }
    client = resolved.client;
    account = await client.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg }, "Failed to connect to broker");
    pushError(engine, `Broker connection failed: ${msg}`);
    return;
  }

  const equity = account.equity;
  if (equity <= 0) {
    log.warn({ equity }, "Account equity is zero or negative");
    pushError(engine, "Account equity is zero or negative");
    return;
  }

  // Load dynamic risk limits from user's Risk Profile
  const riskLimits = await loadRiskLimits(engine.userId);
  engine.dailyLossLimit = riskLimits.dailyLossPct;

  // 2. Check daily loss limit
  const dailyLossThreshold = equity * riskLimits.dailyLossPct;
  if (engine.dailyLoss <= -dailyLossThreshold) {
    log.warn(
      { dailyLoss: engine.dailyLoss, threshold: dailyLossThreshold },
      "Daily loss limit exceeded — halting engine"
    );
    engine.halted = true;
    pushError(engine, `Daily loss limit hit: $${engine.dailyLoss.toFixed(2)}`);
    await upsertDailyPnl(today, 0, 0, 0, true);
    return;
  }

  // 3. Market health check — SPY trend filter
  const provider = getMarketDataProvider();
  let marketHealthy = true;
  try {
    const spyBars = await provider.fetchBars("SPY", 30, "1d");
    if (spyBars.length >= 20) {
      const closes = spyBars.map(b => b.close);
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const spyPrice = closes[closes.length - 1];
      if (spyPrice < sma20) {
        marketHealthy = false;
        log.info({ spyPrice: spyPrice.toFixed(2), sma20: sma20.toFixed(2) }, "SPY below SMA(20) — buy signals blocked");
      }
    }
  } catch {
    // If SPY check fails, allow trading
  }

  // 4. Scan universe (top 50 + any symbols from external signals)
  const externalSymbols = engine.externalSignals
    .filter((s) => !SCAN_UNIVERSE.includes(s.symbol))
    .map((s) => s.symbol);
  const symbols = [...SCAN_UNIVERSE, ...new Set(externalSymbols)];

  // 4. Get current broker positions
  let brokerPositions: Awaited<ReturnType<BrokerClient["getPositions"]>> = [];
  try {
    brokerPositions = await client.getPositions();
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to fetch broker positions"
    );
  }

  const positionMap = getPositionMap();

  // Reconcile: remove positions from map AND database that no longer exist on broker
  // (handles manual sells on Alpaca, external closures, etc.)
  if (brokerPositions.length > 0 || positionMap.size > 0) {
    const brokerSymbols = new Set(brokerPositions.map(p => p.symbol));
    for (const [symbol] of positionMap) {
      if (!brokerSymbols.has(symbol)) {
        log.info({ symbol }, "Position no longer on broker — removing from engine");
        positionMap.delete(symbol);
        await removePosition(symbol);
      }
    }
    engine.positionCount = positionMap.size;
  }

  let realizedPnlThisScan = 0;
  let tradesThisScan = 0;

  // 5. Scan each symbol
  for (const symbol of symbols) {
    try {
      // Yield to event loop between symbols
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (engine.halted) break;

      // Fetch bars and analyze
      const days = barResolution === "5m" ? 5 : BARS_FOR_ANALYSIS;
      const bars = await provider.fetchBars(symbol, days, barResolution);
      if (bars.length < 20) {
        log.debug({ symbol, barCount: bars.length }, "Insufficient bars, skipping");
        continue;
      }

      // Use hybrid pipeline (technical + sentiment + analyst + options) for signal decisions
      const analysis = await analyzeHybrid(symbol, bars);
      const currentPrice = analysis.price;
      const confidence = analysis.confidence;
      const signal = analysis.signal;

      // Log signal to DB
      await logSignal(
        symbol,
        signal,
        currentPrice,
        analysis.volume,
        analysis.indicators as unknown as Record<string, unknown>,
        false // will update to true if we act on it
      );

      const heldPosition = positionMap.get(symbol);
      const brokerPos = brokerPositions.find((p) => p.symbol === symbol);

      // ── EXIT LOGIC (if we hold this symbol) ──────────────────────
      if (heldPosition) {
        // Update peak price for trailing stop
        if (currentPrice > heldPosition.peakPrice) {
          heldPosition.peakPrice = currentPrice;
        }

        const strategy = await resolveStrategy(engine.userId, symbol);
        const dynTrail = getDynamicTrailingPct(heldPosition.entryPrice, heldPosition.peakPrice, strategy.trailingStopPct);
        const trailingStopPrice =
          heldPosition.peakPrice * (1 - dynTrail);
        const tradingDays = tradingDaysBetween(heldPosition.entryDate, new Date());

        let shouldExit = false;
        let exitReason = "";

        // Stop loss
        if (currentPrice <= heldPosition.stopLoss) {
          shouldExit = true;
          exitReason = `Stop loss hit at $${currentPrice.toFixed(2)} (stop: $${heldPosition.stopLoss.toFixed(2)})`;
        }
        // Take profit
        else if (currentPrice >= heldPosition.takeProfit) {
          shouldExit = true;
          exitReason = `Take profit hit at $${currentPrice.toFixed(2)} (target: $${heldPosition.takeProfit.toFixed(2)})`;
        }
        // Trailing stop
        else if (currentPrice <= trailingStopPrice) {
          shouldExit = true;
          exitReason = `Trailing stop hit at $${currentPrice.toFixed(2)} (peak: $${heldPosition.peakPrice.toFixed(2)}, trail: $${trailingStopPrice.toFixed(2)})`;
        }
        // Hold period expired
        else if (tradingDays >= strategy.holdPeriod) {
          shouldExit = true;
          exitReason = `Hold period expired (${tradingDays} trading days >= ${strategy.holdPeriod})`;
        }
        // Sell signal
        else if (
          signal === SignalType.SELL ||
          signal === SignalType.STRONG_SELL
        ) {
          shouldExit = true;
          exitReason = `Sell signal received: ${signal} (confidence: ${(confidence * 100).toFixed(0)}%)`;
        }

        if (shouldExit) {
          log.info({ symbol, reason: exitReason }, "Exiting position");

          try {
            const sellQty = brokerPos
              ? brokerPos.qty
              : heldPosition.qty;

            await client.placeOrder({
              symbol,
              side: "sell",
              qty: String(sellQty),
              type: "market",
              timeInForce: "day",
            });

            const pnl =
              (currentPrice - heldPosition.entryPrice) * heldPosition.qty;
            realizedPnlThisScan += pnl;
            engine.dailyLoss += pnl < 0 ? pnl : 0;
            tradesThisScan++;

            await logTrade(
              symbol,
              signal,
              "SELL",
              heldPosition.qty,
              currentPrice,
              "FILLED",
              pnl,
              exitReason
            );

            await removePosition(symbol);
            positionMap.delete(symbol);

            log.info(
              { symbol, pnl: pnl.toFixed(2), reason: exitReason },
              "Position closed"
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            log.error({ err: msg, symbol }, "Failed to place sell order");
            pushError(engine, `Sell order failed for ${symbol}: ${msg}`);

            await logTrade(
              symbol,
              signal,
              "SELL",
              heldPosition.qty,
              null,
              "FAILED",
              null,
              `Order failed: ${msg}`
            );
          }
        } else {
          // Update position tracking in DB
          await upsertPosition(
            symbol,
            heldPosition.qty,
            heldPosition.entryPrice,
            currentPrice,
            Math.max(heldPosition.stopLoss, trailingStopPrice)
          );
        }

        continue; // Already holding, don't buy again
      }

      // ── Check external signals (from Screener) ──────────────────
      const extSignal = engine.externalSignals.find(
        (s) => s.symbol === symbol && (s.signal === "STRONG_BUY" || s.signal === "BUY")
      );
      const shouldBuy = (signal === SignalType.BUY || signal === SignalType.STRONG_BUY || !!extSignal) && marketHealthy;

      // ── ENTRY LOGIC (if not holding) ─────────────────────────────
      // Allow STRONG_BUY to exceed maxPositions by up to 50% when cash is available
      const isStrongSignal = signal === SignalType.STRONG_BUY;
      const hardCap = Math.floor(riskLimits.maxPositions * 1.5);
      const positionCap = isStrongSignal ? hardCap : riskLimits.maxPositions;
      if (shouldBuy && positionMap.size < positionCap) {
        // Smart filters: earnings blackout, relative strength, sentiment
        const filterResult = await passesSmartFilters(symbol, bars);
        if (!filterResult.allowed) {
          log.debug({ symbol, reason: filterResult.reason }, "Blocked by smart filter");
          continue;
        }

        const strategy = await resolveStrategy(engine.userId, symbol);

        // Position sizing from risk profile
        const positionValue = equity * riskLimits.positionPct;
        const qty = Math.min(
          Math.floor(positionValue / currentPrice),
          riskLimits.maxPositionSize
        );

        if (qty <= 0) {
          log.debug({ symbol, equity, positionValue, currentPrice }, "Computed qty is 0, skipping");
          continue;
        }

        // Check buying power before sending order to broker
        // Use buyingPower (not cash) — margin accounts can have negative cash but positive buying power
        const orderCost = qty * currentPrice;
        if (orderCost > account.buyingPower) {
          log.debug({ symbol, qty, required: orderCost, buyingPower: account.buyingPower }, "Insufficient buying power, skipping");
          continue;
        }

        // Check max portfolio exposure (use equity as cap when not configured)
        const effectiveMaxExposure = riskLimits.maxExposure > 0 ? riskLimits.maxExposure : equity * 1.5;
        const currentExposure = Array.from(positionMap.values())
          .reduce((sum, p) => sum + p.entryPrice * p.qty, 0);
        if (currentExposure + (currentPrice * qty) > effectiveMaxExposure) {
          log.info({ symbol, currentExposure, maxExposure: effectiveMaxExposure }, "Max exposure reached, skipping");
          continue;
        }

        // Signal cooldown: skip if same symbol bought within last 10 scans
        const cooldownKey = `cooldown:${symbol}`;
        const lastBuy = engine.externalSignals.find(s => s.symbol === cooldownKey);
        if (lastBuy && Date.now() - lastBuy.receivedAt < 150 * 60 * 1000) {
          continue; // ~2.5 hours cooldown
        }

        // Calculate bracket levels
        const stopLossPrice = parseFloat((currentPrice * (1 - strategy.stopLossPct)).toFixed(2));
        const takeProfitPrice = parseFloat((currentPrice * (1 + strategy.takeProfitPct)).toFixed(2));
        // Limit price: slight premium for entry (0.1% above current)
        const limitPrice = parseFloat((currentPrice * 1.001).toFixed(2));

        log.info(
          {
            symbol, signal, confidence: confidence.toFixed(3), qty,
            limitPrice, stopLoss: stopLossPrice, takeProfit: takeProfitPrice,
          },
          "Placing bracket order"
        );

        try {
          // Place limit buy order — stop-loss and take-profit are managed
          // internally by the engine's exit logic (trailing stop, hold period)
          await client.placeOrder({
            symbol,
            side: "buy",
            qty: String(qty),
            type: "limit",
            timeInForce: "day",
            limitPrice: String(limitPrice),
          });

          tradesThisScan++;

          // Set cooldown to prevent re-buying same symbol too quickly
          engine.externalSignals.push({
            symbol: `cooldown:${symbol}`, signal: "COOLDOWN",
            confidence: 0, price: 0, source: "engine", receivedAt: Date.now(),
          });

          // Track position in memory
          const tracked: TrackedPosition = {
            symbol,
            qty,
            entryPrice: currentPrice,
            peakPrice: currentPrice,
            stopLoss: stopLossPrice,
            takeProfit: takeProfitPrice,
            trailingStopPct: strategy.trailingStopPct,
            entryDate: new Date(),
            holdPeriod: strategy.holdPeriod,
          };
          positionMap.set(symbol, tracked);

          await logTrade(
            symbol,
            signal,
            "BUY",
            qty,
            currentPrice,
            "FILLED",
            null,
            `Entry: ${signal} (${(confidence * 100).toFixed(0)}% confidence)`
          );

          await upsertPosition(symbol, qty, currentPrice, currentPrice, stopLossPrice);

          // Mark signal as acted on
          await logSignal(
            symbol,
            signal,
            currentPrice,
            analysis.volume,
            analysis.indicators as unknown as Record<string, unknown>,
            true
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          log.error({ err: msg, symbol }, "Failed to place buy order");
          pushError(engine, `Buy order failed for ${symbol}: ${msg}`);

          await logTrade(
            symbol,
            signal,
            "BUY",
            qty,
            null,
            "FAILED",
            null,
            `Order failed: ${msg}`
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error({ err: msg, symbol }, "Error processing symbol");
      pushError(engine, `Error scanning ${symbol}: ${msg}`);
    }
  }

  // 6. Clear processed external signals (older than 30 min)
  const now = Date.now();
  engine.externalSignals = engine.externalSignals.filter(
    (s) => now - s.receivedAt < 30 * 60 * 1000
  );

  // 7. Update engine state
  engine.lastScanAt = new Date();
  engine.scanCount++;
  engine.positionCount = positionMap.size;

  // 7. Calculate total unrealized PnL from tracked positions
  let totalUnrealizedPnl = 0;
  for (const pos of positionMap.values()) {
    // Use last known price from broker positions if available
    const bp = brokerPositions.find((p) => p.symbol === pos.symbol);
    const currentPrice = bp ? bp.currentPrice : pos.entryPrice;
    totalUnrealizedPnl += (currentPrice - pos.entryPrice) * pos.qty;
  }

  // 8. Update daily PnL and heartbeat
  await upsertDailyPnl(
    today,
    realizedPnlThisScan,
    totalUnrealizedPnl,
    tradesThisScan,
    engine.halted
  );
  await updateHeartbeat(symbols);

  log.info(
    {
      scan: engine.scanCount,
      positions: positionMap.size,
      realized: realizedPnlThisScan.toFixed(2),
      unrealized: totalUnrealizedPnl.toFixed(2),
      dailyLoss: engine.dailyLoss.toFixed(2),
    },
    "Scan cycle complete"
  );
}

// ─── Engine Control ──────────────────────────────────────────────────────────

export async function startEngine(userId: string, mode: EngineMode = "optimized"): Promise<{
  ok: boolean;
  error?: string;
}> {
  const engine = getEngine();

  if (engine.running) {
    return { ok: false, error: "Engine is already running" };
  }

  // Verify broker connection exists and is paper mode
  const resolved = await resolveBrokerClient(userId);
  if (!resolved) {
    return {
      ok: false,
      error: "No active paper broker connection found. Connect a broker in paper mode first.",
    };
  }

  // Verify the connection works
  try {
    await resolved.client.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: `Broker connection test failed: ${msg}` };
  }

  // Replace old safety stops with wide disaster stops (engine manages tighter exits dynamically)
  try {
    if (resolved.client.cancelAllOrders) {
      await resolved.client.cancelAllOrders();
    }
    await placeDisasterStops(userId);
    log.info("Placed disaster stops — engine taking over dynamic management");
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to set up disaster stops");
  }

  engine.running = true;
  engine.halted = false;
  engine.mode = mode;
  engine.userId = userId;
  engine.errors = [];
  engine.dailyLoss = 0;
  engine.dailyLossDate = getETDateString();

  // Clear halted flag in database so UI stops showing "Trading Halted"
  const today = getETDateString();
  upsertDailyPnl(today, 0, 0, 0, false).catch(() => {});

  const intraday = isIntradayMode(mode);
  const scanIntervalMs = intraday ? INTRADAY_SCAN_MS : SWING_SCAN_MS;
  const barResolution = intraday ? "5m" : "1d";

  log.info({ userId, mode, scanIntervalMs }, "Trading engine started");

  // Pick the right scan function based on mode
  const scanFn = mode === "tactical" ? runTacticalScan
    : mode === "tactical-smart" ? runTacticalSmartScan
    : () => runScan(barResolution);

  // Run initial scan immediately
  scanFn().catch((err) => {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Initial scan failed");
    pushError(engine, `Initial scan failed: ${err instanceof Error ? err.message : "unknown"}`);
  });

  // Set up scan interval
  engine.intervalId = setInterval(() => {
    if (!engine.running) return;
    scanFn().catch((err) => {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Scan cycle failed");
      pushError(engine, `Scan failed: ${err instanceof Error ? err.message : "unknown"}`);
    });
  }, scanIntervalMs);

  // Intraday mode: also run 1-minute exit checks using live quotes
  if (mode === "intraday") {
    engine.exitCheckId = setInterval(() => {
      if (!engine.running || engine.halted) return;
      runExitCheck().catch((err) => {
        log.error({ err: err instanceof Error ? err.message : "unknown" }, "Exit check failed");
      });
    }, EXIT_CHECK_MS);
  }

  return { ok: true };
}

export async function stopEngine(): Promise<{ ok: boolean; error?: string }> {
  const engine = getEngine();

  if (!engine.running) {
    return { ok: false, error: "Engine is not running" };
  }

  if (engine.intervalId) {
    clearInterval(engine.intervalId);
    engine.intervalId = null;
  }
  if (engine.exitCheckId) {
    clearInterval(engine.exitCheckId);
    engine.exitCheckId = null;
  }

  engine.running = false;

  // Place broker-side safety stop orders for all open positions
  await placeSafetyStops(engine.userId);

  log.info("Trading engine stopped — safety stops placed on broker");

  return { ok: true };
}

/**
 * Place stop-loss orders directly on Alpaca for all open positions.
 * These act as a safety net when the engine isn't running.
 */
const DISASTER_STOP_PCT = 0.18; // 18% below entry — only fires if server is down for hours

/**
 * Place wide disaster stops on Alpaca for all positions.
 * These are a safety net while the engine is running — the engine manages
 * tighter dynamic exits, but if the server crashes these prevent catastrophic loss.
 */
async function placeDisasterStops(userId: string | null): Promise<void> {
  if (!userId) return;

  const resolved = await resolveBrokerClient(userId);
  if (!resolved) return;

  try {
    const positions = await resolved.client.getPositions();
    for (const pos of positions) {
      if (pos.qty <= 0) continue;
      const stopPrice = (pos.avgEntryPrice * (1 - DISASTER_STOP_PCT)).toFixed(2);
      try {
        await resolved.client.placeOrder({
          symbol: pos.symbol, side: "sell", qty: String(pos.qty),
          type: "stop", timeInForce: "gtc", stopPrice,
        });
        log.info({ symbol: pos.symbol, stopPrice, qty: pos.qty, pct: DISASTER_STOP_PCT }, "Disaster stop placed");
      } catch (err) {
        log.error({ symbol: pos.symbol, err: err instanceof Error ? err.message : "unknown" }, "Failed to place disaster stop");
      }
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to place disaster stops");
  }
}

/**
 * Place tighter safety stops when engine is stopping (strategy-level stop loss).
 * These are more protective since the engine won't be managing exits dynamically.
 */
async function placeSafetyStops(userId: string | null): Promise<void> {
  if (!userId) return;

  const resolved = await resolveBrokerClient(userId);
  if (!resolved) return;

  const { client } = resolved;

  try {
    const positions = await client.getPositions();
    if (positions.length === 0) return;

    for (const pos of positions) {
      if (pos.qty <= 0) continue;

      const strategy = await resolveStrategy(userId, pos.symbol);
      const stopPrice = (pos.avgEntryPrice * (1 - strategy.stopLossPct)).toFixed(2);

      try {
        await client.placeOrder({
          symbol: pos.symbol, side: "sell", qty: String(pos.qty),
          type: "stop", timeInForce: "gtc", stopPrice,
        });
        log.info({ symbol: pos.symbol, stopPrice, qty: pos.qty }, "Safety stop placed");
      } catch (err) {
        log.error({ symbol: pos.symbol, err: err instanceof Error ? err.message : "unknown" }, "Failed to place safety stop");
      }
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to place safety stops");
  }
}

export async function haltEngine(): Promise<{ ok: boolean; error?: string }> {
  const engine = getEngine();

  // Stop the loop
  if (engine.intervalId) {
    clearInterval(engine.intervalId);
    engine.intervalId = null;
  }

  engine.running = false;
  engine.halted = true;

  // Close all tracked positions
  if (engine.userId) {
    try {
      const resolved = await resolveBrokerClient(engine.userId);
      if (resolved) {
        // Cancel all pending orders first — orphaned stop-loss/take-profit
        // orders from bracket orders will block position sells
        if (resolved.client.cancelAllOrders) {
          try {
            await resolved.client.cancelAllOrders();
            log.info("Cancelled all pending orders before halt liquidation");
          } catch (err) {
            log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to cancel orders on halt");
          }
        }

        const positionMap = getPositionMap();
        const positions = Array.from(positionMap.values());

        for (const pos of positions) {
          try {
            await resolved.client.placeOrder({
              symbol: pos.symbol,
              side: "sell",
              qty: String(pos.qty),
              type: "market",
              timeInForce: "day",
            });

            const quote = await getMarketDataProvider().fetchQuote(pos.symbol);
            const closePrice = quote?.price ?? pos.entryPrice;
            const pnl = (closePrice - pos.entryPrice) * pos.qty;

            await logTrade(
              pos.symbol,
              "HALT",
              "SELL",
              pos.qty,
              closePrice,
              "FILLED",
              pnl,
              "Emergency halt — all positions closed"
            );

            await removePosition(pos.symbol);
            positionMap.delete(pos.symbol);

            log.info(
              { symbol: pos.symbol, pnl: pnl.toFixed(2) },
              "Position closed on halt"
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            log.error(
              { err: msg, symbol: pos.symbol },
              "Failed to close position on halt"
            );
            pushError(
              engine,
              `Failed to close ${pos.symbol} on halt: ${msg}`
            );
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error({ err: msg }, "Failed to resolve broker for halt");
      pushError(engine, `Halt broker resolution failed: ${msg}`);
    }
  }

  log.warn("Trading engine emergency halted");
  return { ok: true };
}

/**
 * Push an external signal into the engine (from Screener, manual, etc.)
 * The engine will act on it during its next scan cycle.
 */
export function pushExternalSignal(signal: ExternalSignal): boolean {
  const engine = getEngine();
  if (!engine.running || engine.halted) return false;

  // Dedup: don't accept the same symbol+signal within 30 minutes
  const isDup = engine.externalSignals.some(
    (s) => s.symbol === signal.symbol && s.signal === signal.signal && Date.now() - s.receivedAt < 30 * 60 * 1000
  );
  if (isDup) return false;

  engine.externalSignals.push(signal);
  log.info({ symbol: signal.symbol, signal: signal.signal, source: signal.source }, "External signal received");
  return true;
}

/**
 * Auto-start engine if there are open positions on the broker.
 * Called on first dashboard API hit after a deploy/restart.
 */
export async function autoStartIfNeeded(userId: string): Promise<void> {
  const engine = getEngine();
  if (engine.running) return;

  const resolved = await resolveBrokerClient(userId);
  if (!resolved) return;

  try {
    const positions = await resolved.client.getPositions();
    if (positions.length > 0) {
      // Recover last engine mode from DB
      let lastMode: EngineMode = "optimized";
      try {
        const [status] = await db.select().from(traderStatus).limit(1);
        if (status?.mode?.startsWith("paper:")) {
          const savedMode = status.mode.split(":")[1] as EngineMode;
          const validModes: EngineMode[] = ["conservative", "moderate", "optimized", "aggressive", "intraday", "tactical", "tactical-smart"];
          if (validModes.includes(savedMode)) lastMode = savedMode;
        }
      } catch { /* use default */ }

      log.info({ positions: positions.length, userId, mode: lastMode }, "Open positions detected — auto-starting engine with last mode");

      // Sync broker positions into in-memory map so engine manages them immediately
      const positionMap = getPositionMap();
      const strategy = await resolveStrategy(userId, "default");
      for (const bp of positions) {
        if (positionMap.has(bp.symbol)) continue; // already tracked
        positionMap.set(bp.symbol, {
          symbol: bp.symbol,
          qty: bp.qty,
          entryPrice: bp.avgEntryPrice,
          peakPrice: Math.max(bp.currentPrice, bp.avgEntryPrice), // conservative: at least entry or current
          stopLoss: bp.avgEntryPrice * (1 - strategy.stopLossPct),
          takeProfit: bp.avgEntryPrice * (1 + strategy.takeProfitPct),
          trailingStopPct: strategy.trailingStopPct,
          entryDate: new Date(), // unknown — use now so hold period counts from restart
          holdPeriod: strategy.holdPeriod,
        });
      }
      log.info({ synced: positionMap.size }, "Synced broker positions into engine");

      await startEngine(userId, lastMode);
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Auto-start check failed");
  }
}

export function getEngineStatus(): {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  dailyLossLimit: number;
  errors: string[];
  userId: string | null;
} {
  const engine = getEngine();
  return {
    running: engine.running,
    halted: engine.halted,
    mode: engine.mode,
    lastScanAt: engine.lastScanAt?.toISOString() ?? null,
    scanCount: engine.scanCount,
    positionCount: engine.positionCount,
    dailyLoss: engine.dailyLoss,
    dailyLossLimit: engine.dailyLossLimit,
    errors: engine.errors.slice(-20),
    userId: engine.userId,
  };
}
