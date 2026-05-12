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
import type { BrokerClient, BrokerAccount, BrokerPosition, BrokerOrder, PlaceOrderParams } from "./brokers";
import { decrypt } from "./crypto";
import { getMarketDataProvider } from "./market-data";
import { analyzeHybrid } from "./hybrid/pipeline";
import type { SignalParams } from "./indicators/analyzer";
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
  traderStatus,
  traderDailyPnl,
  optimizationRuns,
  userTaxStatus,
} from "./db/schema";
import { eq, and, desc, gt, inArray, lt, isNotNull } from "drizzle-orm";
import { createRouteLogger } from "./logger";
import { writeAudit, AuditAction } from "./audit";

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
  /** Optional — passed through from the screener so the DB row written for
   *  Recent Signals carries a real volume rather than 0. */
  volume?: number;
}

export interface EngineState {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  intervalId: ReturnType<typeof setInterval> | null;
  exitCheckId: ReturnType<typeof setInterval> | null;
  marketOpenTimeoutId: ReturnType<typeof setTimeout> | null;
  lastScanAt: Date | null;
  scanCount: number;
  dailyLoss: number;
  dailyLossLimit: number;
  dailyLossDate: string;
  userId: string | null;
  positionCount: number;
  externalSignals: ExternalSignal[];
  errors: string[];
  // Broker connectivity tracking
  brokerConnected: boolean;
  lastBrokerContact: Date | null;
  consecutiveBrokerFailures: number;
  // Symbols with an exit order in flight — prevents the 1-min exit check and
  // 15-min main scan from both placing sells on the same position during the
  // window between placeOrder() and positionMap.delete().
  pendingExits: Set<string>;
  // Buy cooldowns keyed by symbol → timestamp. Replaces the previous hack
  // that piggybacked on externalSignals (which got cleaned up at 30 min,
  // breaking the intended 150-min window).
  cooldowns: Map<string, number>;
  // ── Live-trading safeguards (Phase 3) ──
  /** Broker environment for the active connection: "paper" or "live". Captured at startEngine(). */
  environment: "paper" | "live" | null;
  /** Snapshot of equity + accountNumber at startEngine() — used to detect mid-session account switches. */
  boot: { equity: number; accountNumber: string | null } | null;
  /** Sum of gross BUY notional placed today (USD). Resets in lockstep with dailyLoss/dailyLossDate. */
  dailyNotional: number;
  /** Number of consecutive losing trades (resets on any winner). */
  consecutiveLosses: number;
  /** Sliding-window timestamps (ms) of recent order placements for rate limiting. */
  recentOrderTimestamps: number[];
  // ── Phase 5 — personalized live-trading protections ──
  /** True when user has self-attested §475(f) MTM election. Disables wash-sale tracking. */
  mtmElected: boolean;
  /** True when the engine should block re-entries on symbols with recent losing closes. Inverse of mtmElected. */
  washSaleProtectionEnabled: boolean;
  /** Symbols with a losing SELL or manual_close within the last 31 days. Refreshed each scan. */
  washSaleBlockedSymbols: Set<string>;
  /** Last refresh time for washSaleBlockedSymbols (ms epoch). */
  washSaleLastRefreshAt: number;
  /** True when account is below the PDT equity threshold ($25k) — re-evaluated every scan. */
  pdtVulnerable: boolean;
  /** Broker-reported day-trade count over the last 5 business days. Refreshed every scan. */
  pdtDayTradeCount: number;
  /** Broker-reported PDT flag — true once Alpaca has actually flagged the account. */
  pdtPatternFlagged: boolean;
}

const g = globalThis as typeof globalThis & {
  __tradingEngines?: Map<string, EngineState>;
};

function createDefaultEngine(): EngineState {
  return {
    running: false,
    halted: false,
    mode: "optimized",
    intervalId: null,
    exitCheckId: null,
    marketOpenTimeoutId: null,
    lastScanAt: null,
    scanCount: 0,
    dailyLoss: 0,
    dailyLossLimit: 0.02,
    dailyLossDate: "",
    userId: null,
    positionCount: 0,
    externalSignals: [],
    errors: [],
    brokerConnected: false,
    lastBrokerContact: null,
    consecutiveBrokerFailures: 0,
    pendingExits: new Set(),
    cooldowns: new Map(),
    environment: null,
    boot: null,
    dailyNotional: 0,
    consecutiveLosses: 0,
    recentOrderTimestamps: [],
    mtmElected: false,
    washSaleProtectionEnabled: true, // default conservative — disabled only when MTM elected
    washSaleBlockedSymbols: new Set(),
    washSaleLastRefreshAt: 0,
    pdtVulnerable: false,
    pdtDayTradeCount: 0,
    pdtPatternFlagged: false,
  };
}

/** Get the engine for a specific user, or fall back to legacy singleton behavior. */
function getEngine(userId?: string): EngineState {
  g.__tradingEngines ??= new Map();
  // If userId provided, get/create that user's engine
  if (userId) {
    if (!g.__tradingEngines.has(userId)) {
      g.__tradingEngines.set(userId, createDefaultEngine());
    }
    return g.__tradingEngines.get(userId)!;
  }
  // Legacy fallback: return first running engine or create a temp one
  for (const engine of g.__tradingEngines.values()) {
    if (engine.running) return engine;
  }
  return createDefaultEngine();
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

// #3: Sector groups for rotation weighting (covers full S&P 500) — reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * #3: Calculate sector relative strength — reserved for future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
const DEFAULT_MAX_DAILY_NOTIONAL_PCT = 1.0;       // 100% of equity / day
const DEFAULT_MAX_CONSECUTIVE_LOSSES = 5;
const ORDER_RATE_LIMIT_PER_MIN = 30;             // hard cap orders/minute per engine
const ORDER_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ACCOUNT_SWITCH_EQUITY_DROP_PCT = 0.5;       // halt if equity drops > 50% from boot snapshot
const BROKER_FAILURE_HALT_THRESHOLD = 5;          // consecutive failures → engine halt
// Phase 5: personalized live-trading protections
const WASH_SALE_WINDOW_DAYS = 31;                 // calendar days; one day past IRS 30-day rule for safety
const WASH_SALE_REFRESH_MS = 5 * 60 * 1000;       // re-query trader_trades at most every 5 min
const PDT_EQUITY_THRESHOLD = 25_000;              // account < this AND not margin → PDT-vulnerable
const PDT_DAYTRADE_BUY_BLOCK = 3;                 // block new buys when count reaches this (4 = flag)
const BARS_FOR_ANALYSIS = 90;
const MAX_ERROR_LOG = 50;

interface RiskLimits {
  maxPositions: number;
  positionPct: number;
  dailyLossPct: number;
  maxPositionSize: number;
  maxExposure: number;
  maxDailyNotionalPct: number;
  maxConsecutiveLosses: number;
}

async function loadRiskLimits(userId: string): Promise<RiskLimits> {
  const defaults: RiskLimits = {
    maxPositions: DEFAULT_MAX_POSITIONS,
    positionPct: DEFAULT_POSITION_PCT,
    dailyLossPct: DEFAULT_DAILY_LOSS_PCT,
    maxPositionSize: 100,
    maxExposure: 0, // 0 = use account equity as cap (set below)
    maxDailyNotionalPct: DEFAULT_MAX_DAILY_NOTIONAL_PCT,
    maxConsecutiveLosses: DEFAULT_MAX_CONSECUTIVE_LOSSES,
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
      const maxDailyNotionalPct =
        profile.maxDailyNotionalPct != null ? profile.maxDailyNotionalPct : defaults.maxDailyNotionalPct;
      const maxConsecutiveLosses =
        profile.maxConsecutiveLosses != null ? profile.maxConsecutiveLosses : defaults.maxConsecutiveLosses;

      // maxExposure: use multiplier if set, else fallback to accountSize × drawdown, else 0 (engine uses 1.5× equity default)
      let maxExposure = defaults.maxExposure;
      if (profile.maxExposureMultiplier != null && profile.maxExposureMultiplier > 0) {
        // Multiplier is applied at runtime against live equity (stored as multiplier, e.g. 2.0 = 2× equity)
        maxExposure = -profile.maxExposureMultiplier; // Negative signals "use multiplier" to the engine
      } else if (profile.accountSize != null && profile.maxDrawdownPct != null) {
        maxExposure = (profile.accountSize * profile.maxDrawdownPct) / 100;
      }

      return {
        maxPositions,
        positionPct,
        dailyLossPct,
        maxPositionSize,
        maxExposure,
        maxDailyNotionalPct,
        maxConsecutiveLosses,
      };
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load risk profile, using defaults");
  }

  return defaults;
}

// ─── Live-Trading Safeguards (Phase 3) ───────────────────────────────────────

/**
 * Gate every BUY before it's submitted. Checks (in order, cheapest first):
 *  - wash-sale: symbol has a losing exit within 31 days AND MTM not elected
 *  - PDT: account < $25k AND daytrade count ≥ 3 (one shy of the PDT-flag threshold)
 *  - daily notional cap (gross BUY notional vs equity)
 *  - global order rate limit (sliding 60s window, 30 orders max)
 *
 * Returns { ok: false, reason } if blocked, { ok: true } otherwise.
 * Caller must call recordOrderPlacement() AFTER a successful placeOrder.
 */
function canPlaceBuyOrder(
  engine: EngineState,
  symbol: string,
  notionalUsd: number,
  riskLimits: RiskLimits,
  bootEquity: number
): { ok: true } | { ok: false; reason: string; details: Record<string, unknown> } {
  // Wash-sale: block re-entry on symbols with a losing close in the last 31 days
  if (engine.washSaleProtectionEnabled && engine.washSaleBlockedSymbols.has(symbol)) {
    return {
      ok: false,
      reason: "wash_sale_protection",
      details: {
        symbol,
        windowDays: WASH_SALE_WINDOW_DAYS,
        mtmElected: engine.mtmElected,
      },
    };
  }

  // PDT: when account is vulnerable AND day-trade count is at the danger line
  if (engine.pdtVulnerable && engine.pdtDayTradeCount >= PDT_DAYTRADE_BUY_BLOCK) {
    return {
      ok: false,
      reason: "pdt_protection",
      details: {
        daytradeCount: engine.pdtDayTradeCount,
        threshold: PDT_DAYTRADE_BUY_BLOCK,
        patternFlagged: engine.pdtPatternFlagged,
      },
    };
  }

  // Notional cap — only blocks BUYs (sells/exits always allowed)
  const notionalCap = bootEquity * riskLimits.maxDailyNotionalPct;
  if (notionalCap > 0 && engine.dailyNotional + notionalUsd > notionalCap) {
    return {
      ok: false,
      reason: "daily_notional_cap_exceeded",
      details: {
        attemptedNotional: notionalUsd,
        dailyNotionalSoFar: engine.dailyNotional,
        cap: notionalCap,
        capPctOfEquity: riskLimits.maxDailyNotionalPct,
      },
    };
  }

  // Rate limit — prune timestamps outside the 60s window then check count
  const now = Date.now();
  const windowStart = now - ORDER_RATE_LIMIT_WINDOW_MS;
  engine.recentOrderTimestamps = engine.recentOrderTimestamps.filter((t) => t >= windowStart);
  if (engine.recentOrderTimestamps.length >= ORDER_RATE_LIMIT_PER_MIN) {
    return {
      ok: false,
      reason: "order_rate_limit_exceeded",
      details: {
        ordersInWindow: engine.recentOrderTimestamps.length,
        windowMs: ORDER_RATE_LIMIT_WINDOW_MS,
        cap: ORDER_RATE_LIMIT_PER_MIN,
      },
    };
  }

  return { ok: true };
}

/** Record that an order was placed — updates rate limit window + daily notional (BUYs only). */
function recordOrderPlacement(engine: EngineState, side: "buy" | "sell", notionalUsd: number): void {
  engine.recentOrderTimestamps.push(Date.now());
  if (side === "buy" && notionalUsd > 0) {
    engine.dailyNotional += notionalUsd;
  }
}

/**
 * Update consecutive-loss counter from a closed-trade P&L. Resets on any winner.
 * Returns true if the engine should auto-halt (consecutive losses ≥ threshold).
 */
function recordTradeResult(engine: EngineState, pnl: number, threshold: number): boolean {
  if (pnl < 0) {
    engine.consecutiveLosses += 1;
  } else if (pnl > 0) {
    engine.consecutiveLosses = 0;
  }
  // pnl === 0 (rare — exact even close) doesn't move the counter either way
  return engine.consecutiveLosses >= threshold;
}

/**
 * Halt the engine due to a safeguard tripping. Called from the scan loop in
 * response to broker disconnect, account switch, equity collapse, or
 * consecutive-loss threshold. Engine.halted = true blocks new orders; the
 * user must explicitly Stop+Start to clear.
 */
function tripSafeguardHalt(engine: EngineState, reason: string, details: Record<string, unknown>): void {
  if (engine.halted) return;
  engine.halted = true;
  log.error({ userId: engine.userId, reason, ...details }, `Engine auto-halted: ${reason}`);
  pushError(engine, `Auto-halted: ${reason}`);
  // Fire-and-forget audit (no request context for engine-internal events)
  void writeAudit({
    actor: { userId: engine.userId, email: null, role: null },
    action: AuditAction.ENGINE_HALTED,
    resourceType: "engine",
    resourceId: engine.userId,
    metadata: { reason, automatic: true, ...details },
  });
}

/** Live-trading is gated behind ALLOW_LIVE_TRADING=1. Returns true when live is permitted. */
export function isLiveTradingAllowed(): boolean {
  return process.env.ALLOW_LIVE_TRADING === "1";
}

/**
 * Phase 8 — naked-position prevention at the broker layer.
 *
 * Every engine-initiated order routes through this helper. It tags the order
 * with Alpaca's position_intent field:
 *   - "buy_to_open"   for buys → Alpaca rejects if it would close a short
 *   - "sell_to_close" for sells → Alpaca rejects if there's no long position
 *
 * The engine is strictly long-only. If the broker disagrees with our
 * in-memory state (stale positionMap, race with a broker-side stop, manual
 * trade outside the engine), Alpaca rejects the order rather than silently
 * creating a short.
 *
 * Caller does not need to set positionIntent on params — this helper applies
 * the long-only default automatically. To opt out (e.g., admin flatten where
 * intent is implicit, or testing), call client.placeOrder() directly.
 */
/**
 * Phase 10 — market-close guard on market orders.
 *
 * Each scan loop checks `isMarketOpen()` at its top, but the loop body
 * can take 5-10+ minutes (slow broker API, swap iteration). The
 * 2026-05-11 TGT incident was caused by a tactical-smart scan that
 * started before 4:00 PM ET and was still firing market sells at
 * 4:10 PM and 4:51 PM — outside market hours.
 *
 * After-hours market orders queue and execute at the NEXT session's open
 * price (unpredictable). Limit and stop orders are fine to queue —
 * limits enforce price discipline; stops are GTC and only fire when
 * triggered.
 *
 * Throwing here propagates up through the engine's existing per-order
 * try/catch, which logs the failure and continues to the next iteration.
 */
export class MarketClosedError extends Error {
  constructor(public readonly symbol: string, public readonly side: string) {
    super(`Market is closed — refusing to submit market order for ${side} ${symbol}`);
    this.name = "MarketClosedError";
  }
}

async function placeEngineOrder(
  client: BrokerClient,
  params: Omit<PlaceOrderParams, "positionIntent">
): Promise<BrokerOrder> {
  // Phase 10 — refuse market orders when market is closed. Limit/stop orders
  // are allowed (limits expire at close with TIF=day; stops are GTC).
  if (params.type === "market" && !isMarketOpen()) {
    log.warn(
      { symbol: params.symbol, side: params.side, type: params.type, qty: params.qty },
      "Market order refused — market is closed (Phase 10 guard)"
    );
    void writeAudit({
      actor: { userId: null, email: null, role: null },
      action: AuditAction.ORDER_REJECTED,
      resourceType: "order",
      metadata: {
        symbol: params.symbol,
        side: params.side,
        qty: params.qty,
        type: params.type,
        reason: "market_closed",
        source: "engine_market_close_guard",
      },
    });
    throw new MarketClosedError(params.symbol, params.side);
  }

  return client.placeOrder({
    ...params,
    positionIntent: params.side === "buy" ? "buy_to_open" : "sell_to_close",
  });
}

// ─── Phase 5: MTM / Wash-Sale / PDT helpers ───────────────────────────────────

/**
 * Read the user's self-attested §475(f) MTM election from user_tax_status.
 * Returns false when the row doesn't exist or the field isn't set — the safer
 * default (engine assumes wash-sale rule applies and enables protection).
 */
async function loadTaxStatus(userId: string): Promise<{ mtmElected: boolean }> {
  try {
    const [row] = await db
      .select({ hasTraderTaxStatus: userTaxStatus.hasTraderTaxStatus })
      .from(userTaxStatus)
      .where(eq(userTaxStatus.userId, userId))
      .limit(1);
    return { mtmElected: row?.hasTraderTaxStatus === true };
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", userId },
      "Failed to load tax status — defaulting to MTM=false (wash-sale protection ON)"
    );
    return { mtmElected: false };
  }
}

/**
 * Query trader_trades for symbols with a losing exit in the last 31 days.
 * "Exit" = action IN ('SELL', 'manual_close') AND pnl < 0.
 *
 * Single batched query — caller checks the resulting Set in O(1) per buy.
 * Refreshed at most once per WASH_SALE_REFRESH_MS to avoid hitting the DB
 * on every scan.
 */
async function refreshWashSaleBlockedSymbols(userId: string): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - WASH_SALE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .selectDistinct({ symbol: traderTrades.symbol })
      .from(traderTrades)
      .where(
        and(
          eq(traderTrades.userId, userId),
          inArray(traderTrades.action, ["SELL", "manual_close"]),
          gt(traderTrades.createdAt, cutoff),
          lt(traderTrades.pnl, 0)
        )
      );
    return new Set(rows.map((r) => r.symbol));
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", userId },
      "Failed to refresh wash-sale blocked symbols — keeping previous set"
    );
    // Defensive: empty set on first-time failure rather than throwing
    return new Set();
  }
}

/** Refresh `engine.washSaleBlockedSymbols` if the cache is stale or empty. No-op when MTM elected. */
async function maybeRefreshWashSaleSet(engine: EngineState): Promise<void> {
  if (!engine.washSaleProtectionEnabled || !engine.userId) return;
  const age = Date.now() - engine.washSaleLastRefreshAt;
  if (engine.washSaleLastRefreshAt > 0 && age < WASH_SALE_REFRESH_MS) return;
  engine.washSaleBlockedSymbols = await refreshWashSaleBlockedSymbols(engine.userId);
  engine.washSaleLastRefreshAt = Date.now();
}

/** Pure PDT-vulnerability check from a broker account snapshot. */
function isPdtVulnerable(account: BrokerAccount): boolean {
  return account.equity < PDT_EQUITY_THRESHOLD;
}

/**
 * Re-evaluate PDT state from a live account snapshot. Called every scan after
 * a successful getAccount(). Detects transitions (was not vulnerable → became
 * vulnerable) and emits one informational audit event per transition so the
 * UI banner can flip without spamming the log.
 */
function evaluatePdtState(engine: EngineState, account: BrokerAccount): void {
  const wasVulnerable = engine.pdtVulnerable;
  const nowVulnerable = isPdtVulnerable(account);
  engine.pdtVulnerable = nowVulnerable;
  engine.pdtDayTradeCount = account.daytradeCount ?? 0;
  engine.pdtPatternFlagged = account.patternDayTrader === true;

  if (!wasVulnerable && nowVulnerable) {
    log.warn(
      {
        userId: engine.userId,
        equity: account.equity,
        threshold: PDT_EQUITY_THRESHOLD,
        daytradeCount: engine.pdtDayTradeCount,
      },
      "Engine entered PDT-vulnerable state (equity dropped below threshold mid-session)"
    );
    void writeAudit({
      actor: { userId: engine.userId, email: null, role: null },
      action: AuditAction.ENGINE_PDT_VULNERABLE,
      resourceType: "engine",
      resourceId: engine.userId,
      metadata: {
        equity: account.equity,
        threshold: PDT_EQUITY_THRESHOLD,
        daytradeCount: engine.pdtDayTradeCount,
        patternFlagged: engine.pdtPatternFlagged,
        mode: engine.mode,
      },
    });
  }
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

export function isMarketOpen(): boolean {
  const now = getETDate();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeMinutes = hours * 60 + minutes;

  // 9:30 AM = 570, 4:00 PM = 960
  return timeMinutes >= 570 && timeMinutes < 960;
}

/**
 * Returns milliseconds until the next market open (9:30 AM ET on a weekday).
 * Returns 0 if the market is currently open.
 */
function msUntilMarketOpen(): number {
  const now = getETDate();
  const day = now.getDay();
  const timeMinutes = now.getHours() * 60 + now.getMinutes();

  // Market is currently open
  if (day >= 1 && day <= 5 && timeMinutes >= 570 && timeMinutes < 960) return 0;

  // Find the next weekday 9:30 AM ET
  const target = new Date(now);
  target.setHours(9, 30, 0, 0);

  if (day >= 1 && day <= 5 && timeMinutes < 570) {
    // Today before open — target is today 9:30
  } else if (day === 5 && timeMinutes >= 960) {
    // Friday after close — next Monday
    target.setDate(target.getDate() + 3);
  } else if (day === 6) {
    // Saturday — next Monday
    target.setDate(target.getDate() + 2);
  } else if (day === 0) {
    // Sunday — next Monday
    target.setDate(target.getDate() + 1);
  } else {
    // Weekday after close — tomorrow
    target.setDate(target.getDate() + 1);
  }

  return Math.max(0, target.getTime() - now.getTime());
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
): Promise<{ client: BrokerClient; connectionId: string; environment: "paper" | "live" } | null> {
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

  // Prefer paper environment connections; live requires ALLOW_LIVE_TRADING=1.
  const conn =
    connections.find((c) => c.environment === "paper") ?? connections[0];

  if (conn.environment === "live" && !isLiveTradingAllowed()) {
    log.error(
      { userId, connectionId: conn.id },
      "Refusing to start engine on LIVE broker — set ALLOW_LIVE_TRADING=1 to unlock"
    );
    void writeAudit({
      actor: { userId, email: null, role: null },
      action: AuditAction.ENGINE_LIVE_BLOCKED,
      resourceType: "broker_connection",
      resourceId: conn.id,
      metadata: { reason: "ALLOW_LIVE_TRADING_not_set", broker: conn.broker },
    });
    return null;
  }

  if (conn.environment === "live") {
    log.warn(
      { userId, connectionId: conn.id, broker: conn.broker },
      "Engine starting against LIVE broker connection — real money at risk"
    );
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(conn.apiKey);
    apiSecret = decrypt(conn.apiSecret);
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", connectionId: conn.id },
      "Failed to decrypt broker credentials — ENCRYPTION_KEY rotated or row corrupted; user must re-add connection"
    );
    return null;
  }

  const client = createBrokerClient(conn.broker, apiKey, apiSecret, conn.environment);

  return { client, connectionId: conn.id, environment: conn.environment as "paper" | "live" };
}

// ─── Latest Optimizer Results ────────────────────────────────────────────────

// Cache to avoid hitting DB on every symbol every scan
let _optimizedParamsCache: { params: StrategyParams; signalParams: SignalParams | null; takeProfitAtrMult: number | null; fetchedAt: number } | null = null;
const OPTIMIZER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLatestOptimizedParams(): Promise<StrategyParams | null> {
  if (_optimizedParamsCache && Date.now() - _optimizedParamsCache.fetchedAt < OPTIMIZER_CACHE_TTL) {
    return _optimizedParamsCache.params;
  }
  await _loadOptimizedParams();
  return _optimizedParamsCache?.params ?? null;
}

/** Get ATR multiplier for adaptive take profit, or null for fixed TP */
async function getOptimizedTpAtrMult(): Promise<number | null> {
  if (_optimizedParamsCache && Date.now() - _optimizedParamsCache.fetchedAt < OPTIMIZER_CACHE_TTL) {
    return _optimizedParamsCache.takeProfitAtrMult;
  }
  await _loadOptimizedParams();
  return _optimizedParamsCache?.takeProfitAtrMult ?? null;
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
    // Prefer the explicitly saved "active" run; fall back to latest completed
    const [activeRun] = await db
      .select({ bestParams: optimizationRuns.bestParams, bestTestReturn: optimizationRuns.bestTestReturn })
      .from(optimizationRuns)
      .where(and(eq(optimizationRuns.status, "complete"), eq(optimizationRuns.isActive, true)))
      .limit(1);
    const [run] = activeRun ? [activeRun] : await db
      .select({ bestParams: optimizationRuns.bestParams, bestTestReturn: optimizationRuns.bestTestReturn })
      .from(optimizationRuns)
      .where(eq(optimizationRuns.status, "complete"))
      .orderBy(desc(optimizationRuns.completedAt))
      .limit(1);

    if (!run?.bestParams) return;

    const p = run.bestParams as Record<string, number>;
    if (p.stopLossPct == null) return;

    // New runs have takeProfitAtrMult; old runs have takeProfitPct
    const takeProfitAtrMult = p.takeProfitAtrMult ?? null;
    const params: StrategyParams = {
      stopLossPct: p.stopLossPct,
      // For old runs: use stored takeProfitPct. For new runs: use a high fallback
      // since the engine computes ATR-based TP per-position at entry time.
      takeProfitPct: p.takeProfitPct ?? 5.0,
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

    _optimizedParamsCache = { params, signalParams, takeProfitAtrMult, fetchedAt: Date.now() };
    log.info({ params, signalParams, takeProfitAtrMult, testReturn: run.bestTestReturn }, "Loaded latest optimizer params");
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

  const engine = getEngine(userId);
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

async function runExitCheck(engineUserId?: string): Promise<void> {
  const engine = getEngine(engineUserId);
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;

  const resolved = await resolveBrokerClient(engine.userId);
  if (!resolved) return;

  const { client } = resolved;
  const positionMap = getPositionMap(engine?.userId ?? engineUserId);
  if (positionMap.size === 0) return;

  const provider = getMarketDataProvider();

  for (const [symbol, pos] of positionMap) {
    try {
      // Skip if the main scan has an exit in flight for this symbol — prevents double-sell.
      if (engine.pendingExits.has(symbol)) continue;

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

      // Take profit (uses stored price — ATR-based in optimized mode, fixed % in others)
      if (!exitReason && currentPrice >= pos.takeProfit) {
        exitReason = "take_profit";
      }

      if (exitReason) {
        log.info({ symbol, exitReason, currentPrice, entryPrice: pos.entryPrice }, "Exit triggered by 1-min check");
        engine.pendingExits.add(symbol);
        try {
          await cancelPendingOrdersForSymbol(client, symbol);
          const exitOrder = await placeEngineOrder(client, { symbol, qty: String(pos.qty), side: "sell", type: "market", timeInForce: "day" });
          recordOrderPlacement(engine, "sell", 0);
          const pnl = (currentPrice - pos.entryPrice) * pos.qty;
          engine.dailyLoss += pnl < 0 ? pnl : 0;
          // Phase 3: track consecutive losses; halt if threshold tripped.
          {
            const riskLimitsForLoss = await loadRiskLimits(engine.userId!);
            if (recordTradeResult(engine, pnl, riskLimitsForLoss.maxConsecutiveLosses)) {
              tripSafeguardHalt(engine, "consecutive_losses", {
                consecutiveLosses: engine.consecutiveLosses,
                threshold: riskLimitsForLoss.maxConsecutiveLosses,
              });
            }
          }

          await logTrade(symbol, exitReason, "SELL", pos.qty, currentPrice, "PENDING", pnl, exitReason, exitOrder.id, null, engine.userId);
          positionMap.delete(symbol);
          engine.positionCount = positionMap.size;

          // Record in daily PnL — main scan only runs every 15 min, so without this
          // a stop_loss / trailing_stop hit before the next scan would never appear
          // in the Trades Today / Realized Today counters.
          await upsertDailyPnl(getETDateString(), pnl, null, 1, engine.halted, undefined, engine.userId);
        } catch (err) {
          log.error({ symbol, err: err instanceof Error ? err.message : "unknown" }, "Exit order failed");
        } finally {
          engine.pendingExits.delete(symbol);
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
  actedOn: boolean,
  userId?: string | null
): Promise<string | null> {
  const engine = userId ? getEngine(userId) : getEngine();
  try {
    const [row] = await db.insert(traderSignals).values({
      userId: engine.userId,
      symbol,
      signal,
      price,
      volume,
      indicators,
      actedOn,
      traderTimestamp: new Date(),
    }).returning({ id: traderSignals.id });
    return row?.id ?? null;
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", symbol },
      "Failed to log signal"
    );
    return null;
  }
}

/** Cancel all pending orders for a symbol before placing a market sell */
async function cancelPendingOrdersForSymbol(
  client: import("./brokers").BrokerClient,
  symbol: string
): Promise<void> {
  if (!client.cancelOrder) return;
  try {
    const orders = await client.getOrders(100);
    const pending = orders.filter(
      (o) =>
        o.symbol === symbol &&
        ["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)
    );
    for (const o of pending) {
      try {
        await client.cancelOrder(o.id);
        log.info({ symbol, orderId: o.id, type: o.type }, "Cancelled pending order before exit");
      } catch {
        // Best effort — order may have already filled/expired
      }
    }
    if (pending.length > 0) {
      // Brief pause for broker to release held shares
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // If order fetch fails, proceed — the sell may still work
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
  notes: string | null,
  brokerOrderId: string | null = null,
  signalId: string | null = null,
  userId?: string | null
): Promise<void> {
  const engine = userId ? getEngine(userId) : getEngine();
  try {
    await db.insert(traderTrades).values({
      userId: engine.userId,
      brokerOrderId,
      signalId,
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

async function updateHeartbeat(watchlist: string[], userId?: string | null): Promise<void> {
  const engine = userId ? getEngine(userId) : getEngine();
  const modeStr = `paper:${engine.mode}`; // persist engine mode for auto-restart
  try {
    const rows = engine.userId
      ? await db.select().from(traderStatus).where(eq(traderStatus.userId, engine.userId))
      : await db.select().from(traderStatus);
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
        userId: engine.userId,
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
  unrealizedPnl: number | null,
  tradesCountDelta: number,
  halted: boolean,
  haltReason?: string,
  userId?: string | null
): Promise<void> {
  const engine = userId ? getEngine(userId) : getEngine();
  const effectiveUserId = userId ?? engine.userId;
  try {
    const conditions = [eq(traderDailyPnl.date, date)];
    if (effectiveUserId) conditions.push(eq(traderDailyPnl.userId, effectiveUserId));

    const existing = await db
      .select()
      .from(traderDailyPnl)
      .where(and(...conditions));

    if (existing.length > 0) {
      const row = existing[0];
      await db
        .update(traderDailyPnl)
        .set({
          realizedPnl: (row.realizedPnl ?? 0) + realizedDelta,
          // null = preserve existing (used by per-trade updates that don't have fresh unrealized snapshot)
          ...(unrealizedPnl !== null ? { unrealizedPnl } : {}),
          tradesCount: (row.tradesCount ?? 0) + tradesCountDelta,
          halted,
          ...(haltReason ? { haltReason } : {}),
          engineMode: engine.mode,
        })
        .where(eq(traderDailyPnl.id, row.id));
    } else {
      await db.insert(traderDailyPnl).values({
        userId: effectiveUserId,
        date,
        realizedPnl: realizedDelta,
        unrealizedPnl: unrealizedPnl ?? 0,
        tradesCount: tradesCountDelta,
        halted,
        haltReason: haltReason ?? null,
        engineMode: engine.mode,
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
  __enginePositionMaps?: Map<string, Map<string, TrackedPosition>>;
};

function getPositionMap(userId?: string): Map<string, TrackedPosition> {
  g2.__enginePositionMaps ??= new Map();
  const key = userId ?? "_default";
  if (!g2.__enginePositionMaps.has(key)) {
    g2.__enginePositionMaps.set(key, new Map());
  }
  return g2.__enginePositionMaps.get(key)!;
}

// ─── Broker Position Cache ──────────────────────────────────────────────────

interface CachedBrokerPositions {
  positions: { symbol: string; qty: number; avgEntryPrice: number; currentPrice: number; unrealizedPnl: number; marketValue: number }[];
  fetchedAt: Date;
}

const g3 = globalThis as typeof globalThis & {
  __brokerPositionCache?: Map<string, CachedBrokerPositions>;
};

function setBrokerPositionCache(userId: string, positions: CachedBrokerPositions["positions"]): void {
  g3.__brokerPositionCache ??= new Map();
  g3.__brokerPositionCache.set(userId, { positions, fetchedAt: new Date() });
}

/** Get cached broker positions for a user. Returns null if no cache exists. */
export function getBrokerPositionCache(userId: string): CachedBrokerPositions | null {
  return g3.__brokerPositionCache?.get(userId) ?? null;
}

// ─── Broker Position Sync ───────────────────────────────────────────────────

/**
 * Sync the in-memory positionMap with the broker's actual positions.
 * - Removes positions that no longer exist on the broker (manual sells, external closures)
 * - Adds positions that exist on the broker but not in the map (manual buys, fills between scans)
 * - Updates qty/currentPrice for existing positions
 * - No DB writes — broker is the source of truth
 */
async function syncPositionMapFromBroker(
  brokerPositions: { symbol: string; qty: number; avgEntryPrice: number; currentPrice: number }[],
  positionMap: Map<string, TrackedPosition>,
  userId: string,
  client?: BrokerClient
): Promise<void> {
  // Engine is long-only. If a short shows up on the broker (manual order, external tool),
  // ignore it entirely — long-only stop/exit logic is wrong-direction for shorts.
  const longBrokerPositions = brokerPositions.filter(bp => {
    if (bp.qty <= 0) {
      log.debug({ symbol: bp.symbol, qty: bp.qty, userId }, "Short/zero broker position ignored (engine is long-only)");
      return false;
    }
    return true;
  });

  const brokerSymbols = new Set(longBrokerPositions.map(p => p.symbol));

  // Remove positions that no longer exist on broker (or flipped to short).
  // Phase 7 audits the disappearance; Phase 7.5 calls
  // reconcileBrokerSideExit to query the broker for the actual fill and INSERT
  // a trader_trades row so realized P&L stays correct without manual cleanup.
  for (const [symbol, pos] of positionMap) {
    if (!brokerSymbols.has(symbol)) {
      log.info({ symbol, userId, expectedQty: pos.qty, entryPrice: pos.entryPrice }, "Position no longer on broker — removing (likely broker-side stop fired)");
      void writeAudit({
        actor: { userId, email: null, role: null },
        action: AuditAction.ENGINE_POSITION_DISAPPEARED,
        resourceType: "position",
        resourceId: symbol,
        metadata: {
          symbol,
          expectedQty: pos.qty,
          entryPrice: pos.entryPrice,
          peakPrice: pos.peakPrice,
          likelyCause: "broker_side_stop_fired",
        },
      });
      // Phase 7.5 — auto-reconcile broker-side exits into trader_trades.
      // Best-effort: failure logs + continues so a transient broker hiccup
      // doesn't block position cleanup. Idempotent via the
      // (user_id, broker_order_id) unique index — re-running can't double-log.
      if (client) {
        void reconcileBrokerSideExit(client, symbol, pos, userId);
      }
      positionMap.delete(symbol);
    }
  }

  // Add/update positions from broker
  for (const bp of longBrokerPositions) {
    const existing = positionMap.get(bp.symbol);
    if (existing) {
      // Update qty and currentPrice if broker differs
      if (existing.qty !== bp.qty) {
        log.info({ symbol: bp.symbol, oldQty: existing.qty, newQty: bp.qty }, "Position qty changed on broker");
        existing.qty = bp.qty;
      }
      // Update peak price tracking
      existing.peakPrice = Math.max(existing.peakPrice, bp.currentPrice);
    } else {
      // New position discovered on broker — add with conservative defaults
      const strategy = await resolveStrategy(userId, bp.symbol);
      positionMap.set(bp.symbol, {
        symbol: bp.symbol,
        qty: bp.qty,
        entryPrice: bp.avgEntryPrice,
        peakPrice: Math.max(bp.currentPrice, bp.avgEntryPrice),
        stopLoss: bp.avgEntryPrice * (1 - strategy.stopLossPct),
        takeProfit: bp.avgEntryPrice * (1 + strategy.takeProfitPct),
        trailingStopPct: strategy.trailingStopPct,
        entryDate: new Date(),
        holdPeriod: strategy.holdPeriod,
      });
      log.info({ symbol: bp.symbol, qty: bp.qty, entry: bp.avgEntryPrice }, "New position discovered on broker — tracking");
    }
  }
}

/**
 * Phase 7.5 — Broker-side exit reconciliation.
 *
 * When a position vanishes from the broker without engine action (broker-side
 * stop fired, manual sell, etc.), the engine previously never logged the
 * exit to trader_trades. Realized P&L would silently understate losses.
 *
 * This helper, called from syncPositionMapFromBroker right before a position
 * is removed, queries Alpaca for recent closed orders matching the symbol +
 * qty, finds the most recent SELL fill in the last hour, computes P&L from
 * the in-memory entryPrice we still have, and inserts a trader_trades row.
 *
 * Idempotent — relies on the (user_id, broker_order_id) unique index in
 * trader_trades. If the row already exists (engine logged it earlier or a
 * concurrent sync raced us), the INSERT silently no-ops.
 *
 * Never throws — failures are logged but don't propagate, so a transient
 * broker hiccup doesn't block positionMap cleanup.
 */
async function reconcileBrokerSideExit(
  client: BrokerClient,
  symbol: string,
  expectedPos: TrackedPosition,
  userId: string
): Promise<void> {
  try {
    const closedOrders = await client.getOrders(50, "closed");
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Find the most recent filled SELL for this symbol that matches qty and
    // filled within the last hour. We match on qty because a position can
    // have multiple historical sells across days; we want only the one that
    // just closed our tracked position.
    const candidate = closedOrders
      .filter((o) =>
        o.symbol === symbol &&
        o.side === "sell" &&
        o.status === "filled" &&
        Number(o.filledQty) === expectedPos.qty &&
        o.filledAt &&
        new Date(o.filledAt).getTime() > oneHourAgo
      )
      .sort((a, b) => new Date(b.filledAt!).getTime() - new Date(a.filledAt!).getTime())[0];

    if (!candidate) {
      log.warn(
        { symbol, userId, expectedQty: expectedPos.qty },
        "Reconciliation: position disappeared but no matching broker fill found in last hour — trader_trades not updated, manual investigation may be needed"
      );
      return;
    }

    // Idempotence check: skip if we've already logged this broker_order_id
    const existing = await db
      .select({ id: traderTrades.id })
      .from(traderTrades)
      .where(and(eq(traderTrades.userId, userId), eq(traderTrades.brokerOrderId, candidate.id)))
      .limit(1);

    if (existing.length > 0) {
      log.debug({ symbol, brokerOrderId: candidate.id }, "Reconciliation: broker fill already logged, skipping");
      return;
    }

    const fillPrice = candidate.filledPrice ?? 0;
    if (fillPrice === 0) {
      log.warn({ symbol, brokerOrderId: candidate.id }, "Reconciliation: filled order missing filledPrice — cannot compute P&L");
      return;
    }

    const pnl = (fillPrice - expectedPos.entryPrice) * expectedPos.qty;
    // Map order type to a useful signal name for the trader_trades log
    const signal =
      candidate.type === "stop" || candidate.type === "stop_limit"
        ? "trailing_stop_hit"
        : "broker_side_exit";

    await db.insert(traderTrades).values({
      userId,
      brokerOrderId: candidate.id,
      symbol,
      signal,
      action: "SELL",
      quantity: expectedPos.qty,
      orderType: candidate.type || "stop",
      stopPrice: candidate.stopPrice ? parseFloat(candidate.stopPrice) : null,
      fillPrice,
      fillTime: new Date(candidate.filledAt!),
      status: "FILLED",
      pnl,
      notes: `Auto-reconciled: broker-side ${candidate.type || "exit"} fired at $${fillPrice.toFixed(4)} (entry $${expectedPos.entryPrice.toFixed(2)}). Engine missed logging — Phase 7.5 reconciliation inserted this row.`,
      traderTimestamp: new Date(candidate.filledAt!),
    });

    log.info(
      { symbol, userId, fillPrice, pnl: pnl.toFixed(2), brokerOrderId: candidate.id, signal },
      "Reconciled broker-side exit into trader_trades"
    );
  } catch (err) {
    // Unique-constraint violation = idempotency race (someone else just logged it). Safe to swallow.
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg.includes("trader_trades_user_broker_order_idx") || msg.includes("duplicate key")) {
      log.debug({ symbol, err: msg }, "Reconciliation: trade already logged (race)");
      return;
    }
    log.error({ symbol, userId, err: msg }, "Reconciliation failed — trader_trades not updated");
  }
}

/**
 * Phase 11 — trade-status reconciliation.
 *
 * Engine writes logTrade with status="PENDING" right after placeOrder accepts.
 * That only means Alpaca accepted the order, NOT that it filled. This reconciler
 * runs at the top of each scan to update PENDING trader_trades rows with real
 * broker state:
 *
 *   - filled    → status="FILLED", fillPrice from broker, pnl corrected via delta math
 *   - canceled  → status="CANCELED", pnl=null
 *   - rejected  → status="REJECTED", pnl=null
 *   - expired   → status="EXPIRED", pnl=null
 *   - partial   → status="PARTIAL_FILLED", fillPrice from broker, pnl scaled to filled qty
 *
 * P&L correction (no schema change needed):
 *   placeholder_pnl = (placeholder_fill - entry) × qty   [recorded at submission]
 *   actual_pnl      = placeholder_pnl + (actual_fill - placeholder_fill) × qty
 *
 * Idempotent — re-running on the same row just no-ops (status already FILLED etc).
 * Never throws — per-row failures log and continue.
 */
async function reconcilePendingTrades(client: BrokerClient, userId: string): Promise<void> {
  try {
    // Find PENDING rows from the last 24h that have a broker_order_id to look up
    const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
    const pending = await db
      .select()
      .from(traderTrades)
      .where(
        and(
          eq(traderTrades.userId, userId),
          eq(traderTrades.status, "PENDING"),
          isNotNull(traderTrades.brokerOrderId),
          gt(traderTrades.createdAt, new Date(sinceMs))
        )
      )
      .limit(200);

    if (pending.length === 0) return;

    // One batch fetch of broker orders (both open + closed) to map id → state.
    // getOrders("all") returns mixed; we read status field per row.
    const recent = await client.getOrders(200);
    const byId = new Map(recent.map((o) => [o.id, o]));

    let updated = 0;
    for (const row of pending) {
      if (!row.brokerOrderId) continue;
      const brokerOrder = byId.get(row.brokerOrderId);
      if (!brokerOrder) {
        // Not in recent 200 — either too old or got purged. Leave PENDING; next
        // scan may find it. After 24h the row drops out of our query anyway.
        continue;
      }

      const bs = brokerOrder.status;
      // Still pending → leave as-is
      if (["new", "accepted", "pending_new", "held", "accepted_for_bidding"].includes(bs)) continue;

      // Resolved states → compute update
      let newStatus: string;
      let newFillPrice: number | null = null;
      let newFillTime: Date | null = null;
      let newPnl: number | null = row.pnl;

      if (bs === "filled") {
        newStatus = "FILLED";
        newFillPrice = brokerOrder.filledPrice ?? row.fillPrice;
        newFillTime = brokerOrder.filledAt ? new Date(brokerOrder.filledAt) : new Date();
        // P&L correction via delta math (no schema change). Only for SELLs with placeholder pnl.
        if (
          row.action === "SELL" &&
          row.pnl !== null &&
          row.fillPrice !== null &&
          newFillPrice !== null
        ) {
          const delta = (newFillPrice - row.fillPrice) * row.quantity;
          newPnl = row.pnl + delta;
        }
      } else if (bs === "partially_filled") {
        newStatus = "PARTIAL_FILLED";
        newFillPrice = brokerOrder.filledPrice ?? row.fillPrice;
        newFillTime = brokerOrder.filledAt ? new Date(brokerOrder.filledAt) : new Date();
        // P&L: scale to actual filled qty proportionally
        if (row.action === "SELL" && row.pnl !== null && row.fillPrice !== null && newFillPrice !== null && row.quantity > 0) {
          const filledQty = brokerOrder.filledQty;
          const deltaPerShare = newFillPrice - row.fillPrice;
          const pnlPerShare = row.pnl / row.quantity;
          newPnl = (pnlPerShare + deltaPerShare) * filledQty;
        }
      } else if (bs === "canceled" || bs === "expired") {
        newStatus = bs === "canceled" ? "CANCELED" : "EXPIRED";
        newPnl = null;
        newFillPrice = null;
      } else if (bs === "rejected") {
        newStatus = "REJECTED";
        newPnl = null;
        newFillPrice = null;
      } else {
        // Unknown status — leave for next cycle
        log.debug({ orderId: row.brokerOrderId, brokerStatus: bs }, "Unknown broker order status — skipping reconciliation");
        continue;
      }

      try {
        await db
          .update(traderTrades)
          .set({
            status: newStatus,
            ...(newFillPrice !== null ? { fillPrice: newFillPrice } : {}),
            ...(newFillTime ? { fillTime: newFillTime } : {}),
            pnl: newPnl,
          })
          .where(eq(traderTrades.id, row.id));
        updated++;
      } catch (err) {
        log.warn(
          { orderId: row.brokerOrderId, err: err instanceof Error ? err.message : "unknown" },
          "Failed to reconcile single trader_trades row"
        );
      }
    }

    if (updated > 0) {
      log.info({ userId, updated, scanned: pending.length }, "Reconciled pending trades from broker");
    }
  } catch (err) {
    log.error({ userId, err: err instanceof Error ? err.message : "unknown" }, "reconcilePendingTrades failed");
  }
}

// ─── Core Scan ───────────────────────────────────────────────────────────────

// ─── Tactical Scan: Stay invested, exit on market weakness ──────────────────

async function runTacticalScan(engineUserId?: string): Promise<void> {
  const engine = getEngine(engineUserId);
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;
  try { SCAN_UNIVERSE = await getSP500Symbols(); } catch { /* keep current */ }

  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyNotional = 0; // reset daily notional cap window in lockstep
    engine.dailyLossDate = today;
    if (engine.halted) {
      log.info({ userId: engine.userId }, "New trading day — clearing daily-loss halt");
      engine.halted = false;
      engine.errors = engine.errors.filter(e => !e.startsWith("Daily loss limit hit"));
    }
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
  const positionMap = getPositionMap(engine?.userId ?? engineUserId);

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

  let currentPositions: BrokerPosition[];
  try {
    currentPositions = await client.getPositions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg, userId: engine.userId }, "Tactical scan aborted — getPositions failed");
    pushError(engine, `Broker getPositions failed: ${msg}`);
    return;
  }
  await syncPositionMapFromBroker(currentPositions, positionMap, engine.userId!, client);
  await reconcilePendingTrades(client, engine.userId!);
  engine.positionCount = positionMap.size;

  // Pending limit buys count as "invested" — without this, a re-scan before
  // limits fill re-runs the entry loop and doubles every order.
  // Phase 7 — also track pending sells (excluding stops) for symmetric guards.
  const pendingBuySymbols = new Set<string>();
  const pendingSellSymbols = new Set<string>();
  try {
    const openOrders = await client.getOrders(100);
    for (const o of openOrders) {
      if (!["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)) continue;
      if (o.side === "buy") pendingBuySymbols.add(o.symbol);
      else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") {
        pendingSellSymbols.add(o.symbol);
      }
    }
  } catch {
    // If order fetch fails, fall back to held-only check (best effort)
  }

  const isInvested = currentPositions.length > 0 || pendingBuySymbols.size > 0;

  log.info({
    spyPrice: spyPrice.toFixed(2), smaExit: smaExit.toFixed(2), smaTrend: smaTrend.toFixed(2),
    spyRSI: spyRSI.toFixed(1), confirmedBelow, isInvested, positions: positionMap.size, pendingBuys: pendingBuySymbols.size,
  }, "Tactical scan");

  if (isInvested && confirmedBelow && spyPrice < smaExit) {
    // ── EXIT: Confirmed weakness → sell everything (simple, no graduated) ──
    log.warn("TACTICAL EXIT — SPY confirmed below exit SMA, going to cash");

    for (const pos of currentPositions) {
      if (pos.qty <= 0) continue;
      try {
        const texitOrder = await placeEngineOrder(client, { symbol: pos.symbol, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
        await logTrade(pos.symbol, "tactical_exit", "SELL", pos.qty, pos.currentPrice, "PENDING", pos.unrealizedPnl, "Tactical exit: SPY below SMA", texitOrder.id, null, engine.userId);
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

        // Phase 7 — skip if buy already pending on broker for this symbol
        if (pendingBuySymbols.has(symbol)) {
          log.info({ symbol }, "Tactical entry skipped — active buy already pending on broker");
          continue;
        }
        const limitPrice = (quote.price * 1.001).toFixed(2);
        const buyNotional = qty * parseFloat(limitPrice);
        const gate = canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity);
        if (!gate.ok) {
          log.warn({ symbol, qty, notional: buyNotional, reason: gate.reason, ...gate.details }, "Tactical BUY blocked");
          void writeAudit({
            actor: { userId: engine.userId, email: null, role: null },
            action: AuditAction.ORDER_REJECTED,
            resourceType: "order",
            metadata: { symbol, side: "buy", qty, notional: buyNotional, reason: gate.reason, source: "engine_tactical", ...gate.details },
          });
          continue;
        }
        const tentryOrder = await placeEngineOrder(client, { symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        recordOrderPlacement(engine, "buy", buyNotional);
        pendingBuySymbols.add(symbol); // Phase 7: prevent re-fire within this scan
        await logTrade(symbol, "tactical_entry", "BUY", qty, quote.price, "PENDING", null, "Tactical entry: SPY above SMA", tentryOrder.id, null, engine.userId);

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
  await upsertDailyPnl(today, 0, totalUnrealizedPnl, 0, engine.halted, undefined, engine.userId);

  // Update status
  engine.lastScanAt = new Date();
  engine.scanCount++;
  await updateHeartbeat(SCAN_UNIVERSE, engine.userId);
}

// ─── Tactical Smart: SPY trend + screener-weighted entries ──────────────────

async function runTacticalSmartScan(engineUserId?: string): Promise<void> {
  const engine = getEngine(engineUserId);
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;

  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyNotional = 0; // reset daily notional cap window in lockstep
    engine.dailyLossDate = today;
    if (engine.halted) {
      log.info({ userId: engine.userId }, "New trading day — clearing daily-loss halt");
      engine.halted = false;
      engine.errors = engine.errors.filter(e => !e.startsWith("Daily loss limit hit"));
    }
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
  const positionMap = getPositionMap(engine?.userId ?? engineUserId);

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

  let currentPositions: BrokerPosition[];
  try {
    currentPositions = await client.getPositions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg, userId: engine.userId }, "Tactical-smart scan aborted — getPositions failed");
    pushError(engine, `Broker getPositions failed: ${msg}`);
    return;
  }
  await syncPositionMapFromBroker(currentPositions, positionMap, engine.userId!, client);
  await reconcilePendingTrades(client, engine.userId!);
  engine.positionCount = positionMap.size;

  // Track for daily PnL: limit-order buys may not show in getPositions() yet
  // when the next scan runs, so without these counters the dashboard sees zero.
  let realizedPnlThisScan = 0;
  let tradesThisScan = 0;

  // Pending buy orders — symbols with an open buy that hasn't filled yet must
  // be treated as "already held" so the next scan doesn't re-buy them. This
  // is the bug that caused two CIEN buys 18 minutes apart.
  // Phase 7 — duplicate-order prevention. Track BOTH pending buys and pending
  // active sells (excluding protective stops). The swap-sell path was the TGT
  // bug source: it would re-fire the same sell every 15-min scan after market
  // close because nothing checked the broker for an already-pending sell.
  const pendingBuySymbols = new Set<string>();
  const pendingSellSymbols = new Set<string>();
  try {
    const openOrders = await client.getOrders(100);
    for (const o of openOrders) {
      if (!["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)) continue;
      if (o.side === "buy") {
        pendingBuySymbols.add(o.symbol);
      } else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") {
        // Stop orders are protective — managed by syncBrokerStops, NOT a duplicate of an active sell intent
        pendingSellSymbols.add(o.symbol);
      }
    }
  } catch {
    // If order fetch fails, fall back to held-only check (best effort)
  }

  // Pending limit buys count as "invested" — otherwise the entry branch
  // re-runs the full buy-in before any limits fill, doubling every order.
  const isInvested = currentPositions.length > 0 || pendingBuySymbols.size > 0;

  log.info({ spyPrice: spyPrice.toFixed(2), sma20: sma20.toFixed(2), sma50: sma50.toFixed(2), confirmedBelow, isInvested, positions: positionMap.size, pendingBuys: pendingBuySymbols.size, pendingSells: pendingSellSymbols.size }, "Tactical Smart scan");

  if (isInvested && confirmedBelow && spyPrice < sma20) {
    // ── EXIT: same as regular tactical ──
    log.warn("TACTICAL SMART EXIT — SPY below SMA, going to cash");
    for (const pos of currentPositions) {
      if (pos.qty <= 0) continue;
      try {
        const tsExitOrder = await placeEngineOrder(client, { symbol: pos.symbol, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
        await logTrade(pos.symbol, "tactical_exit", "SELL", pos.qty, pos.currentPrice, "PENDING", pos.unrealizedPnl, "Tactical Smart exit", tsExitOrder.id, null, engine.userId);
        realizedPnlThisScan += pos.unrealizedPnl;
        tradesThisScan++;
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

      // Phase 7 — skip if buy already pending on broker for this symbol
      if (pendingBuySymbols.has(symbol)) {
        log.info({ symbol }, "Smart entry skipped — active buy already pending on broker");
        continue;
      }
      try {
        const limitPrice = (price * 1.001).toFixed(2);
        const buyNotional = qty * parseFloat(limitPrice);
        const gate = canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity);
        if (!gate.ok) {
          log.warn({ symbol, qty, notional: buyNotional, reason: gate.reason, ...gate.details }, "Smart BUY blocked");
          void writeAudit({
            actor: { userId: engine.userId, email: null, role: null },
            action: AuditAction.ORDER_REJECTED,
            resourceType: "order",
            metadata: { symbol, side: "buy", qty, notional: buyNotional, reason: gate.reason, source: "engine_tactical_smart", ...gate.details },
          });
          continue;
        }
        const tsEntryOrder = await placeEngineOrder(client, { symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        recordOrderPlacement(engine, "buy", buyNotional);
        pendingBuySymbols.add(symbol); // Phase 7: prevent re-fire within this scan
        await logTrade(symbol, "tactical_smart_entry", "BUY", qty, price, "PENDING", null, "Smart: momentum + signal + invVol weighted", tsEntryOrder.id, null, engine.userId);
        tradesThisScan++;
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
    // Treat broker positions, in-memory positionMap, AND symbols with pending
    // buy orders as "held" — limit orders may take minutes to fill, and the
    // broker's getPositions() doesn't include them while pending.
    const heldSymbols = new Set<string>([
      ...currentPositions.map(p => p.symbol),
      ...positionMap.keys(),
      ...pendingBuySymbols,
    ]);

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
      await logSignal(c.symbol, c.signal as SignalType, c.price, 0, {}, false, engine.userId);
    }

    // 1. Swap: sell weak held positions and replace with top STRONG_BUY candidates
    let swapCount = 0;
    for (const weak of weakHeld) {
      if (candidates.length === 0) break;
      const bp = currentPositions.find(p => p.symbol === weak.symbol);
      if (!bp || bp.qty <= 0) continue;

      // Phase 7 — duplicate-order guard. If an active sell is already pending
      // for this symbol on the broker, do NOT place another. This is the
      // exact bug that caused the TGT incident on 2026-05-11: after a stop
      // fire closed the position, the engine's next scan still saw TGT in
      // its in-memory list and placed a second sell — which Alpaca accepted
      // and queued, creating a phantom short risk.
      if (pendingSellSymbols.has(weak.symbol)) {
        log.info({ symbol: weak.symbol }, "Swap-sell skipped — active sell already pending on broker");
        void writeAudit({
          actor: { userId: engine.userId, email: null, role: null },
          action: AuditAction.ORDER_REJECTED,
          resourceType: "order",
          metadata: { symbol: weak.symbol, side: "sell", qty: bp.qty, reason: "duplicate_pending_order", source: "engine_swap_sell" },
        });
        continue;
      }

      const replacement = candidates.shift()!;

      // Also guard the buy side of the swap — don't double-buy the replacement
      if (pendingBuySymbols.has(replacement.symbol)) {
        log.info({ symbol: replacement.symbol }, "Swap-buy skipped — active buy already pending on broker");
        void writeAudit({
          actor: { userId: engine.userId, email: null, role: null },
          action: AuditAction.ORDER_REJECTED,
          resourceType: "order",
          metadata: { symbol: replacement.symbol, side: "buy", reason: "duplicate_pending_order", source: "engine_swap_buy" },
        });
        continue;
      }

      // Sell the weak position
      try {
        const swapSellOrder = await placeEngineOrder(client, { symbol: weak.symbol, side: "sell", qty: String(bp.qty), type: "market", timeInForce: "day" });
        pendingSellSymbols.add(weak.symbol); // mark immediately so subsequent iterations in this scan don't re-fire
        await logTrade(weak.symbol, "tactical_smart_swap_sell", "SELL", bp.qty, bp.currentPrice, "PENDING", bp.unrealizedPnl, `Swap out: ${weak.signal}`, swapSellOrder.id, null, engine.userId);
        realizedPnlThisScan += bp.unrealizedPnl;
        tradesThisScan++;
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
        const buyNotional = qty * parseFloat(limitPrice);
        const gate = canPlaceBuyOrder(engine, replacement.symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity);
        if (!gate.ok) {
          log.warn({ symbol: replacement.symbol, qty, notional: buyNotional, reason: gate.reason, ...gate.details }, "Swap BUY blocked");
          void writeAudit({
            actor: { userId: engine.userId, email: null, role: null },
            action: AuditAction.ORDER_REJECTED,
            resourceType: "order",
            metadata: { symbol: replacement.symbol, side: "buy", qty, notional: buyNotional, reason: gate.reason, source: "engine_swap", ...gate.details },
          });
          continue;
        }
        const swapBuyOrder = await placeEngineOrder(client, { symbol: replacement.symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        recordOrderPlacement(engine, "buy", buyNotional);
        pendingBuySymbols.add(replacement.symbol); // Phase 7: prevent re-fire within this scan
        await logTrade(replacement.symbol, "tactical_smart_swap_buy", "BUY", qty, replacement.price, "PENDING", null, `Swap in: STRONG_BUY score ${replacement.score.toFixed(1)}`, swapBuyOrder.id, null, engine.userId);
        tradesThisScan++;
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
      const effectiveMaxExposure = riskLimits.maxExposure < 0 ? equity * Math.abs(riskLimits.maxExposure) : riskLimits.maxExposure > 0 ? riskLimits.maxExposure : equity * 1.5;
      const currentExposure = Array.from(positionMap.values())
        .reduce((sum, p) => sum + p.entryPrice * p.qty, 0);
      if (currentExposure + cand.price * qty > effectiveMaxExposure) break;

      // Phase 7 — duplicate-order guard: skip add if buy already pending on broker
      if (pendingBuySymbols.has(cand.symbol)) {
        log.info({ symbol: cand.symbol }, "STRONG_BUY add skipped — active buy already pending on broker");
        void writeAudit({
          actor: { userId: engine.userId, email: null, role: null },
          action: AuditAction.ORDER_REJECTED,
          resourceType: "order",
          metadata: { symbol: cand.symbol, side: "buy", reason: "duplicate_pending_order", source: "engine_add" },
        });
        continue;
      }
      try {
        const limitPrice = (cand.price * 1.001).toFixed(2);
        const buyNotional = qty * parseFloat(limitPrice);
        const gate = canPlaceBuyOrder(engine, cand.symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity);
        if (!gate.ok) {
          log.warn({ symbol: cand.symbol, qty, notional: buyNotional, reason: gate.reason, ...gate.details }, "Add BUY blocked");
          void writeAudit({
            actor: { userId: engine.userId, email: null, role: null },
            action: AuditAction.ORDER_REJECTED,
            resourceType: "order",
            metadata: { symbol: cand.symbol, side: "buy", qty, notional: buyNotional, reason: gate.reason, source: "engine_add", ...gate.details },
          });
          continue;
        }
        const addOrder = await placeEngineOrder(client, { symbol: cand.symbol, side: "buy", qty: String(qty), type: "limit", timeInForce: "day", limitPrice });
        recordOrderPlacement(engine, "buy", buyNotional);
        pendingBuySymbols.add(cand.symbol); // Phase 7: prevent re-fire within this scan
        await logTrade(cand.symbol, "tactical_smart_add", "BUY", qty, cand.price, "PENDING", null, `STRONG_BUY add: score ${cand.score.toFixed(1)}`, addOrder.id, null, engine.userId);
        tradesThisScan++;
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
  await upsertDailyPnl(today, realizedPnlThisScan, totalUnrealizedPnl, tradesThisScan, engine.halted, undefined, engine.userId);

  engine.lastScanAt = new Date();
  engine.scanCount++;
  await updateHeartbeat([...positionMap.keys()], engine.userId);
}

// ─── Standard Signal-Based Scan ─────────────────────────────────────────────

async function runScan(barResolution: "1d" | "5m" = "1d", engineUserId?: string): Promise<void> {
  const engine = getEngine(engineUserId);

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
      const positionMap = getPositionMap(engine?.userId ?? engineUserId);
      if (positionMap.size > 0) {
        log.info({ positions: positionMap.size }, "Flatten time (3:00 PM ET) — closing all intraday positions");
        for (const [sym, pos] of positionMap) {
          try {
            const resolved = await resolveBrokerClient(engine.userId);
            if (resolved) {
              const flattenOrder = await placeEngineOrder(resolved.client, { symbol: sym, side: "sell", qty: String(pos.qty), type: "market", timeInForce: "day" });
              await logTrade(sym, "flatten", "SELL", pos.qty, pos.entryPrice, "PENDING", null, "EOD flatten", flattenOrder.id, null, engine.userId);
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

  // Reset daily loss tracking if date changed — and clear any halt that came
  // from yesterday's daily-loss limit, so a halted engine resumes on the next
  // trading day without needing a manual restart.
  const today = getETDateString();
  if (engine.dailyLossDate !== today) {
    engine.dailyLoss = 0;
    engine.dailyNotional = 0; // reset daily notional cap window in lockstep
    engine.dailyLossDate = today;
    if (engine.halted) {
      log.info({ userId: engine.userId }, "New trading day — clearing daily-loss halt");
      engine.halted = false;
      engine.errors = engine.errors.filter(e => !e.startsWith("Daily loss limit hit"));
    }
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
    await upsertDailyPnl(today, 0, 0, 0, true, `Daily loss limit exceeded: $${engine.dailyLoss.toFixed(2)}`, engine.userId);
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

  // Load optimized signal params for "optimized" mode (tuned EMA/RSI from GA)
  const optSignalParams = engine.mode === "optimized" ? await getOptimizedSignalParams() : null;
  const hybridOpts = optSignalParams ? { signalParams: optSignalParams } : undefined;

  // 4. Get current broker positions + run live-trading safeguard checks
  let brokerPositions: Awaited<ReturnType<BrokerClient["getPositions"]>> = [];
  try {
    brokerPositions = await client.getPositions();
    engine.brokerConnected = true;
    engine.lastBrokerContact = new Date();
    engine.consecutiveBrokerFailures = 0;
    setBrokerPositionCache(engine.userId!, brokerPositions);
  } catch (err) {
    engine.consecutiveBrokerFailures++;
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", failures: engine.consecutiveBrokerFailures },
      "Failed to fetch broker positions"
    );
    if (engine.consecutiveBrokerFailures >= BROKER_FAILURE_HALT_THRESHOLD) {
      engine.brokerConnected = false;
      tripSafeguardHalt(engine, "broker_unreachable", {
        consecutiveFailures: engine.consecutiveBrokerFailures,
        lastContact: engine.lastBrokerContact?.toISOString() ?? null,
      });
      return;
    }
  }

  // Account-switch detection + PDT re-evaluation: compare current account to
  // boot snapshot AND refresh live PDT state (equity / daytradeCount can change
  // intra-session — see evaluatePdtState).
  if (engine.boot && engine.brokerConnected) {
    try {
      const currentAccount = await client.getAccount();
      // Account number changed → halt immediately (definite mismatch)
      if (
        engine.boot.accountNumber &&
        currentAccount.accountNumber &&
        currentAccount.accountNumber !== engine.boot.accountNumber
      ) {
        tripSafeguardHalt(engine, "account_mismatch", {
          bootAccountNumber: engine.boot.accountNumber,
          currentAccountNumber: currentAccount.accountNumber,
        });
        return;
      }
      // Equity collapsed beyond reasonable mark-to-market — halt for human review.
      const equityDrop = (engine.boot.equity - currentAccount.equity) / engine.boot.equity;
      if (equityDrop > ACCOUNT_SWITCH_EQUITY_DROP_PCT) {
        tripSafeguardHalt(engine, "equity_collapse", {
          bootEquity: engine.boot.equity,
          currentEquity: currentAccount.equity,
          dropPct: equityDrop,
          threshold: ACCOUNT_SWITCH_EQUITY_DROP_PCT,
        });
        return;
      }
      // Phase 5: refresh PDT state from live account (equity + daytradeCount).
      // Transitions get one audit event each via evaluatePdtState.
      evaluatePdtState(engine, currentAccount);
    } catch {
      // Account fetch failure — already counted as a broker failure above; don't double-count.
    }
  }

  // Phase 5: refresh wash-sale-blocked symbol set if cache is stale.
  // No-op when MTM is elected. One DB query per scan max (cached for 5 min).
  await maybeRefreshWashSaleSet(engine);

  const positionMap = getPositionMap(engine?.userId ?? engineUserId);

  // Sync position map with broker — handles manual sells/buys on Alpaca
  await syncPositionMapFromBroker(brokerPositions, positionMap, engine.userId!, client);
  await reconcilePendingTrades(client, engine.userId!);
  engine.positionCount = positionMap.size;

  // Fetch open orders to avoid conflicts (duplicate buys, stale stops).
  // Phase 7 — also track pending sells (excluding stops) for symmetric guards.
  const pendingBuySymbols = new Set<string>();
  const pendingSellSymbols = new Set<string>();
  const pendingOrdersBySymbol = new Map<string, { id: string; side: string; type: string }[]>();
  try {
    const openOrders = await client.getOrders(100);
    const pendingOrders = openOrders.filter((o) =>
      ["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)
    );
    for (const o of pendingOrders) {
      if (o.side === "buy") {
        pendingBuySymbols.add(o.symbol);
      } else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") {
        pendingSellSymbols.add(o.symbol);
      }
      const existing = pendingOrdersBySymbol.get(o.symbol) ?? [];
      existing.push({ id: o.id, side: o.side, type: o.type ?? "unknown" });
      pendingOrdersBySymbol.set(o.symbol, existing);
    }
    if (pendingBuySymbols.size > 0) {
      log.info({ symbols: [...pendingBuySymbols] }, "Pending buy orders detected — will skip these symbols");
    }
    if (pendingSellSymbols.size > 0) {
      log.info({ symbols: [...pendingSellSymbols] }, "Pending sell orders detected — will skip these symbols");
    }
  } catch {
    // If order fetch fails, proceed without conflict check
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
      const analysis = await analyzeHybrid(symbol, bars, hybridOpts);
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
        false, // will update to true if we act on it
        engine.userId
      );

      const heldPosition = positionMap.get(symbol);
      const brokerPos = brokerPositions.find((p) => p.symbol === symbol);

      // Skip if the 1-min exit check has a sell already in flight for this symbol —
      // prevents double-sell race between the two intervals.
      if (heldPosition && engine.pendingExits.has(symbol)) continue;

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
          engine.pendingExits.add(symbol);

          try {
            // Cancel any pending orders for this symbol (stops, limits) before market sell
            const pendingForSymbol = pendingOrdersBySymbol.get(symbol) ?? [];
            if (pendingForSymbol.length > 0 && client.cancelOrder) {
              for (const pending of pendingForSymbol) {
                try {
                  await client.cancelOrder(pending.id);
                  log.info({ symbol, orderId: pending.id, type: pending.type }, "Cancelled pending order before exit");
                } catch (cancelErr) {
                  log.warn({ symbol, orderId: pending.id, err: cancelErr instanceof Error ? cancelErr.message : "unknown" }, "Failed to cancel pending order");
                }
              }
              // Brief pause for Alpaca to release the held shares
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            const sellQty = brokerPos
              ? brokerPos.qty
              : heldPosition.qty;

            const sellOrder = await placeEngineOrder(client, {
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
            recordOrderPlacement(engine, "sell", 0);
            // Phase 3: track consecutive losses for auto-halt
            if (recordTradeResult(engine, pnl, riskLimits.maxConsecutiveLosses)) {
              tripSafeguardHalt(engine, "consecutive_losses", {
                consecutiveLosses: engine.consecutiveLosses,
                threshold: riskLimits.maxConsecutiveLosses,
              });
            }
            tradesThisScan++;

            await logTrade(
              symbol,
              signal,
              "SELL",
              heldPosition.qty,
              currentPrice,
              "PENDING",
              pnl,
              exitReason,
              sellOrder.id,
              null,
              engine.userId
            );


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
              `Order failed: ${msg}`,
              null,
              null,
              engine.userId
            );
          } finally {
            engine.pendingExits.delete(symbol);
          }
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

      // Log why Strong Buy signals are skipped (visible in production logs)
      if (isStrongSignal && !shouldBuy) {
        log.info({ symbol, signal, marketHealthy, confidence: confidence.toFixed(3) }, "STRONG_BUY skipped — market unhealthy or signal not confirmed");
        continue;
      }
      if (isStrongSignal && positionMap.size >= positionCap) {
        log.info({ symbol, positions: positionMap.size, cap: positionCap, maxPositions: riskLimits.maxPositions }, "STRONG_BUY skipped — position cap reached");
        continue;
      }

      if (shouldBuy && positionMap.size < positionCap) {
        // Skip if there's already a pending buy order for this symbol
        if (pendingBuySymbols.has(symbol)) {
          if (isStrongSignal) log.info({ symbol }, "STRONG_BUY skipped — pending buy order already exists");
          else log.debug({ symbol }, "Skipping — pending buy order already exists on broker");
          continue;
        }

        // Smart filters: earnings blackout, relative strength, sentiment
        const filterResult = await passesSmartFilters(symbol, bars);
        if (!filterResult.allowed) {
          if (isStrongSignal) log.info({ symbol, reason: filterResult.reason }, "STRONG_BUY blocked by smart filter");
          else log.debug({ symbol, reason: filterResult.reason }, "Blocked by smart filter");
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
          if (isStrongSignal) log.info({ symbol, equity, positionValue, currentPrice }, "STRONG_BUY skipped — computed qty is 0");
          else log.debug({ symbol, equity, positionValue, currentPrice }, "Computed qty is 0, skipping");
          continue;
        }

        // Check buying power before sending order to broker
        // Use buyingPower (not cash) — margin accounts can have negative cash but positive buying power
        const orderCost = qty * currentPrice;
        if (orderCost > account.buyingPower) {
          if (isStrongSignal) log.info({ symbol, qty, required: orderCost.toFixed(2), buyingPower: account.buyingPower.toFixed(2) }, "STRONG_BUY skipped — insufficient buying power");
          else log.debug({ symbol, qty, required: orderCost, buyingPower: account.buyingPower }, "Insufficient buying power, skipping");
          continue;
        }

        // Check max portfolio exposure (use equity as cap when not configured)
        const effectiveMaxExposure = riskLimits.maxExposure < 0 ? equity * Math.abs(riskLimits.maxExposure) : riskLimits.maxExposure > 0 ? riskLimits.maxExposure : equity * 1.5;
        const currentExposure = Array.from(positionMap.values())
          .reduce((sum, p) => sum + p.entryPrice * p.qty, 0);
        if (currentExposure + (currentPrice * qty) > effectiveMaxExposure) {
          if (isStrongSignal) log.info({ symbol, currentExposure: currentExposure.toFixed(2), maxExposure: effectiveMaxExposure.toFixed(2), orderCost: (currentPrice * qty).toFixed(2) }, "STRONG_BUY skipped — max exposure reached");
          else log.info({ symbol, currentExposure, maxExposure: effectiveMaxExposure }, "Max exposure reached, skipping");
          continue;
        }

        // Signal cooldown: 150 min lookout. Stored in a dedicated map (not the
        // external-signal queue, which gets cleaned up at 30 min and silently
        // collapsed this window).
        const lastBuyAt = engine.cooldowns.get(symbol);
        if (lastBuyAt && Date.now() - lastBuyAt < 150 * 60 * 1000) {
          if (isStrongSignal) log.info({ symbol }, "STRONG_BUY skipped — signal cooldown active");
          continue;
        }

        // Calculate bracket levels
        const stopLossPrice = parseFloat((currentPrice * (1 - strategy.stopLossPct)).toFixed(2));
        // Adaptive TP: use ATR × multiplier from optimizer if available, else fixed %
        const tpAtrMult = engine.mode === "optimized" ? await getOptimizedTpAtrMult() : null;
        const atrVal = analysis.indicators.atr_14;
        const takeProfitPrice = tpAtrMult && atrVal
          ? parseFloat((currentPrice + atrVal * tpAtrMult).toFixed(2))
          : parseFloat((currentPrice * (1 + strategy.takeProfitPct)).toFixed(2));
        // Limit price: slight premium for entry (0.1% above current)
        const limitPrice = parseFloat((currentPrice * 1.001).toFixed(2));

        log.info(
          {
            symbol, signal, confidence: confidence.toFixed(3), qty,
            limitPrice, stopLoss: stopLossPrice, takeProfit: takeProfitPrice,
          },
          "Placing bracket order"
        );

        // Phase 3 safeguards: notional cap + rate limit gate before submission
        const buyNotional = qty * limitPrice;
        const bootEquity = engine.boot?.equity ?? equity;
        // Phase 7 — skip if buy already pending on broker (pendingBuySymbols also
        // gets re-populated here from the fetched openOrders earlier in the scan)
        if (pendingBuySymbols.has(symbol)) {
          log.info({ symbol }, "Main-scan BUY skipped — active buy already pending on broker");
          continue;
        }
        const gate = canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, bootEquity);
        if (!gate.ok) {
          log.warn(
            { symbol, qty, notional: buyNotional, reason: gate.reason, ...gate.details },
            "BUY blocked by safeguard"
          );
          pushError(engine, `BUY blocked (${gate.reason}) on ${symbol}`);
          void writeAudit({
            actor: { userId: engine.userId, email: null, role: null },
            action: AuditAction.ORDER_REJECTED,
            resourceType: "order",
            metadata: {
              symbol,
              side: "buy",
              qty,
              notional: buyNotional,
              reason: gate.reason,
              source: "engine_scan",
              ...gate.details,
            },
          });
          continue;
        }

        try {
          // Place limit buy order — stop-loss and take-profit are managed
          // internally by the engine's exit logic (trailing stop, hold period)
          const buyOrder = await placeEngineOrder(client, {
            symbol,
            side: "buy",
            qty: String(qty),
            type: "limit",
            timeInForce: "day",
            limitPrice: String(limitPrice),
          });
          recordOrderPlacement(engine, "buy", buyNotional);
          pendingBuySymbols.add(symbol); // Phase 7: prevent re-fire within this scan

          tradesThisScan++;

          // Set cooldown to prevent re-buying same symbol too quickly (~2.5h)
          engine.cooldowns.set(symbol, Date.now());

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

          // Mark signal as acted on and get its ID for trade linkage
          const sigId = await logSignal(
            symbol,
            signal,
            currentPrice,
            analysis.volume,
            analysis.indicators as unknown as Record<string, unknown>,
            true,
            engine.userId
          );

          await logTrade(
            symbol,
            signal,
            "BUY",
            qty,
            currentPrice,
            "PENDING",
            null,
            `Entry: ${signal} (${(confidence * 100).toFixed(0)}% confidence)`,
            buyOrder.id,
            sigId,
            engine.userId
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
            `Order failed: ${msg}`,
            null,
            null,
            engine.userId
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
  // Drop expired cooldowns so the map doesn't grow unbounded
  for (const [sym, ts] of engine.cooldowns) {
    if (now - ts > 150 * 60 * 1000) engine.cooldowns.delete(sym);
  }

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
    engine.halted,
    undefined,
    engine.userId
  );
  await updateHeartbeat(symbols, engine.userId);

  // Sync broker stop orders to match dynamic trailing stops
  await syncBrokerStops(engine.userId);

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
  const engine = getEngine(userId);

  if (engine.running) {
    return { ok: false, error: "Engine is already running" };
  }

  // Verify broker connection exists and is allowed in current environment.
  const resolved = await resolveBrokerClient(userId);
  if (!resolved) {
    // Check whether the user has a live connection that's blocked by the env gate
    // — give them a specific actionable error rather than a generic "no connection".
    try {
      const liveOnly = await db
        .select({ id: brokerConnections.id })
        .from(brokerConnections)
        .where(
          and(
            eq(brokerConnections.userId, userId),
            eq(brokerConnections.isActive, true),
            eq(brokerConnections.environment, "live")
          )
        );
      if (liveOnly.length > 0 && !isLiveTradingAllowed()) {
        return {
          ok: false,
          error:
            "Live broker connection is blocked. Set ALLOW_LIVE_TRADING=1 in the server environment and restart the app to enable live trading.",
        };
      }
    } catch {
      /* fall through to generic error */
    }
    return {
      ok: false,
      error: "No active broker connection found. Add a paper or live broker in Settings.",
    };
  }

  // Verify the connection works AND capture boot snapshot for switch detection.
  let bootAccount: BrokerAccount;
  try {
    bootAccount = await resolved.client.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, error: `Broker connection test failed: ${msg}` };
  }

  // Phase 5: refuse to start intraday mode when the account is PDT-vulnerable
  // (< $25k). Other modes still allowed — they're swing-oriented and rarely
  // produce same-day round-trips. Mode refusal is a startup check only; once
  // running, mid-session equity drops are handled per-scan by evaluatePdtState.
  if (isPdtVulnerable(bootAccount) && mode === "intraday") {
    return {
      ok: false,
      error: `Cannot start engine in intraday mode: account equity is $${bootAccount.equity.toFixed(2)} (< $${PDT_EQUITY_THRESHOLD.toLocaleString()}) and is subject to PDT rule. Choose conservative / moderate / optimized / tactical / tactical-smart, or raise equity above $${PDT_EQUITY_THRESHOLD.toLocaleString()}.`,
    };
  }

  // Replace old safety stops with wide disaster stops (engine manages tighter exits dynamically).
  // placeDisasterStops cancels existing orders and waits for shares to release before placing.
  try {
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
  // Phase 3 — live-trading safeguards: capture environment + boot snapshot,
  // reset daily safeguard counters, clear rate-limit window.
  engine.environment = resolved.environment;
  engine.boot = {
    equity: bootAccount.equity,
    accountNumber: bootAccount.accountNumber || null,
  };
  engine.dailyNotional = 0;
  engine.consecutiveLosses = 0;
  engine.recentOrderTimestamps = [];

  // Phase 5 — load tax status (drives wash-sale protection) and prime PDT state.
  const { mtmElected } = await loadTaxStatus(userId);
  engine.mtmElected = mtmElected;
  engine.washSaleProtectionEnabled = !mtmElected;
  engine.washSaleBlockedSymbols = new Set();
  engine.washSaleLastRefreshAt = 0;
  if (engine.washSaleProtectionEnabled) {
    // Prime the set so the first scan's first buy is gated correctly.
    engine.washSaleBlockedSymbols = await refreshWashSaleBlockedSymbols(userId);
    engine.washSaleLastRefreshAt = Date.now();
  }
  engine.pdtVulnerable = isPdtVulnerable(bootAccount);
  engine.pdtDayTradeCount = bootAccount.daytradeCount ?? 0;
  engine.pdtPatternFlagged = bootAccount.patternDayTrader === true;

  // Clear halted flag in database so UI stops showing "Trading Halted"
  const today = getETDateString();
  try {
    await upsertDailyPnl(today, 0, 0, 0, false, undefined, userId);
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId, today },
      "Failed to clear halted flag on engine start"
    );
  }

  // Restart-safe cooldown hydration: re-populate cooldown markers from recent BUY
  // trades in the database so an engine restart doesn't bypass the post-buy cooldown
  // and re-trigger a duplicate entry on the same symbol within the cooldown window.
  try {
    const cooldownWindowMs = 150 * 60 * 1000; // matches the in-loop cooldown check
    const sinceMs = Date.now() - cooldownWindowMs;
    const recentBuys = await db
      .select({ symbol: traderTrades.symbol, createdAt: traderTrades.createdAt })
      .from(traderTrades)
      .where(
        and(
          eq(traderTrades.userId, userId),
          eq(traderTrades.action, "buy"),
          gt(traderTrades.createdAt, new Date(sinceMs))
        )
      );
    for (const row of recentBuys) {
      const buyAt = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now();
      // Earlier versions wrote these into externalSignals with a synthetic
      // "cooldown:SYMBOL" key — but the in-loop check reads engine.cooldowns,
      // so post-restart cooldowns were silently no-op. Write to the right map.
      engine.cooldowns.set(row.symbol, buyAt);
    }
    if (recentBuys.length > 0) {
      log.info({ userId, hydrated: recentBuys.length }, "Hydrated cooldown markers from recent buys");
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", userId },
      "Cooldown hydration skipped"
    );
  }

  const intraday = isIntradayMode(mode);
  const scanIntervalMs = intraday ? INTRADAY_SCAN_MS : SWING_SCAN_MS;
  const barResolution = intraday ? "5m" : "1d";

  log.info({ userId, mode, scanIntervalMs }, "Trading engine started");

  // Pick the right scan function based on mode — capture userId in closure
  const scanFn = mode === "tactical" ? () => runTacticalScan(userId)
    : mode === "tactical-smart" ? () => runTacticalSmartScan(userId)
    : () => runScan(barResolution, userId);

  // Run initial scan immediately (will skip if market is closed)
  scanFn().catch((err) => {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Initial scan failed");
    pushError(engine, `Initial scan failed: ${err instanceof Error ? err.message : "unknown"}`);
  });

  // If market is not yet open, schedule a scan at exactly 9:30 AM ET
  const msToOpen = msUntilMarketOpen();
  if (msToOpen > 0) {
    log.info({ userId, msToOpen, minutesToOpen: Math.round(msToOpen / 60000) }, "Market closed — scheduling scan at next open");
    engine.marketOpenTimeoutId = setTimeout(() => {
      if (!engine.running || engine.halted) return;
      engine.marketOpenTimeoutId = null;
      log.info({ userId }, "Market just opened — running scheduled scan");
      scanFn().catch((err) => {
        log.error({ err: err instanceof Error ? err.message : "unknown" }, "Market-open scan failed");
        pushError(engine, `Market-open scan failed: ${err instanceof Error ? err.message : "unknown"}`);
      });
    }, msToOpen);
  }

  // Set up scan interval
  engine.intervalId = setInterval(() => {
    if (!engine.running) return;
    scanFn().catch((err) => {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Scan cycle failed");
      pushError(engine, `Scan failed: ${err instanceof Error ? err.message : "unknown"}`);
    });
  }, scanIntervalMs);

  // 1-minute exit checks run in EVERY mode — uses live fetchQuote() to update
  // peakPrice and trigger trail/stop exits. The 15-min main scan is too slow
  // to track intraday peaks in swing modes (analysis.price = yesterday's close
  // on 1d bars), which is why trailing stops only moved on engine restart before
  // this fix.
  engine.exitCheckId = setInterval(() => {
    if (!engine.running || engine.halted) return;
    runExitCheck(userId).catch((err) => {
      log.error({ err: err instanceof Error ? err.message : "unknown" }, "Exit check failed");
    });
  }, EXIT_CHECK_MS);

  return { ok: true };
}

export async function stopEngine(userId?: string): Promise<{ ok: boolean; error?: string }> {
  const engine = userId ? getEngine(userId) : getEngine();

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
  if (engine.marketOpenTimeoutId) {
    clearTimeout(engine.marketOpenTimeoutId);
    engine.marketOpenTimeoutId = null;
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
 * Sync broker stop orders to match the engine's dynamic trailing stops.
 * For each position, computes the current dynamic trail and updates the
 * Alpaca stop order to that level. This ensures broker-side protection
 * matches in-memory trailing — even if the server goes down.
 *
 * Only ratchets stops UP (tighter) — never lowers an existing stop.
 */
async function syncBrokerStops(userId: string | null): Promise<void> {
  if (!userId) return;

  const resolved = await resolveBrokerClient(userId);
  if (!resolved || !resolved.client.replaceOrder) return;
  const { client } = resolved;

  const positionMap = getPositionMap(userId);
  if (positionMap.size === 0) return;

  try {
    // Get only open stop orders (avoids old filled/cancelled orders eating the limit)
    const openOrders = await client.getOrders(100, "open");
    const stopOrders = new Map<string, { id: string; stopPrice: number }>();
    for (const o of openOrders) {
      if (o.type === "stop" && o.side === "sell" && o.stopPrice) {
        stopOrders.set(o.symbol, { id: o.id, stopPrice: parseFloat(o.stopPrice) });
      }
    }

    let updated = 0;

    for (const [symbol, pos] of positionMap) {
      const existing = stopOrders.get(symbol);

      // Compute dynamic trailing stop
      const strategy = await resolveStrategy(userId, symbol);
      const dynTrailPct = getDynamicTrailingPct(pos.entryPrice, pos.peakPrice, strategy.trailingStopPct);
      const trailStop = pos.peakPrice * (1 - dynTrailPct);
      const fixedStop = pos.entryPrice * (1 - strategy.stopLossPct);
      const targetStop = Math.max(fixedStop, trailStop);

      // No stop on broker yet (e.g., position opened mid-run, before any stop/start cycle).
      // Place one now so the position has protection if the server crashes.
      if (!existing) {
        try {
          await placeEngineOrder(client, {
            symbol, side: "sell", qty: String(pos.qty),
            type: "stop", timeInForce: "gtc", stopPrice: targetStop.toFixed(2),
          });
          updated++;
          log.info(
            { symbol, stopPrice: targetStop.toFixed(2), peakPrice: pos.peakPrice.toFixed(2), trailPct: (dynTrailPct * 100).toFixed(1) },
            "Initial broker stop placed for new position"
          );
        } catch (err) {
          log.warn(
            { symbol, err: err instanceof Error ? err.message : "unknown" },
            "Failed to place initial broker stop"
          );
        }
        continue;
      }

      // Only ratchet UP — never lower the stop
      if (targetStop <= existing.stopPrice) {
        log.debug(
          { symbol, targetStop: targetStop.toFixed(2), existingStop: existing.stopPrice.toFixed(2), peakPrice: pos.peakPrice.toFixed(2), trailPct: (dynTrailPct * 100).toFixed(1) },
          "Stop sync skipped — target not higher than existing"
        );
        continue;
      }

      // Don't update if difference is less than $0.10 (avoid excessive API calls)
      if (targetStop - existing.stopPrice < 0.10) {
        log.debug(
          { symbol, targetStop: targetStop.toFixed(2), existingStop: existing.stopPrice.toFixed(2), diff: (targetStop - existing.stopPrice).toFixed(2) },
          "Stop sync skipped — difference < $0.10"
        );
        continue;
      }

      try {
        await client.replaceOrder!(existing.id, { stopPrice: targetStop.toFixed(2) });
        updated++;
        log.info(
          { symbol, oldStop: existing.stopPrice.toFixed(2), newStop: targetStop.toFixed(2), trailPct: (dynTrailPct * 100).toFixed(1) },
          "Broker stop updated to match dynamic trail"
        );
      } catch (err) {
        // Replace can fail if order was already triggered — not critical
        log.warn(
          { symbol, err: err instanceof Error ? err.message : "unknown" },
          "Failed to update broker stop"
        );
      }
    }

    if (updated > 0) {
      log.info({ updated }, "Broker stops synced");
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to sync broker stops");
  }
}

/**
 * Cancel all open orders, then poll until the broker reports no pending orders.
 * Alpaca's DELETE /v2/orders ack is async — the response returns before shares
 * actually release from `held_for_orders`. Without this wait, immediately placing
 * a new sell stop fails with 403 "insufficient qty available".
 */
async function cancelAllAndWait(client: BrokerClient, maxMs = 5000): Promise<void> {
  if (!client.cancelAllOrders) return;
  await client.cancelAllOrders();
  const deadline = Date.now() + maxMs;
  const PENDING = new Set(["new", "accepted", "pending_new", "partially_filled", "held", "pending_cancel"]);
  while (Date.now() < deadline) {
    try {
      const orders = await client.getOrders(100);
      if (!orders.some((o) => PENDING.has(o.status))) return;
    } catch {
      // Transient broker error — keep polling until deadline
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Place protective stops on Alpaca for all positions.
 * Uses the tighter of: disaster stop (18% below entry) or dynamic trailing
 * stop based on current price. This ensures crash protection reflects
 * current gains — not just the entry price.
 */
async function placeDisasterStops(userId: string | null): Promise<void> {
  if (!userId) return;

  const resolved = await resolveBrokerClient(userId);
  if (!resolved) return;

  try {
    await cancelAllAndWait(resolved.client);
    const positions = await resolved.client.getPositions();
    for (const pos of positions) {
      if (pos.qty <= 0) continue;

      const disasterStop = pos.avgEntryPrice * (1 - DISASTER_STOP_PCT);
      const strategy = await resolveStrategy(userId, pos.symbol);

      // Use current price as peak — if price has run up, trail from there
      const peakPrice = Math.max(pos.currentPrice, pos.avgEntryPrice);
      const dynTrailPct = getDynamicTrailingPct(pos.avgEntryPrice, peakPrice, strategy.trailingStopPct);
      const trailStop = peakPrice * (1 - dynTrailPct);
      const fixedStop = pos.avgEntryPrice * (1 - strategy.stopLossPct);

      // Use the tightest (highest) stop that protects gains
      const stopPrice = Math.max(disasterStop, trailStop, fixedStop).toFixed(2);

      try {
        await placeEngineOrder(resolved.client, {
          symbol: pos.symbol, side: "sell", qty: String(pos.qty),
          type: "stop", timeInForce: "gtc", stopPrice,
        });
        log.info(
          { symbol: pos.symbol, stopPrice, qty: pos.qty, peak: peakPrice.toFixed(2), trailPct: (dynTrailPct * 100).toFixed(1) },
          "Protective stop placed"
        );
      } catch (err) {
        log.error({ symbol: pos.symbol, err: err instanceof Error ? err.message : "unknown" }, "Failed to place protective stop");
      }
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Failed to place protective stops");
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

    await cancelAllAndWait(client);

    for (const pos of positions) {
      if (pos.qty <= 0) continue;

      const strategy = await resolveStrategy(userId, pos.symbol);
      const stopPrice = (pos.avgEntryPrice * (1 - strategy.stopLossPct)).toFixed(2);

      try {
        await placeEngineOrder(client, {
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

export async function haltEngine(userId?: string): Promise<{ ok: boolean; error?: string }> {
  const engine = userId ? getEngine(userId) : getEngine();

  // Stop the loop
  if (engine.intervalId) {
    clearInterval(engine.intervalId);
    engine.intervalId = null;
  }
  if (engine.marketOpenTimeoutId) {
    clearTimeout(engine.marketOpenTimeoutId);
    engine.marketOpenTimeoutId = null;
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

        // Source positions from the broker, not the in-memory positionMap.
        // The map only contains long positions the engine is tracking; manual
        // buys outside the engine could be missed otherwise. Shorts (qty <= 0)
        // are skipped — engine is long-only and the user is responsible for
        // managing those positions on the broker directly.
        const brokerPositions = await resolved.client.getPositions();
        const positionMap = getPositionMap(engine.userId);

        for (const pos of brokerPositions) {
          if (pos.qty <= 0) {
            log.info({ symbol: pos.symbol, qty: pos.qty }, "Halt skipped short position (engine is long-only)");
            continue;
          }
          try {
            const haltOrder = await placeEngineOrder(resolved.client, {
              symbol: pos.symbol,
              side: "sell",
              qty: String(pos.qty),
              type: "market",
              timeInForce: "day",
            });

            const quote = await getMarketDataProvider().fetchQuote(pos.symbol);
            const closePrice = quote?.price ?? pos.currentPrice ?? pos.avgEntryPrice;
            const pnl = (closePrice - pos.avgEntryPrice) * pos.qty;

            await logTrade(
              pos.symbol,
              "HALT",
              "SELL",
              pos.qty,
              closePrice,
              "PENDING",
              pnl,
              "Emergency halt — all positions closed",
              haltOrder.id,
              null,
              engine.userId
            );

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
export function pushExternalSignal(signal: ExternalSignal, userId?: string): boolean {
  const engine = getEngine(userId);
  if (!engine.running || engine.halted) return false;

  // Dedup: don't accept the same symbol+signal within 30 minutes
  const isDup = engine.externalSignals.some(
    (s) => s.symbol === signal.symbol && s.signal === signal.signal && Date.now() - s.receivedAt < 30 * 60 * 1000
  );
  if (isDup) return false;

  engine.externalSignals.push(signal);
  log.info({ symbol: signal.symbol, signal: signal.signal, source: signal.source }, "External signal received");
  // Mirror to trader_signals so the user sees screener-pushed signals in
  // Recent Signals immediately, not only after the engine's next scan picks
  // up the symbol. Fire-and-forget — the queue push is the source of truth.
  void logSignal(
    signal.symbol,
    signal.signal,
    signal.price,
    signal.volume ?? 0,
    { source: signal.source, confidence: signal.confidence },
    false,
    engine.userId,
  );
  return true;
}

/**
 * Broadcast an external signal to ALL running engines (every user).
 * Used by the screener which is global/shared — not per-user.
 * Returns the number of engines that accepted the signal.
 */
export function broadcastExternalSignal(signal: ExternalSignal): number {
  g.__tradingEngines ??= new Map();
  let accepted = 0;
  for (const [userId, engine] of g.__tradingEngines) {
    if (!engine.running || engine.halted) continue;

    const isDup = engine.externalSignals.some(
      (s) => s.symbol === signal.symbol && s.signal === signal.signal && Date.now() - s.receivedAt < 30 * 60 * 1000
    );
    if (isDup) continue;

    engine.externalSignals.push(signal);
    accepted++;
    log.info({ symbol: signal.symbol, signal: signal.signal, source: signal.source, userId }, "External signal broadcast to engine");
    // Mirror to trader_signals per accepted engine — see comment in
    // pushExternalSignal. Fire-and-forget.
    void logSignal(
      signal.symbol,
      signal.signal,
      signal.price,
      signal.volume ?? 0,
      { source: signal.source, confidence: signal.confidence },
      false,
      userId,
    );
  }
  return accepted;
}

/**
 * Auto-start engine if there are open positions on the broker.
 * Called on boot via instrumentation.ts and on first dashboard API hit after a deploy/restart.
 * Retries with exponential backoff so transient broker/DB errors don't leave the engine
 * permanently down — the trade-stale-stop scenario from Apr 28–30, 2026.
 */
export async function autoStartIfNeeded(userId: string): Promise<void> {
  const engine = getEngine(userId);
  if (engine.running) return;

  const maxAttempts = 3;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resolved = await resolveBrokerClient(userId);
      if (!resolved) return; // no broker connection — not transient, nothing to retry

      const positions = await resolved.client.getPositions();
      if (positions.length === 0) return;

      let lastMode: EngineMode = "optimized";
      try {
        const [status] = await db.select().from(traderStatus).where(eq(traderStatus.userId, userId)).limit(1);
        if (status?.mode?.startsWith("paper:")) {
          const parts = status.mode.split(":");
          const savedMode = parts.length > 1 ? (parts[1] as EngineMode) : null;
          const validModes: EngineMode[] = ["conservative", "moderate", "optimized", "aggressive", "intraday", "tactical", "tactical-smart"];
          if (savedMode && validModes.includes(savedMode)) lastMode = savedMode;
        }
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : "unknown", userId }, "Failed to recover last engine mode");
      }

      log.info({ positions: positions.length, userId, mode: lastMode, attempt }, "Open positions detected — auto-starting engine with last mode");

      const positionMap = getPositionMap(userId);
      await syncPositionMapFromBroker(positions, positionMap, userId, resolved.client);
      log.info({ synced: positionMap.size }, "Synced broker positions into engine");

      await startEngine(userId, lastMode);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const backoffMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s
        log.warn({ userId, attempt, backoffMs, err: err instanceof Error ? err.message : "unknown" }, "Auto-start attempt failed, retrying");
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  log.error(
    { userId, attempts: maxAttempts, err: lastErr instanceof Error ? lastErr.message : "unknown" },
    "Auto-start failed after all retries — engine will not resume until manually started"
  );
}

/**
 * Snapshot of every engine on this process — used by the watchdog and the
 * /api/health/engine endpoint. Returns plain values, not the live engine object,
 * so callers can't mutate state.
 */
export function getAllEngineSnapshots(): Array<{
  userId: string;
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  lastScanAt: Date | null;
  brokerConnected: boolean;
  consecutiveBrokerFailures: number;
  dailyLoss: number;
  dailyLossLimit: number;
  recentErrors: string[];
}> {
  if (!g.__tradingEngines) return [];
  const snapshots = [];
  for (const [userId, engine] of g.__tradingEngines) {
    snapshots.push({
      userId,
      running: engine.running,
      halted: engine.halted,
      mode: engine.mode,
      lastScanAt: engine.lastScanAt,
      brokerConnected: engine.brokerConnected,
      consecutiveBrokerFailures: engine.consecutiveBrokerFailures,
      dailyLoss: engine.dailyLoss,
      dailyLossLimit: engine.dailyLossLimit,
      recentErrors: engine.errors.slice(-5),
    });
  }
  return snapshots;
}

/**
 * Stop every running engine on this process. Called from the SIGTERM/SIGINT handler
 * in instrumentation.ts so safety stops are placed on Alpaca before the container exits.
 */
export async function shutdownAllEngines(): Promise<void> {
  if (!g.__tradingEngines) return;
  const userIds = Array.from(g.__tradingEngines.keys());
  if (userIds.length === 0) return;

  log.info({ engines: userIds.length }, "Graceful shutdown — stopping all engines");
  await Promise.allSettled(userIds.map(uid => stopEngine(uid)));
}

/**
 * Peek at the engine state for a user WITHOUT auto-creating one. Returns
 * null when the user has no engine instance yet (never started). Useful
 * for admin overviews that iterate over all users and don't want to
 * pollute the engine Map with empty entries.
 */
export function peekEngineStatus(userId: string): {
  running: boolean;
  halted: boolean;
  mode: EngineMode;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  environment: "paper" | "live" | null;
  brokerConnected: boolean;
  errors: string[];
} | null {
  const map = (globalThis as typeof globalThis & {
    __tradingEngines?: Map<string, EngineState>;
  }).__tradingEngines;
  if (!map) return null;
  const engine = map.get(userId);
  if (!engine) return null;
  return {
    running: engine.running,
    halted: engine.halted,
    mode: engine.mode,
    lastScanAt: engine.lastScanAt?.toISOString() ?? null,
    scanCount: engine.scanCount,
    positionCount: engine.positionCount,
    dailyLoss: engine.dailyLoss,
    environment: engine.environment,
    brokerConnected: engine.brokerConnected,
    errors: engine.errors.slice(-5),
  };
}

export function getEngineStatus(userId?: string): {
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
  brokerConnected: boolean;
  lastBrokerContact: string | null;
  // Phase 3 — live-trading safeguards
  environment: "paper" | "live" | null;
  bootEquity: number | null;
  bootAccountNumber: string | null;
  dailyNotional: number;
  consecutiveLosses: number;
  liveTradingAllowed: boolean;
  // Phase 5 — personalized live-trading protections
  mtmElected: boolean;
  washSaleProtectionEnabled: boolean;
  washSaleBlockedCount: number;
  pdtVulnerable: boolean;
  pdtDayTradeCount: number;
  pdtPatternFlagged: boolean;
} {
  const engine = userId ? getEngine(userId) : getEngine();
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
    brokerConnected: engine.brokerConnected,
    lastBrokerContact: engine.lastBrokerContact?.toISOString() ?? null,
    environment: engine.environment,
    bootEquity: engine.boot?.equity ?? null,
    bootAccountNumber: engine.boot?.accountNumber ?? null,
    dailyNotional: engine.dailyNotional,
    consecutiveLosses: engine.consecutiveLosses,
    liveTradingAllowed: isLiveTradingAllowed(),
    mtmElected: engine.mtmElected,
    washSaleProtectionEnabled: engine.washSaleProtectionEnabled,
    washSaleBlockedCount: engine.washSaleBlockedSymbols.size,
    pdtVulnerable: engine.pdtVulnerable,
    pdtDayTradeCount: engine.pdtDayTradeCount,
    pdtPatternFlagged: engine.pdtPatternFlagged,
  };
}

/**
 * Get tracked stop/target prices for a user's positions.
 * Returns a map of symbol → { stopLoss, takeProfit, trailingStopPct, peakPrice }.
 */
export function getTrackedPositionData(userId: string): Map<string, {
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  peakPrice: number;
  entryDate: Date;
}> {
  const positionMap = getPositionMap(userId);
  const result = new Map<string, { stopLoss: number; takeProfit: number; trailingStopPct: number; peakPrice: number; entryDate: Date }>();
  for (const [symbol, pos] of positionMap) {
    result.set(symbol, {
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      trailingStopPct: pos.trailingStopPct,
      peakPrice: pos.peakPrice,
      entryDate: pos.entryDate,
    });
  }
  return result;
}
