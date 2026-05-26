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
import { getSymbolSector } from "./sectors";
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
  users,
} from "./db/schema";
import { eq, and, desc, gt, inArray, lt, isNotNull, sql } from "drizzle-orm";
import { createRouteLogger } from "./logger";
import { writeAudit, AuditAction } from "./audit";
import { detectMarketRegime } from "./market-regime";
import { createAutoJournalStub } from "./journal-auto-stub";
import { getUserTier } from "./tiers-server";
import { userHasTier } from "./tiers";

const log = createRouteLogger("trading-engine");

// ─── Engine State (globalThis singleton) ─────────────────────────────────────

export type EngineMode = "conservative" | "moderate" | "optimized" | "aggressive" | "tactical" | "tactical-smart" | "adaptive";

/**
 * Modes shown in the user-facing mode picker (Trader page, backtest
 * compare, optimizer compare). conservative / moderate / aggressive
 * remain in EngineMode because the adaptive regime classifier maps
 * to them internally at runtime — they're just not directly
 * selectable.
 *
 * UI surfaces should iterate this list rather than hard-coding the
 * picker, so adding/removing a user-facing mode is a one-line change
 * here that propagates everywhere.
 */
export const USER_FACING_MODES: readonly EngineMode[] = [
  "optimized",
  "tactical",
  "tactical-smart",
  "adaptive",
] as const;

/**
 * Resolve which mode the engine is actually executing right now. When the
 * user has selected `adaptive`, the engine reads market regime each scan
 * and assigns `engine.effectiveMode` — every callsite that branches on
 * mode for STRATEGY behavior should call this helper instead of reading
 * `engine.mode` directly. Identity/UI/persistence callsites still read
 * `engine.mode` so they reflect the user-selected mode (which is
 * "adaptive", not the underlying).
 *
 * Falls back to `engine.mode` when:
 *  - User-selected mode is not `adaptive`
 *  - User selected `adaptive` but `effectiveMode` is not yet populated
 *    (very first scan before `refreshAdaptiveMode` has run)
 */
export function getActiveMode(engine: EngineState): EngineMode {
  if (engine.mode === "adaptive" && engine.effectiveMode) {
    return engine.effectiveMode;
  }
  return engine.mode;
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
  /** Date string (ET) when bootEquity was last snapshotted. Re-snapshotted at every market-open boundary so the 50% equity-collapse tripwire stays calibrated as the account grows over months. */
  bootEquitySnapshotDate: string;
  /** Phase 3 — when the current scan started. Null while idle. Used by the dashboard to render "scan in progress" vs "last completed scan X ago." */
  scanStartedAt: Date | null;
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
  // ── Adaptive mode ──
  /**
   * When `mode === "adaptive"`, this is the actual mode being executed
   * this scan (one of conservative/moderate/optimized/aggressive/tactical).
   * Refreshed by `refreshAdaptiveMode()` at scan start. Null when mode
   * is not adaptive, or when adaptive is selected but no regime has been
   * computed yet (very first scan).
   */
  effectiveMode: EngineMode | null;
  /**
   * Last regime read used to pick `effectiveMode`. Surfaced through the
   * dashboard route so the Trader page can render the "Adaptive — currently
   * optimized · VIX 18.2 · SPY +1.2% vs SMA50 · breadth 72" banner.
   */
  adaptiveRegime: {
    regime: "risk_on" | "neutral" | "risk_off";
    vix: number;
    spyPrice: number;
    spyMA50: number;
    spyMA200: number;
    breadthScore?: number;
    reasons: string[];
    updatedAt: Date;
  } | null;
  /** User's effective tier at engine start. Captured once so mid-session
   *  tier changes don't reshape the running pipeline (we'd lose AI score
   *  history mid-trade if it flipped). Read by `buildHybridOpts()` to
   *  strip Premium-tier hybrid layers (AI scoring + AI sentiment) for
   *  non-Premium users — they get pure technical + Finnhub layers but
   *  not the Groq-driven layers they don't pay for. Tier picks up next
   *  time the engine is restarted. */
  userTier: "free" | "trader" | "premium" | "enterprise" | null;
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
    bootEquitySnapshotDate: "",
    scanStartedAt: null,
    consecutiveLosses: 0,
    recentOrderTimestamps: [],
    mtmElected: false,
    washSaleProtectionEnabled: true, // default conservative — disabled only when MTM elected
    washSaleBlockedSymbols: new Set(),
    washSaleLastRefreshAt: 0,
    pdtVulnerable: false,
    pdtDayTradeCount: 0,
    pdtPatternFlagged: false,
    effectiveMode: null,
    adaptiveRegime: null,
    userTier: null,
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

const SWING_SCAN_MS = 15 * 60 * 1000;    // 15 minutes for the signal scan
const EXIT_CHECK_MS = 60 * 1000;          // 1 minute for the live-quote exit check (every mode)
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
  __earningsCacheTimestamp?: number;
  __sentimentCache?: Map<string, number>; // symbol → bullish score (0-1)
  __sentimentCacheDate?: string;
  __sentimentCacheTimestamp?: number;
  __rsCache?: Map<string, number>; // symbol → relative strength vs SPY
  __rsCacheDate?: string;
  __rsCacheTimestamp?: number;
};

// Phase 3 (UI-lie audit fix): max age for the date-based caches above.
// Without this, if the server boots at 3am ET the cache is marked
// "today" and never refreshes for >20 hours. Earnings calendars update
// intra-day (analyst revisions, schedule changes); a 6h TTL keeps the
// cache reasonably fresh without thrashing the upstream APIs.
const FILTER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isFilterCacheStale(cacheDate: string | undefined, cacheTimestamp: number | undefined, today: string): boolean {
  if (cacheDate !== today) return true;
  if (!cacheTimestamp) return true;
  return Date.now() - cacheTimestamp > FILTER_CACHE_TTL_MS;
}

/**
 * #1: Earnings blackout — don't buy within 5 trading days of earnings
 */
async function isInEarningsBlackout(symbol: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  // Refresh cache daily OR every 6h (whichever first) — see FILTER_CACHE_TTL_MS
  if (isFilterCacheStale(gFilters.__earningsCacheDate, gFilters.__earningsCacheTimestamp, today) || !gFilters.__earningsCache) {
    gFilters.__earningsCache = new Map();
    gFilters.__earningsCacheDate = today;
    gFilters.__earningsCacheTimestamp = Date.now();

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

  // Refresh cache daily OR every 6h (whichever first)
  if (!gFilters.__sentimentCache || isFilterCacheStale(gFilters.__sentimentCacheDate, gFilters.__sentimentCacheTimestamp, today)) {
    gFilters.__sentimentCache = new Map();
    gFilters.__sentimentCacheDate = today;
    gFilters.__sentimentCacheTimestamp = Date.now();
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
  // Phase 4 — engine intelligence
  /** Max fraction of equity in any single sector. 0 = disabled. */
  maxSectorExposurePct: number;
  /** Auto-swap engine mode based on VIX + SPY regime. */
  adaptiveModeEnabled: boolean;
  /** Block BUYs within N trading days of earnings. 0 = disabled. */
  earningsBlackoutDays: number;
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
    maxSectorExposurePct: 0, // 0 = disabled
    adaptiveModeEnabled: false,
    earningsBlackoutDays: 0, // 0 = disabled
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
      // Phase 4 — engine intelligence
      const maxSectorExposurePct = profile.maxSectorExposurePct ?? defaults.maxSectorExposurePct;
      const adaptiveModeEnabled = profile.adaptiveModeEnabled ?? defaults.adaptiveModeEnabled;
      const earningsBlackoutDays = profile.earningsBlackoutDays ?? defaults.earningsBlackoutDays;

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
        maxSectorExposurePct,
        adaptiveModeEnabled,
        earningsBlackoutDays,
      };
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to load risk profile, using defaults");
  }

  return defaults;
}

// ─── Live-Trading Safeguards (Phase 3) ───────────────────────────────────────

/**
 * Build the sector-exposure context from the engine's in-memory position
 * map. Returns null when equity is 0 or the position map is empty. The
 * caller passes this to canPlaceBuyOrder so the sector cap can sum
 * existing exposure per sector without an extra broker round-trip.
 */
function buildSectorExposureContext(
  userId: string,
  equity: number
): { positionMarketValues: Map<string, number>; equity: number } | null {
  if (equity <= 0) return null;
  const positionMap = getPositionMap(userId);
  if (positionMap.size === 0) return { positionMarketValues: new Map(), equity };
  const positionMarketValues = new Map<string, number>();
  for (const [sym, pos] of positionMap) {
    // Fall back to entry × qty if currentPrice not yet synced (e.g. first
    // scan after restart). Marginal — sector cap is approximate anyway.
    const mv = pos.marketValue ?? (pos.currentPrice ?? pos.entryPrice) * pos.qty;
    positionMarketValues.set(sym, mv);
  }
  return { positionMarketValues, equity };
}

/**
 * Gate every BUY before it's submitted. Checks (in order, cheapest first):
 *  - wash-sale: symbol has a losing exit within 31 days AND MTM not elected
 *  - PDT: account < $25k AND daytrade count ≥ 3 (one shy of the PDT-flag threshold)
 *  - daily notional cap (gross BUY notional vs equity)
 *  - global order rate limit (sliding 60s window, 30 orders max)
 *
 * Phase 1 (UI-lie audit fix):
 * Before the wash-sale + PDT checks, refresh the relevant state if it's
 * stale. Previously these were updated only at scan boundaries (~15 min
 * apart), so a fresh losing close + immediate re-entry could slip past
 * wash-sale protection, and a 2nd day-trade in a 15-min window could
 * slip past the PDT block. Pass `account` to enable the live PDT refresh
 * — callers who don't have a fresh account snapshot can omit it (the
 * existing in-memory state is used as fallback).
 *
 * Returns { ok: false, reason } if blocked, { ok: true } otherwise.
 * Caller must call recordOrderPlacement() AFTER a successful placeOrder.
 */
async function canPlaceBuyOrder(
  engine: EngineState,
  symbol: string,
  notionalUsd: number,
  riskLimits: RiskLimits,
  bootEquity: number,
  account?: BrokerAccount,
  /** Phase 4 — sector cap needs the live position map (symbol → market value) to sum exposure */
  sectorExposureContext?: { positionMarketValues: Map<string, number>; equity: number }
): Promise<{ ok: true } | { ok: false; reason: string; details: Record<string, unknown> }> {
  // Refresh wash-sale set if stale. The helper has its own age check
  // (WASH_SALE_REFRESH_MS) so this is cheap when the cache is hot.
  await maybeRefreshWashSaleSet(engine);

  // Re-evaluate PDT state from the live account snapshot if provided.
  if (account) {
    evaluatePdtState(engine, account);
  }

  // Phase 4 — earnings blackout. Refuses BUYs if this symbol has an
  // earnings release within `earningsBlackoutDays` calendar days.
  // Skipped when earningsBlackoutDays = 0 (disabled) or the cache lookup
  // fails (best-effort; we don't want to block trades on a cache miss).
  if (riskLimits.earningsBlackoutDays > 0) {
    try {
      const inBlackout = await isInEarningsBlackout(symbol);
      if (inBlackout) {
        return {
          ok: false,
          reason: "earnings_blackout",
          details: {
            symbol,
            blackoutDays: riskLimits.earningsBlackoutDays,
          },
        };
      }
    } catch {
      // Best-effort — earnings cache lookup failures shouldn't block trading
    }
  }

  // Phase 4 — sector exposure cap. Refuses BUYs that would push any
  // sector over `maxSectorExposurePct` of equity. Requires the live
  // position map so we can sum existing exposure per sector.
  if (
    riskLimits.maxSectorExposurePct > 0 &&
    sectorExposureContext &&
    sectorExposureContext.equity > 0
  ) {
    const newSector = getSymbolSector(symbol);
    // Sum existing market value in the same sector
    let sectorMv = 0;
    for (const [posSymbol, mv] of sectorExposureContext.positionMarketValues) {
      if (getSymbolSector(posSymbol) === newSector) sectorMv += mv;
    }
    const totalAfter = sectorMv + notionalUsd;
    const sectorPct = totalAfter / sectorExposureContext.equity;
    if (sectorPct > riskLimits.maxSectorExposurePct) {
      return {
        ok: false,
        reason: "sector_exposure_cap",
        details: {
          symbol,
          sector: newSector,
          existingSectorMv: sectorMv,
          attemptedNotional: notionalUsd,
          equity: sectorExposureContext.equity,
          sectorPctAfter: sectorPct,
          cap: riskLimits.maxSectorExposurePct,
        },
      };
    }
  }

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
  // Phase 1 (UI-lie audit fix): write halted=true to today's daily P&L row
  // immediately so the dashboard reflects the halt on the next fetch.
  // Previously the dashboard read `halted` from DB (via todayPnl) which
  // only updated on the next scan boundary — up to ~15 min lag while
  // the user thought the engine was still running and might try to
  // place manual orders that got mysterious rejections.
  // Fire-and-forget — same pattern as audit write above.
  void upsertDailyPnl(getETDateString(), 0, 0, 0, true, reason, engine.userId).catch(() => {
    /* DB write failure non-blocking; in-memory halted is already true */
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

/**
 * Enforce the daily-loss halt threshold. Called from every scan path
 * (runScan, runTacticalScan, runTacticalSmartScan) BEFORE any BUY
 * decision logic so the limit can't be silently bypassed by a
 * particular mode.
 *
 * Previously the threshold check existed only inside runScan() —
 * tactical and tactical-smart scans reset the daily-loss counter on
 * date change but never enforced the threshold, so they could keep
 * opening positions past the loss cap. This was a real safety gap
 * surfaced by the 2026-05-16 cross-check audit.
 *
 * Behavior on hit:
 *   1. set engine.halted = true
 *   2. cancel all pending broker orders (best-effort — cancelAllOrders
 *      may be unavailable on IBKR/Tradier; logged + continued)
 *   3. upsert today's trader_daily_pnl row with halted=true + reason
 *   4. return true so the caller early-exits its scan
 *
 * Returns false on:
 *   - already-halted engines (no double-cancel)
 *   - can't fetch account equity (transient broker failure — defer
 *     decision to next scan rather than halt erroneously)
 *   - threshold not exceeded
 */
async function enforceDailyLossHalt(
  engine: EngineState,
  client: BrokerClient,
  today: string,
): Promise<boolean> {
  if (!engine.userId) return false;
  if (engine.halted) return true;

  let equity: number;
  try {
    const account = await client.getAccount();
    equity = account.equity;
  } catch {
    return false;
  }
  if (equity <= 0) return false;

  const riskLimits = await loadRiskLimits(engine.userId);
  engine.dailyLossLimit = riskLimits.dailyLossPct;
  const dailyLossThreshold = equity * riskLimits.dailyLossPct;
  if (engine.dailyLoss > -dailyLossThreshold) return false;

  log.warn(
    {
      userId: engine.userId,
      dailyLoss: engine.dailyLoss,
      threshold: dailyLossThreshold,
      mode: engine.mode,
      effectiveMode: engine.effectiveMode,
    },
    "Daily loss limit exceeded — halting engine"
  );
  engine.halted = true;
  pushError(engine, `Daily loss limit hit: $${engine.dailyLoss.toFixed(2)}`);

  if (client.cancelAllOrders) {
    try {
      await client.cancelAllOrders();
      log.info({ userId: engine.userId }, "Canceled all pending orders on daily-loss halt");
    } catch (err) {
      log.warn(
        { userId: engine.userId, err: err instanceof Error ? err.message : "unknown" },
        "Failed to cancel pending orders on daily-loss halt"
      );
    }
  }

  await upsertDailyPnl(
    today,
    0,
    0,
    0,
    true,
    `Daily loss limit exceeded: $${engine.dailyLoss.toFixed(2)}`,
    engine.userId,
  );
  return true;
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
  // Throw on DB error — the caller decides whether to keep the previous
  // set or treat as a hard fail. Previously this swallowed the error and
  // returned an empty Set, which the caller stored as the new "blocked
  // symbols" → wash-sale protection silently disabled for the entire
  // WASH_SALE_REFRESH_MS window. The empty-on-error path was the bug.
  const rows = await db
    .selectDistinct({ symbol: traderTrades.symbol })
    .from(traderTrades)
    .where(
      and(
        eq(traderTrades.userId, userId),
        inArray(traderTrades.action, ["SELL", "manual_close"]),
        // Prefer fillTime (when the trade actually closed) over createdAt
        // (when the row was inserted). For a SELL queued late one day and
        // filled the next, the wash-sale window anchors on the fill.
        // Falls back to createdAt for rows missing fillTime (legacy data).
        gt(
          sql`COALESCE(${traderTrades.fillTime}, ${traderTrades.createdAt})`,
          cutoff
        ),
        lt(traderTrades.pnl, 0)
      )
    );
  return new Set(rows.map((r) => r.symbol));
}

/**
 * Refresh `engine.washSaleBlockedSymbols` if the cache is stale or empty.
 * No-op when MTM elected.
 *
 * On DB error, KEEP the previous set and do NOT bump
 * washSaleLastRefreshAt — that way the next scan retries the refresh
 * rather than waiting WASH_SALE_REFRESH_MS while running unprotected.
 */
async function maybeRefreshWashSaleSet(engine: EngineState): Promise<void> {
  if (!engine.washSaleProtectionEnabled || !engine.userId) return;
  const age = Date.now() - engine.washSaleLastRefreshAt;
  if (engine.washSaleLastRefreshAt > 0 && age < WASH_SALE_REFRESH_MS) return;
  try {
    const next = await refreshWashSaleBlockedSymbols(engine.userId);
    engine.washSaleBlockedSymbols = next;
    engine.washSaleLastRefreshAt = Date.now();
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", userId: engine.userId },
      "Wash-sale refresh failed — keeping previous set and retrying next scan"
    );
    // INTENTIONAL: do NOT bump washSaleLastRefreshAt, do NOT clear
    // washSaleBlockedSymbols. Next scan retries.
  }
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

// Intraday strategy preset removed alongside the intraday mode itself.

// ─── Profit-Based Trailing Stop ──────────────────────────────────────────────

/**
 * Refresh `engine.effectiveMode` + `engine.adaptiveRegime` by reading
 * current market regime (VIX + SPY trend). Called once per scan when
 * `engine.mode === "adaptive"`.
 *
 * Live engine uses VIX + SPY only (NOT breadth) — keeping it in sync with
 * the backtester's regime classifier so paper-vs-live comparisons stay
 * meaningful. Adding breadth would mean fetching 50 stock bars per scan
 * (already done in /api/breadth but not cheap to call from the engine
 * loop). v2 enhancement.
 *
 * Failure handling: if VIX/SPY fetch fails, the engine keeps using whatever
 * effectiveMode was last computed (or falls back to "moderate" on the very
 * first scan). The engine MUST NOT halt on adaptive-refresh failures —
 * adaptive is a meta-decision, not a safety check.
 *
 * Emits `engine.mode_switched` audit row only when effectiveMode CHANGES
 * vs the previous scan — avoids noisy logs when regime stays put.
 */
async function refreshAdaptiveMode(engine: EngineState): Promise<void> {
  if (engine.mode !== "adaptive") return;

  const previousEffective = engine.effectiveMode;
  const provider = getMarketDataProvider();

  try {
    // Need at least 200 days for SMA200; fetch 250 for headroom.
    const [vixBars, spyBars] = await Promise.all([
      provider.fetchBars("^VIX", 5, "1d"),
      provider.fetchBars("SPY", 250, "1d"),
    ]);

    if (!vixBars.length || spyBars.length < 50) {
      log.warn(
        { vixBars: vixBars.length, spyBars: spyBars.length },
        "refreshAdaptiveMode: insufficient bars — keeping previous effectiveMode"
      );
      return;
    }

    const vix = vixBars[vixBars.length - 1].close;
    const spyPrice = spyBars[spyBars.length - 1].close;
    const spyMA50 = spyBars.slice(-50).reduce((s, b) => s + b.close, 0) / 50;
    const spyMA200 = spyBars.length >= 200
      ? spyBars.slice(-200).reduce((s, b) => s + b.close, 0) / 200
      : spyMA50; // fallback for <200 days history; classifier still works

    const report = detectMarketRegime({ vix, spyPrice, spyMA50, spyMA200 });

    engine.effectiveMode = report.recommendedMode;
    engine.adaptiveRegime = {
      regime: report.regime,
      vix,
      spyPrice,
      spyMA50,
      spyMA200,
      reasons: report.reasons,
      updatedAt: new Date(),
    };

    if (previousEffective !== report.recommendedMode) {
      log.info(
        {
          userId: engine.userId,
          from: previousEffective,
          to: report.recommendedMode,
          regime: report.regime,
          vix,
          reasons: report.reasons,
        },
        "Adaptive mode switched effective mode"
      );
      if (engine.userId) {
        void writeAudit({
          actor: { userId: engine.userId },
          action: AuditAction.ENGINE_MODE_SWITCHED,
          resourceType: "engine",
          resourceId: engine.userId,
          metadata: {
            adaptive: true,
            from: previousEffective ?? null,
            to: report.recommendedMode,
            regime: report.regime,
            vix: Math.round(vix * 10) / 10,
            spyPrice: Math.round(spyPrice * 100) / 100,
            spyMA50: Math.round(spyMA50 * 100) / 100,
            reasons: report.reasons,
          },
        });
      }
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown", userId: engine.userId },
      "refreshAdaptiveMode failed — keeping previous effectiveMode"
    );
  }
}

/**
 * Tightens the trailing stop proportionally as profit grows.
 *
 * v1 (legacy fallback): trail = floor + (base - floor) × exp(-rate × profit)
 *
 * Example with base 12%, floor 2%:
 *   0% profit  → 12% trail
 *   5% profit  → 10.5% trail
 *  10% profit  → 9% trail
 *  20% profit  → 6% trail
 *  30% profit  → 3% trail (near floor)
 *  40%+ profit → 2% trail (floor)
 *
 * v2 (when atr + vix supplied): trail scales with volatility and regime.
 *
 *   - ATR replaces baseTrailingPct as the per-stock base width.
 *     Trail starts at ATR_BASE_MULT × (ATR / peakPrice). High-volatility
 *     stocks (e.g. WDC, NVDA) get naturally wider trails; low-volatility
 *     stocks (utilities, REITs) get tighter trails. No per-symbol
 *     configuration needed.
 *
 *   - VIX adjusts the floor. Panic markets (VIX > 25) → 4% floor (give
 *     positions room to whipsaw). Neutral (18-25) → 2.5% floor. Calm
 *     (VIX < 18) → 1.5% floor (tighten further to lock in late-stage
 *     gains).
 *
 * Backward-compatible: when atr/vix are omitted, the function returns
 * exactly the same result as v1. Callsites with no upstream ATR plumbing
 * (the safety-stop placer when the engine stops, for example) keep
 * working without changes.
 */
const TRAIL_FLOOR = 0.02; // legacy / fallback floor
const TRAIL_DECAY_RATE = 3; // how fast the trail tightens with profit

// v2 — volatility-relative tuning constants
const ATR_BASE_MULT = 2.5;    // start at 2.5× ATR for the initial trail width
const ATR_TRAIL_CAP = 0.25;   // 25% absolute cap — protects against penny-stock ATR explosions

// v2 — regime-aware floors. Loose in panic, tight in calm. These map
// directly to the breakpoints used by the adaptive-mode classifier so
// the regime story stays consistent across the engine.
const TRAIL_FLOOR_VIX_PANIC = 0.04;   // VIX > 25
const TRAIL_FLOOR_VIX_NEUTRAL = 0.025; // 18 < VIX <= 25
// v3.1 — calm-regime floor tightened 1.5% → 1.0%. Only affects positions
// up enough that the trail has decayed near the floor (typically +25-30%
// profit). At low profit the regime floor is well above the trail width
// so this is a no-op. Net effect: big winners (>+30%) lock in slightly
// more peak gain before a giveback exit fires.
const TRAIL_FLOOR_VIX_CALM = 0.01;   // VIX <= 18
const VIX_PANIC_THRESHOLD = 25;
const VIX_CALM_THRESHOLD = 18;

// v2.5 — momentum-aware decay rate. Strong RSI keeps the trail wide
// (let the trend run); reversing RSI tightens the trail faster (lock in
// before the pullback). Multiplier is bounded so the rate stays within
// a sane range no matter how extreme RSI gets.
//
// At RSI 80 (very strong momentum):  rate = 3 × (1 - 0.3 × 0.6) = 2.46
// At RSI 50 (no signal):              rate = 3 × (1 - 0)        = 3.00
// At RSI 30 (reversing/oversold):     rate = 3 × (1 + 0.3 × 0.4) = 3.36
// At RSI 20 (strong reversal):        rate = 3 × (1 + 0.3 × 0.6) = 3.54
const MOMENTUM_RATE_SCALE = 0.3;

// v2.5 — drawdown-from-peak tightening. Once price pulls back from peak
// by more than this fraction of the current trail width, multiply the
// trail by a tightening factor to protect against partial reversals.
// Aggressive — exits on hesitation. Disabled by default (option must
// be passed explicitly).
const DRAWDOWN_TIGHTEN_MULT = 2;

// v3 — Breakeven-promote, tiered ladder.
//
// Ratchets pos.stopLoss up at four profit thresholds. Each tier locks
// in a portion of the unrealized gain. Independent of the dynamic
// trailing stop — fires even before the trail tightens enough to sit
// above entry. The effective stop on any scan is always
// max(pos.stopLoss, trailingStop).
//
// Why this exists: before tiered breakeven-promote, a position could
// run +5% and reverse to give back 5–10% (the trail at +5% sits at
// peak × (1 − 10.3%) ≈ entry × 0.94 — a 6% giveback). The +2% tier
// caps that giveback at breakeven; higher tiers progressively lock
// in real gain.
//
// Tiers (trigger = unrealized profit %, lock = where pos.stopLoss
// gets ratcheted relative to entry):
//   +2%  → entry × 1.001  (breakeven + 0.1% slippage buffer)
//   +5%  → entry × 1.025  (lock 2.5%)
//   +10% → entry × 1.05   (lock 5%)
//   +15% → entry × 1.075  (lock 7.5%)
// Above ~+15%, the dynamic trail is already tighter than entry × 1.075
// so it dominates naturally — no further breakeven tiers needed.
const BREAKEVEN_TIERS: readonly { trigger: number; lock: number }[] = [
  { trigger: 0.02, lock: 0.001 },
  { trigger: 0.05, lock: 0.025 },
  { trigger: 0.10, lock: 0.05 },
  { trigger: 0.15, lock: 0.075 },
];

/**
 * Per-mode opt-out for the tiered ladder.
 *
 *   "full"            — all 4 tiers active (default for most modes)
 *   "breakeven_only"  — only the +2% tier fires; let the dynamic
 *                       trail handle gain capture above that
 *   "disabled"        — no breakeven promotion at all (mode relies
 *                       on SPY regime or other portfolio-level exits)
 *
 * tactical-smart specifically uses breakeven_only because its strategy
 * is to hold through normal pullbacks for big winners (50% take-profit
 * target). Locking in gains at +5/+10/+15% would prematurely exit
 * positions that could have run to 30%+.
 *
 * tactical (pure SPY-driven) disables breakeven entirely — individual
 * position management contradicts the mode's "all in / all out on SPY"
 * philosophy.
 */
export type BreakevenLadderMode = "full" | "breakeven_only" | "disabled";

const MODE_LADDER_DEFAULT: Record<EngineMode, BreakevenLadderMode> = {
  conservative: "full",
  moderate: "full",
  optimized: "full",
  aggressive: "full",
  tactical: "disabled",
  "tactical-smart": "breakeven_only",
  adaptive: "full", // resolves to effective mode at call time; this key is for type completeness
};

/**
 * Resolve the ladder mode for the engine's currently-active mode.
 * Handles adaptive by reading the effective mode (post regime
 * resolution).
 */
export function getBreakevenLadderMode(activeMode: EngineMode): BreakevenLadderMode {
  return MODE_LADDER_DEFAULT[activeMode];
}

/**
 * Ratchet pos.stopLoss up the tiered ladder based on unrealized profit
 * at currentPrice. Walks BREAKEVEN_TIERS from lowest-trigger to highest
 * and applies the highest tier the position qualifies for. Idempotent:
 * if pos.stopLoss is already at-or-above the target for the highest
 * qualifying tier, returns false without mutating.
 *
 * Never lowers pos.stopLoss — if the trail has already ratcheted it
 * higher than the highest qualifying tier's target, this is a no-op.
 *
 * ladderMode:
 *   - "full" (default)      → all 4 tiers
 *   - "breakeven_only"      → only the first tier (+2%)
 *   - "disabled"            → no-op
 *
 * Structural type on pos — only needs entryPrice + stopLoss, so unit
 * tests and external tooling can call without a full TrackedPosition.
 */
export function maybePromoteBreakeven(
  pos: { entryPrice: number; stopLoss: number },
  currentPrice: number,
  ladderMode: BreakevenLadderMode = "full"
): boolean {
  if (ladderMode === "disabled") return false;
  const profitPct = (currentPrice - pos.entryPrice) / pos.entryPrice;
  const tiers =
    ladderMode === "breakeven_only" ? BREAKEVEN_TIERS.slice(0, 1) : BREAKEVEN_TIERS;

  // Walk from low to high; remember the highest tier we qualify for.
  // Tiers are sorted by ascending trigger so we can break as soon as
  // we encounter one we don't meet.
  let highestLock: number | null = null;
  for (const tier of tiers) {
    if (profitPct >= tier.trigger) {
      highestLock = tier.lock;
    } else {
      break;
    }
  }
  if (highestLock === null) return false;

  const targetStop = pos.entryPrice * (1 + highestLock);
  if (pos.stopLoss >= targetStop) return false; // already at-or-above (or trail-promoted past)
  pos.stopLoss = targetStop;
  return true;
}

interface TrailOptions {
  /** 14-day Average True Range in DOLLARS (not %). When supplied, drives the per-stock base trail via ATR_BASE_MULT × ATR / peakPrice. */
  atr?: number;
  /** Current VIX level. When supplied, scales the floor via the panic/neutral/calm bands. */
  vix?: number;
  /**
   * Current 14-period RSI of the position's symbol (0-100). When
   * supplied, adjusts the decay rate — strong momentum (RSI > 50)
   * slows the decay (keeps trail wide); weakening momentum (RSI < 50)
   * speeds the decay (tightens faster).
   */
  rsi?: number;
  /**
   * Current price of the symbol. When supplied AND less than peakPrice,
   * enables drawdown-from-peak tightening: trail tightens
   * proportionally to how far the current price has fallen from the
   * peak. Aggressive — exits on hesitation. Use sparingly.
   */
  currentPrice?: number;
}

function getDynamicTrailingPct(
  entryPrice: number,
  peakPrice: number,
  baseTrailingPct: number,
  options?: TrailOptions
): number {
  const profitPct = (peakPrice - entryPrice) / entryPrice;
  const atr = options?.atr;
  const vix = options?.vix;
  const rsi = options?.rsi;
  const currentPrice = options?.currentPrice;

  // Regime-aware floor (defaults to legacy 2% when no VIX)
  let floor: number;
  if (vix !== undefined) {
    floor =
      vix > VIX_PANIC_THRESHOLD
        ? TRAIL_FLOOR_VIX_PANIC
        : vix > VIX_CALM_THRESHOLD
          ? TRAIL_FLOOR_VIX_NEUTRAL
          : TRAIL_FLOOR_VIX_CALM;
  } else {
    floor = TRAIL_FLOOR;
  }

  // ATR-relative base trail (defaults to legacy fixed % when no ATR)
  let base: number;
  if (atr !== undefined && atr > 0 && peakPrice > 0) {
    base = Math.min(ATR_TRAIL_CAP, (ATR_BASE_MULT * atr) / peakPrice);
    // Never tighter than the legacy floor at entry — gives positions
    // room to find their footing in the first scan post-entry.
    base = Math.max(base, floor);
  } else {
    base = baseTrailingPct;
  }

  // Pre-profit: just return the base (with floor as the absolute minimum)
  if (profitPct <= 0) return Math.max(floor, base);

  // v2.5 — Momentum-aware decay rate. RSI = 50 is baseline (no
  // adjustment); above 50 SLOWS the decay (trail stays wider); below 50
  // SPEEDS the decay (trail tightens faster). Bounded |momentum| <= 1.
  //
  //   rate = TRAIL_DECAY_RATE × (1 - MOMENTUM_RATE_SCALE × momentum)
  //   where momentum = clamp((rsi - 50) / 50, -1, 1)
  //
  // Strong momentum → wider trail → ride the trend longer.
  // Weakening momentum → tighter trail → exit before the pullback.
  let rate = TRAIL_DECAY_RATE;
  if (rsi !== undefined) {
    const momentum = Math.max(-1, Math.min(1, (rsi - 50) / 50));
    rate = TRAIL_DECAY_RATE * (1 - MOMENTUM_RATE_SCALE * momentum);
  }

  // Exponential decay from base toward floor as profit grows
  const range = Math.max(0, base - floor);
  let trail = floor + range * Math.exp(-rate * profitPct);

  // v2.5 — Drawdown-from-peak tightening. When current price has pulled
  // back from peak by more than 1/DRAWDOWN_TIGHTEN_MULT of the current
  // trail width, apply a tightening factor proportional to the pullback.
  // Bounds: tightening factor in [0, 1], never goes below floor.
  //
  // Intuition: if our trail says we'd exit on a 5% pullback and we've
  // already pulled back 3%, the trend is breaking — tighten so we exit
  // sooner on the next leg down rather than at the full 5%.
  if (currentPrice !== undefined && currentPrice > 0 && currentPrice < peakPrice) {
    const peakDrawdown = (peakPrice - currentPrice) / peakPrice;
    // tighteningFactor = max(0, 1 - peakDrawdown × DRAWDOWN_TIGHTEN_MULT)
    // At 5% drawdown with mult=2: factor = 0, trail collapses to floor.
    // At 1% drawdown with mult=2: factor = 0.98, trail barely tightened.
    const tighteningFactor = Math.max(0, 1 - peakDrawdown * DRAWDOWN_TIGHTEN_MULT);
    trail = floor + (trail - floor) * tighteningFactor;
  }

  return Math.max(floor, trail);
}

// Exposed for unit tests + ad-hoc spreadsheets
export const trailInternals = {
  TRAIL_FLOOR,
  TRAIL_DECAY_RATE,
  ATR_BASE_MULT,
  ATR_TRAIL_CAP,
  TRAIL_FLOOR_VIX_PANIC,
  TRAIL_FLOOR_VIX_NEUTRAL,
  TRAIL_FLOOR_VIX_CALM,
  VIX_PANIC_THRESHOLD,
  VIX_CALM_THRESHOLD,
  MOMENTUM_RATE_SCALE,
  DRAWDOWN_TIGHTEN_MULT,
  getDynamicTrailingPct,
};

// ─── Market Hours ────────────────────────────────────────────────────────────
//
// Consolidated 2026-05-13 into src/lib/market-hours.ts. The shared module
// adds two things this file was missing:
//
//   - US trading holidays (Thanksgiving, Christmas, July 4 etc.) — previously
//     the engine would scan on holidays and burn API quota on stale data.
//   - Half-day early closes (Black Friday, Christmas Eve, July 3 sometimes)
//     — previously the engine would scan until 4pm on days the market
//     closed at 1pm.
//
// Re-exported here so external callers that imported isMarketOpen from
// trading-engine keep working.

import {
  isMarketOpen as isMarketOpenShared,
  msUntilMarketOpen as msUntilMarketOpenShared,
  getETDateString as getETDateStringShared,
} from "./market-hours";

// getETDate wrapper removed — only caller was the intraday 3 PM ET
// flatten block which went away with intraday mode itself. getETDateShared
// can be imported directly if a future scan path needs it.

function getETDateString(): string {
  return getETDateStringShared();
}

export function isMarketOpen(): boolean {
  return isMarketOpenShared();
}

function msUntilMarketOpen(): number {
  return msUntilMarketOpenShared();
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

/**
 * Resolve the user's active broker connection into an instantiated client.
 *
 * Exported as of 2026-05-13 so non-engine surfaces (e.g. the Portfolio
 * summary route) can fetch live positions directly when the in-memory
 * `getBrokerPositionCache` is cold (e.g. engine never started this
 * session). Otherwise the Portfolio page shows $0 even though the user
 * has a connected broker — confusing dead-end.
 */
export async function resolveBrokerClient(
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

  // Prefer paper environment connections; live requires both env-gate AND
  // per-user permission (Phase 13).
  const conn =
    connections.find((c) => c.environment === "paper") ?? connections[0];

  if (conn.environment === "live") {
    // Gate 1 — global infra env flag (server-side kill switch)
    if (!isLiveTradingAllowed()) {
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
    // Gate 2 — per-user permission (Phase 13). Admin-grantable.
    try {
      const [u] = await db
        .select({ liveEnabled: users.liveTradingEnabled, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!u?.liveEnabled) {
        log.error(
          { userId, email: u?.email, connectionId: conn.id },
          "Refusing to start engine on LIVE broker — user.live_trading_enabled is false"
        );
        void writeAudit({
          actor: { userId, email: u?.email ?? null, role: null },
          action: AuditAction.ENGINE_LIVE_BLOCKED,
          resourceType: "broker_connection",
          resourceId: conn.id,
          metadata: { reason: "user_not_granted_live", broker: conn.broker, email: u?.email },
        });
        return null;
      }
    } catch (err) {
      // DB failure — fail closed (refuse live boot). Don't trust env-only.
      log.error(
        { userId, err: err instanceof Error ? err.message : "unknown" },
        "Failed to read user.live_trading_enabled — refusing live boot"
      );
      return null;
    }

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
  const activeMode = getActiveMode(engine);
  // For optimized/tactical modes, use latest optimizer results from DB
  if (activeMode === "optimized" || activeMode === "tactical" || activeMode === "tactical-smart") {
    const latest = await getLatestOptimizedParams();
    if (latest) return latest;
  }

  // Fall back to hardcoded preset.
  // `adaptive` cannot reach here — getActiveMode() collapses it to the
  // effective mode before this lookup. If somehow engine.mode === "adaptive"
  // and effectiveMode is not yet set (very first scan), we land at
  // STRATEGY_PRESETS.optimized via the `??` fallback.
  const modePresetMap: Record<Exclude<EngineMode, "adaptive">, StrategyParams> = {
    conservative: STRATEGY_PRESETS.conservative,
    moderate: STRATEGY_PRESETS.moderate,
    optimized: STRATEGY_PRESETS.optimized,
    aggressive: STRATEGY_PRESETS.aggressive,
    tactical: STRATEGY_PRESETS.swing,
    "tactical-smart": STRATEGY_PRESETS.swing,
  };
  return activeMode === "adaptive"
    ? STRATEGY_PRESETS.optimized
    : (modePresetMap[activeMode] ?? STRATEGY_PRESETS.optimized);
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

      // v3 breakeven-promote — run BEFORE the stop math so the same
      // scan can both promote and exit if the price round-trips fast.
      // Ladder mode resolves from the engine's active mode (tactical-smart
      // uses breakeven_only, tactical disabled, others full).
      const ladderMode = getBreakevenLadderMode(getActiveMode(engine));
      if (maybePromoteBreakeven(pos, currentPrice, ladderMode)) {
        log.info(
          { symbol, newStopLoss: pos.stopLoss, entry: pos.entryPrice, currentPrice, ladderMode },
          "Breakeven promoted (1-min check)"
        );
      }

      // Stop loss with profit-based tightening.
      // v2 + v2.5 — pos.atr / pos.rsi cached on entry + refreshed each
      // main scan. engine.adaptiveRegime.vix from the regime snapshot.
      // currentPrice is from the 1-min poll — drives drawdown
      // tightening when price has pulled back from peak. All optional
      // — falls back to fixed-% when absent.
      //
      // v3 — read pos.stopLoss as source of truth instead of recomputing
      // from entryPrice * (1 - stopLossPct). pos.stopLoss reflects
      // broker reconciliation (syncBrokerStops) AND breakeven promotions
      // from this and prior scans; recomputing would silently undo both.
      const fixedStop = pos.stopLoss;
      const dynTrailPct = getDynamicTrailingPct(
        pos.entryPrice,
        pos.peakPrice,
        params.trailingStopPct,
        {
          atr: pos.atr,
          vix: engine.adaptiveRegime?.vix,
          rsi: pos.rsi,
          currentPrice,
        }
      );
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
    // status="open" — otherwise Alpaca defaults to "all" and returns the 100
    // most-recent orders dominated by filled/cancelled, hiding still-open ones
    // we actually need to cancel on a churn-heavy account.
    const orders = await client.getOrders(100, "open");
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
      // Phase 16 — preserve the placeholder price (quote at submission time)
      // so the slippage report can compare against reconciled actual fill.
      placeholderFillPrice: fillPrice,
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
  /** Phase 4 — last-known live price + marketValue from the most recent sync. Used for sector-exposure math without an extra broker call per BUY decision. */
  currentPrice?: number;
  marketValue?: number;
  /**
   * Trail dynamism v2 — most recent 14-day ATR (in dollars) for this
   * position's symbol, refreshed at scan time when analyzer indicators
   * are available. Consumed by getDynamicTrailingPct() to scale the
   * trail width volatility-relative per stock. Optional — when absent,
   * the trail falls back to the fixed-% formula.
   */
  atr?: number;
  /**
   * Trail dynamism v2.5 — most recent 14-period RSI for this position's
   * symbol, refreshed alongside atr at scan time. Consumed by
   * getDynamicTrailingPct() to adjust the decay rate based on momentum
   * direction. Cached so runExitCheck (1-min poll, no analyzer context)
   * + syncBrokerStops can also benefit from momentum-aware behavior.
   */
  rsi?: number;
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
  brokerPositions: { symbol: string; qty: number; avgEntryPrice: number; currentPrice: number; marketValue?: number }[],
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
      // Phase 2 (UI-lie audit fix): if qty dropped meaningfully (partial
      // close on broker), reset peakPrice to currentPrice. The dynamic
      // trail % is anchored to peakPrice; a stale peak from the larger
      // position would make the trail too loose for the remaining qty.
      // Threshold 5% — small enough to catch genuine partial closes,
      // big enough to not flap on rebalancing oddities.
      const qtyDroppedMaterially =
        existing.qty > 0 && bp.qty > 0 && bp.qty / existing.qty < 0.95;
      if (existing.qty !== bp.qty) {
        log.info({ symbol: bp.symbol, oldQty: existing.qty, newQty: bp.qty }, "Position qty changed on broker");
        existing.qty = bp.qty;
        if (qtyDroppedMaterially) {
          log.info(
            { symbol: bp.symbol, oldPeak: existing.peakPrice, newPeak: bp.currentPrice },
            "Resetting peakPrice — qty dropped >5%, trail recalibrating from current price"
          );
          existing.peakPrice = bp.currentPrice;
        }
      }
      // Phase 2 (UI-lie audit fix): re-resolve strategy params each sync
      // so strategy edits (trailingStopPct, takeProfitPct) propagate to
      // existing positions instead of being frozen at entry-time values.
      try {
        const strategy = await resolveStrategy(userId, bp.symbol);
        if (existing.trailingStopPct !== strategy.trailingStopPct) {
          log.debug(
            { symbol: bp.symbol, old: existing.trailingStopPct, new: strategy.trailingStopPct },
            "Refreshing trailingStopPct from current strategy"
          );
          existing.trailingStopPct = strategy.trailingStopPct;
        }
        // takeProfit is a fixed target (not trailing). When the strategy's
        // takeProfitPct changes, recompute from entryPrice so existing
        // positions reflect the new target.
        const refreshedTakeProfit = existing.entryPrice * (1 + strategy.takeProfitPct);
        if (Math.abs(existing.takeProfit - refreshedTakeProfit) > 0.01) {
          existing.takeProfit = refreshedTakeProfit;
        }
      } catch {
        // Strategy lookup failure non-blocking — keep the existing values
      }
      // Update peak price tracking (after potential reset)
      existing.peakPrice = Math.max(existing.peakPrice, bp.currentPrice);
      // Phase 4 — keep last-known live price + market value for the sector
      // exposure cap so we don't need an extra broker call per BUY decision.
      existing.currentPrice = bp.currentPrice;
      existing.marketValue = bp.marketValue;
    } else {
      // New position discovered on broker — add with conservative defaults
      const strategy = await resolveStrategy(userId, bp.symbol);
      positionMap.set(bp.symbol, {
        symbol: bp.symbol,
        qty: bp.qty,
        entryPrice: bp.avgEntryPrice,
        peakPrice: Math.max(bp.currentPrice, bp.avgEntryPrice),
        currentPrice: bp.currentPrice,
        marketValue: bp.marketValue,
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

        // Journal v2 — phase 1: when a trade reconciles to FILLED,
        // auto-create a journal stub pre-filled with the trade
        // mechanics. User just adds the WHY. Idempotent via partial
        // unique index — re-runs no-op. Never throws.
        if (newStatus === "FILLED") {
          void createAutoJournalStub({
            userId,
            traderTradeId: row.id,
            symbol: row.symbol,
            action: row.action,
            signal: row.signal,
            quantity: row.quantity,
            fillPrice: newFillPrice,
            pnl: newPnl,
          });
        }
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
  // Phase 3 — mark scan as in-flight so dashboard can show "scanning…"
  engine.scanStartedAt = new Date();
  try { SCAN_UNIVERSE = await getSP500Symbols(); } catch { /* keep current */ }

  // Adaptive mode: refresh effectiveMode + regime before per-symbol logic.
  // No-op when engine.mode !== "adaptive".
  await refreshAdaptiveMode(engine);

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

  // Daily-loss halt — same enforcement as runScan(). The 2026-05-16
  // cross-check audit caught that tactical paths reset the counter
  // each day but never compared against the threshold.
  if (await enforceDailyLossHalt(engine, client, today)) return;

  // Phase 1 (UI-lie audit fix): re-snapshot bootEquity at every new trading
  // day so the 50% equity-collapse tripwire stays calibrated as the
  // account organically grows over weeks/months. Without this, a 5%
  // drawdown against an old high-water-mark bootEquity could trip the
  // tripwire on a perfectly healthy account.
  if (engine.boot && engine.bootEquitySnapshotDate !== today) {
    log.info(
      {
        userId: engine.userId,
        oldBootEquity: engine.boot.equity,
        newBootEquity: account.equity,
        date: today,
      },
      "Re-snapshotting bootEquity at new-trading-day boundary"
    );
    engine.boot.equity = account.equity;
    engine.bootEquitySnapshotDate = today;
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
    engine.scanStartedAt = null; // scan ended (errored out)
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
    // Broker reachable — keep brokerConnected fresh so the watchdog doesn't
    // false-alarm. runScan does this inline; the tactical paths historically
    // didn't, leaving brokerConnected stuck at its `false` init forever.
    setBrokerConnected(engine, true, "runTacticalScan_getPositions");
    engine.lastBrokerContact = new Date();
    engine.consecutiveBrokerFailures = 0;
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
  // Same duplicate-order protection as runScan: if getOrders fails, abort
  // before the BUY/ENTRY branch can fire blind.
  let openOrdersFetchOk = true;
  try {
    // status="open" is mandatory: without it Alpaca defaults to "all" and the
    // 100 most-recent orders on a churn-heavy account are dominated by
    // filled/cancelled rows, hiding the open buys we need to dedup against.
    // That blind spot caused the WDC 3-pending incident on 2026-05-26.
    const openOrders = await client.getOrders(100, "open");
    for (const o of openOrders) {
      if (!["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)) continue;
      if (o.side === "buy") pendingBuySymbols.add(o.symbol);
      else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") {
        pendingSellSymbols.add(o.symbol);
      }
    }
  } catch (err) {
    openOrdersFetchOk = false;
    const msg = err instanceof Error ? err.message : "unknown";
    log.warn({ err: msg, userId: engine.userId }, "Tactical getOrders failed — aborting scan to avoid duplicate-order risk");
    pushError(engine, `getOrders failed: ${msg} — tactical scan aborted (duplicate-order protection)`);
  }
  if (!openOrdersFetchOk) {
    engine.lastScanAt = new Date();
    engine.scanStartedAt = null;
    return;
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
        const gate = await canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity, account);
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

  // Update status — scan completed, clear in-flight marker
  engine.lastScanAt = new Date();
  engine.scanCount++;
  engine.scanStartedAt = null;
  await updateHeartbeat(SCAN_UNIVERSE, engine.userId);

  // Ratchet/place protective broker stops — same per-scan reconciliation runScan
  // does. Without this, tactical stops only ever get set once by placeDisasterStops
  // at engine start and never move (and mid-run positions get none).
  await syncBrokerStops(engine.userId);
}

// ─── Tactical Smart: SPY trend + screener-weighted entries ──────────────────

async function runTacticalSmartScan(engineUserId?: string): Promise<void> {
  const engine = getEngine(engineUserId);
  if (!engine.userId || !engine.running || engine.halted) return;
  if (!isMarketOpen()) return;
  engine.scanStartedAt = new Date();
  // Adaptive mode refresh — runs even on the tactical-smart scan path so
  // adaptive engines stay calibrated regardless of which scan loop invokes.
  await refreshAdaptiveMode(engine);

  // Phase 14 — scan latency instrumentation. The 2026-05-11 TGT incident
  // happened because a scan started before 4 PM ET but was still placing
  // market orders at 4:10 PM. Track key phases so we can spot a slow scan
  // before Phase 10's per-order isMarketOpen guard catches it.
  const scanStartedAt = Date.now();
  const phases: Record<string, number> = {};
  const phase = (name: string) => { phases[name] = Date.now() - scanStartedAt; };

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

  // Daily-loss halt — same enforcement as runScan(). The 2026-05-16
  // cross-check audit caught that tactical-smart reset the counter
  // each day but never compared against the threshold.
  if (await enforceDailyLossHalt(engine, client, today)) return;

  // Phase 1 — re-snapshot bootEquity at every new trading day
  if (engine.boot && engine.bootEquitySnapshotDate !== today) {
    engine.boot.equity = account.equity;
    engine.bootEquitySnapshotDate = today;
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

  phase("spyAnalysis");
  let currentPositions: BrokerPosition[];
  try {
    currentPositions = await client.getPositions();
    // Broker reachable — keep brokerConnected fresh so the watchdog doesn't
    // false-alarm ("Broker unreachable (0 consecutive failures)"). This path
    // never set it, so it stayed at its `false` init for the whole session.
    setBrokerConnected(engine, true, "runTacticalSmartScan_getPositions");
    engine.lastBrokerContact = new Date();
    engine.consecutiveBrokerFailures = 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error({ err: msg, userId: engine.userId }, "Tactical-smart scan aborted — getPositions failed");
    pushError(engine, `Broker getPositions failed: ${msg}`);
    return;
  }
  phase("getPositions");
  await syncPositionMapFromBroker(currentPositions, positionMap, engine.userId!, client);
  await reconcilePendingTrades(client, engine.userId!);
  phase("syncAndReconcile");
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
  // Same duplicate-order protection as runScan + runTacticalScan: abort if
  // we can't see the broker's pending-order list.
  let openOrdersFetchOk = true;
  try {
    // status="open" is mandatory: without it Alpaca defaults to "all" and the
    // 100 most-recent orders on a churn-heavy account are dominated by
    // filled/cancelled rows, hiding the open buys we need to dedup against.
    // That blind spot caused the WDC 3-pending incident on 2026-05-26.
    const openOrders = await client.getOrders(100, "open");
    for (const o of openOrders) {
      if (!["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status)) continue;
      if (o.side === "buy") {
        pendingBuySymbols.add(o.symbol);
      } else if (o.side === "sell" && o.type !== "stop" && o.type !== "stop_limit") {
        // Stop orders are protective — managed by syncBrokerStops, NOT a duplicate of an active sell intent
        pendingSellSymbols.add(o.symbol);
      }
    }
  } catch (err) {
    openOrdersFetchOk = false;
    const msg = err instanceof Error ? err.message : "unknown";
    log.warn({ err: msg, userId: engine.userId }, "Tactical-smart getOrders failed — aborting scan to avoid duplicate-order risk");
    pushError(engine, `getOrders failed: ${msg} — tactical-smart scan aborted (duplicate-order protection)`);
  }
  if (!openOrdersFetchOk) {
    engine.lastScanAt = new Date();
    engine.scanStartedAt = null;
    return;
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

    // Score all stocks in universe + top-confidence screener externals
    // (capped — see TACTICAL_MAX_EXTERNAL_SYMBOLS). The full screener
    // feed can exceed 500 symbols on busy days; iterating all of them
    // at Finnhub rate limits hung scans indefinitely (2026-05-26).
    const extSymbols = selectExternalSymbolsForTactical(engine.externalSignals, SCAN_UNIVERSE);
    const allSymbols = [...SCAN_UNIVERSE, ...new Set(extSymbols)];

    // #5: Score using momentum + signals + screener + #6: inverse volatility
    const scored: { symbol: string; score: number; price: number; invVol: number }[] = [];

    let symbolsAbortedForBudget = 0;
    for (const symbol of allSymbols) {
      // Wall-clock budget guard — once exceeded, break out so the scan
      // can still finish syncBrokerStops + heartbeat at the tail.
      if (Date.now() - scanStartedAt > TACTICAL_SCAN_SYMBOL_BUDGET_MS) {
        symbolsAbortedForBudget = allSymbols.length - allSymbols.indexOf(symbol);
        break;
      }
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

    if (symbolsAbortedForBudget > 0) {
      log.warn(
        {
          budgetMs: TACTICAL_SCAN_SYMBOL_BUDGET_MS,
          aborted: symbolsAbortedForBudget,
          evaluated: allSymbols.length - symbolsAbortedForBudget,
          scored: scored.length,
        },
        "Tactical Smart buy-in loop aborted on budget — proceeding with partial candidates"
      );
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
        const gate = await canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity, account);
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
    phase("initialBuyIn");

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

    // Score all stocks (same logic as entry) — capped screener feed
    // applies here too. See selectExternalSymbolsForTactical for context.
    const extSymbols = selectExternalSymbolsForTactical(engine.externalSignals, SCAN_UNIVERSE);
    const allSymbols = [...SCAN_UNIVERSE, ...new Set(extSymbols)];

    const candidates: { symbol: string; signal: string; score: number; price: number; invVol: number }[] = [];
    const weakHeld: { symbol: string; signal: string; pnlPct: number }[] = [];

    let activeMgmtAborted = 0;
    for (const symbol of allSymbols) {
      // Wall-clock budget guard — same rationale as the buy-in loop above.
      // Active management is the loop that actually hung in the 2026-05-26
      // incident (most scans hit this branch because positions are held).
      if (Date.now() - scanStartedAt > TACTICAL_SCAN_SYMBOL_BUDGET_MS) {
        activeMgmtAborted = allSymbols.length - allSymbols.indexOf(symbol);
        break;
      }
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

    if (activeMgmtAborted > 0) {
      log.warn(
        {
          budgetMs: TACTICAL_SCAN_SYMBOL_BUDGET_MS,
          aborted: activeMgmtAborted,
          evaluated: allSymbols.length - activeMgmtAborted,
          candidates: candidates.length,
          weakHeld: weakHeld.length,
        },
        "Tactical Smart active-management loop aborted on budget — proceeding with partial candidates"
      );
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
        const gate = await canPlaceBuyOrder(engine, replacement.symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity, account);
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
        const gate = await canPlaceBuyOrder(engine, cand.symbol, buyNotional, riskLimits, engine.boot?.equity ?? equity, account);
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
      phase("activeManagement");
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
  engine.scanStartedAt = null;
  await updateHeartbeat([...positionMap.keys()], engine.userId);

  // Ratchet/place protective broker stops — same per-scan reconciliation runScan
  // does. This call was missing from the tactical-smart path, so stops only ever
  // got set once by placeDisasterStops at engine start: they never ratcheted up,
  // and positions opened mid-run got no broker stop at all.
  await syncBrokerStops(engine.userId);

  // Phase 14 — emit total scan duration. If totalMs >> 60s, the scan is at
  // risk of crossing market-close boundary on a 15-min cadence. Log warn so
  // the operator notices.
  const totalMs = Date.now() - scanStartedAt;
  if (totalMs > 60_000) {
    log.warn({ totalMs, phases }, "Tactical-smart scan took >60s — investigate broker API latency or signal compute time");
  } else {
    log.debug({ totalMs, phases }, "Tactical-smart scan timing");
  }
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

  // Phase 3 — mark scan as in-flight
  engine.scanStartedAt = new Date();
  // Adaptive mode refresh (intraday scan path).
  await refreshAdaptiveMode(engine);

  if (!engine.userId) {
    log.error("No userId set on engine");
    pushError(engine, "No userId configured");
    return;
  }

  if (!isMarketOpen()) {
    log.debug("Market closed, skipping scan");
    return;
  }

  // Intraday-mode 3 PM ET flatten removed alongside the intraday mode
  // itself. All remaining modes hold across the session and exit via
  // stops, trail, take-profit, or SPY regime.

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

  // Phase 1 — re-snapshot bootEquity at every new trading day so the
  // 50% equity-collapse tripwire stays calibrated as the account grows.
  if (engine.boot && engine.bootEquitySnapshotDate !== today) {
    engine.boot.equity = account.equity;
    engine.bootEquitySnapshotDate = today;
  }

  // Load dynamic risk limits from user's Risk Profile
  const riskLimits = await loadRiskLimits(engine.userId);
  engine.dailyLossLimit = riskLimits.dailyLossPct;

  // 2. Daily-loss halt — shared helper, runs in every scan path so the
  //    cap can't be bypassed by mode.
  if (await enforceDailyLossHalt(engine, client, today)) return;

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

  // Load optimized signal params for "optimized" mode (tuned EMA/RSI from GA).
  // Adaptive's effective mode collapses to "optimized" when regime warrants —
  // getActiveMode lets adaptive users inherit the GA params automatically.
  const optSignalParams = getActiveMode(engine) === "optimized" ? await getOptimizedSignalParams() : null;
  // Tier-aware hybrid options (Phase E3):
  //   - Free shouldn't reach here (server gates engine start); fallback to trader
  //     pipeline if somehow reached
  //   - Trader: Finnhub layers (sentiment/options/analyst) ON, AI scoring OFF
  //   - Premium+: everything ON (default — no overrides)
  // The hybrid pipeline defaults read HYBRID_CONFIG which has AI scoring on;
  // we only override to OFF for non-Premium users to skip the Groq call.
  const isPremium = userHasTier(engine.userTier ?? "trader", "premium");
  const hybridOpts: import("@/types").HybridPipelineOptions | undefined =
    !isPremium || optSignalParams
      ? {
          ...(optSignalParams ? { signalParams: optSignalParams } : {}),
          ...(isPremium ? {} : { enableAiScoring: false }),
        }
      : undefined;

  // 4. Get current broker positions + run live-trading safeguard checks
  let brokerPositions: Awaited<ReturnType<BrokerClient["getPositions"]>> = [];
  try {
    brokerPositions = await client.getPositions();
    setBrokerConnected(engine, true, "runScan_getPositions");
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
      setBrokerConnected(engine, false, "runScan_consecutive_failures_threshold");
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
  //
  // When this fetch fails we LOSE the cross-scan duplicate-order protection:
  // every BUY branch in the scan loop consults pendingBuySymbols to avoid
  // double-buying a symbol whose previous order is still queued at the
  // broker. Silently swallowing the error (the pre-fix behavior) is how we
  // ended up with two SNDK buy limits stacked in Open Orders. To keep the
  // scan from going blind on a transient broker hiccup, we now abort the
  // BUY portion of the scan when this fetch fails. Exits + position-map
  // sync already happened above, so we can return safely without breaking
  // stop-loss management.
  const pendingBuySymbols = new Set<string>();
  const pendingSellSymbols = new Set<string>();
  const pendingOrdersBySymbol = new Map<string, { id: string; side: string; type: string }[]>();
  let openOrdersFetchOk = true;
  try {
    // status="open" is mandatory: without it Alpaca defaults to "all" and the
    // 100 most-recent orders on a churn-heavy account are dominated by
    // filled/cancelled rows, hiding the open buys we need to dedup against.
    // That blind spot caused the WDC 3-pending incident on 2026-05-26.
    const openOrders = await client.getOrders(100, "open");
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
  } catch (err) {
    openOrdersFetchOk = false;
    const msg = err instanceof Error ? err.message : "unknown";
    log.warn({ err: msg, userId: engine.userId }, "getOrders failed — aborting scan to avoid duplicate-order risk");
    pushError(engine, `getOrders failed: ${msg} — scan aborted (duplicate-order protection)`);
  }
  if (!openOrdersFetchOk) {
    engine.lastScanAt = new Date();
    engine.scanStartedAt = null;
    return;
  }

  let realizedPnlThisScan = 0;
  let tradesThisScan = 0;

  // Build sector-exposure context once before the loop (was previously
  // rebuilt per-symbol — Phase 4 audit caught the regression).
  // The position-map snapshot is fine for the full scan because BUYs
  // placed mid-scan don't get reflected on the broker until the next
  // sync anyway; checking against a slightly-stale view is acceptable
  // and saves a Map rebuild per symbol.
  const scanSectorCtx = buildSectorExposureContext(engine.userId!, equity);

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
        // v2 trail dynamism — refresh per-symbol ATR + RSI on each scan
        // so the trail width adapts as volatility AND momentum change.
        // ATR/RSI availability is best-effort; getDynamicTrailingPct
        // falls back to the legacy fixed-% formula when atr/vix/rsi are
        // absent.
        const indicators = analysis.indicators as unknown as Record<string, number | null | undefined>;
        const heldAtr = indicators.atr_14;
        if (typeof heldAtr === "number" && heldAtr > 0) {
          heldPosition.atr = heldAtr;
        }
        const heldRsi = indicators.rsi_14;
        if (typeof heldRsi === "number" && heldRsi >= 0 && heldRsi <= 100) {
          heldPosition.rsi = heldRsi;
        }
        const regimeVix = engine.adaptiveRegime?.vix;

        const strategy = await resolveStrategy(engine.userId, symbol);
        const dynTrail = getDynamicTrailingPct(
          heldPosition.entryPrice,
          heldPosition.peakPrice,
          strategy.trailingStopPct,
          {
            atr: heldPosition.atr,
            vix: regimeVix,
            rsi: typeof heldRsi === "number" ? heldRsi : undefined,
            currentPrice,
          }
        );
        const trailingStopPrice =
          heldPosition.peakPrice * (1 - dynTrail);
        const tradingDays = tradingDaysBetween(heldPosition.entryDate, new Date());

        let shouldExit = false;
        let exitReason = "";

        // v3 breakeven-promote (tiered ladder). Mutates
        // heldPosition.stopLoss in place so the stop-loss check below
        // sees the promoted value, and syncBrokerStops on this scan
        // propagates it to the broker. Ladder mode resolves from
        // engine's active mode — see MODE_LADDER_DEFAULT.
        const ladderMode = getBreakevenLadderMode(getActiveMode(engine));
        if (maybePromoteBreakeven(heldPosition, currentPrice, ladderMode)) {
          log.info(
            {
              symbol,
              newStopLoss: heldPosition.stopLoss,
              entry: heldPosition.entryPrice,
              currentPrice,
              ladderMode,
            },
            "Breakeven promoted (main scan)"
          );
        }

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
        // Adaptive TP: use ATR × multiplier from optimizer if available, else fixed %.
        // (Naming overlap: this "adaptive TP" predates the "adaptive engine
        // mode" — separate concept. Active mode is used for the gate.)
        const tpAtrMult = getActiveMode(engine) === "optimized" ? await getOptimizedTpAtrMult() : null;
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
        const gate = await canPlaceBuyOrder(engine, symbol, buyNotional, riskLimits, bootEquity, account, scanSectorCtx ?? undefined);
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

          // Track position in memory.
          // Capture ATR at entry — v2 dynamic-trail formula uses ATR as
          // the per-stock base trail width. Refreshed on each subsequent
          // scan in the held-position branch below.
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
            atr: atrVal ?? undefined,
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

  // 7. Update engine state — scan completed, clear in-flight marker
  engine.lastScanAt = new Date();
  engine.scanCount++;
  engine.scanStartedAt = null;
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
  // Reachability proof captured — set brokerConnected immediately so the
  // watchdog doesn't false-alarm in the window between startEngine and the
  // first scan body reaching its own setter. Previously this assignment
  // only lived inside the scan loops, so a fresh engine with running=true
  // but no completed scan would trigger "Broker unreachable (0 consecutive
  // failures)" every 15 min until the first scan completed.
  setBrokerConnected(engine, true, "startEngine_getAccount");
  engine.lastBrokerContact = new Date();
  engine.consecutiveBrokerFailures = 0;

  // Intraday mode startup PDT-refusal removed alongside the intraday
  // mode itself. PDT state is still evaluated per-scan by
  // evaluatePdtState — that path now applies uniformly to all modes
  // (blocking BUYs when PDT-vulnerable and day-trade-count >= 3).

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
  // Capture tier at boot so the hybrid pipeline knows which layers to
  // run. Premium gets AI scoring; Trader gets Finnhub but no AI;
  // free shouldn't reach here (server gate blocks engine start) but
  // we treat as 'trader' if somehow we get a free user — fail-conservative.
  engine.userTier = await getUserTier(userId);
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
  engine.bootEquitySnapshotDate = getETDateString();
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

  // Intraday-mode scan resolution removed alongside the intraday mode.
  // All remaining modes use the swing scan cadence + daily bars; the
  // 5m-bar code path that drove intraday is gone too.
  const scanIntervalMs = SWING_SCAN_MS;
  const barResolution = "1d" as const;

  log.info({ userId, mode, scanIntervalMs }, "Trading engine started");

  // Pick the right scan function based on mode — capture userId in closure
  const scanFn = mode === "tactical" ? () => runTacticalScan(userId)
    : mode === "tactical-smart" ? () => runTacticalSmartScan(userId)
    : () => runScan(barResolution, userId);

  // Re-entrancy guard for the scan scheduler.
  //
  // Why: bare setInterval(() => scanFn().catch()) lets a new scan tick fire
  // while the previous scan is still in flight. When that happens, BOTH scans
  // independently call client.getOrders() to build pendingBuySymbols — and if
  // the first scan's order hasn't registered with the broker yet (Alpaca has
  // ~hundreds-of-ms eventual consistency on the orders endpoint), the second
  // scan sees an empty pending list and re-fires the same buy. Result: two
  // identical limit orders queued ~ms apart, both showing the same "Xh ago"
  // age in the UI. This is exactly the SNDK duplicate-order bug reported.
  //
  // Fix: a closure-local flag flipped before scanFn() and cleared in the
  // .finally() of the promise. .finally() guarantees the flag clears even if
  // scanFn throws — robust against bugs inside the scan body.
  //
  // Safety net: a stale-flag watchdog. If for some reason .finally() doesn't
  // run (process crash mid-promise, runtime weirdness), STALE_SCAN_MS
  // overrides the flag so we never wedge the scheduler forever. 10 minutes
  // is well past any realistic legitimate scan duration (95th percentile
  // ~30s, worst observed ~90s) but short enough that a wedged engine
  // self-recovers within the next two intraday ticks.
  let scanInFlight = false;
  let scanInFlightSince = 0;
  const STALE_SCAN_MS = 10 * 60 * 1000;
  const runScanGuarded = (origin: string): Promise<void> | undefined => {
    if (scanInFlight) {
      const ageMs = Date.now() - scanInFlightSince;
      if (ageMs < STALE_SCAN_MS) {
        log.warn({ userId, origin, ageMs }, "Skipping scan tick — previous scan still in flight");
        return undefined;
      }
      log.error({ userId, origin, ageMs }, "Previous scan flagged in-flight for >10min — overriding flag (likely crashed)");
    }
    scanInFlight = true;
    scanInFlightSince = Date.now();
    return scanFn()
      .catch((err) => {
        log.error({ err: err instanceof Error ? err.message : "unknown", origin }, `${origin} scan failed`);
        pushError(engine, `${origin} scan failed: ${err instanceof Error ? err.message : "unknown"}`);
      })
      .finally(() => {
        scanInFlight = false;
        scanInFlightSince = 0;
      });
  };

  // Run initial scan immediately (will skip if market is closed)
  runScanGuarded("initial");

  // If market is not yet open, schedule a scan at exactly 9:30 AM ET
  const msToOpen = msUntilMarketOpen();
  if (msToOpen > 0) {
    log.info({ userId, msToOpen, minutesToOpen: Math.round(msToOpen / 60000) }, "Market closed — scheduling scan at next open");
    engine.marketOpenTimeoutId = setTimeout(() => {
      if (!engine.running || engine.halted) return;
      engine.marketOpenTimeoutId = null;
      log.info({ userId }, "Market just opened — running scheduled scan");
      runScanGuarded("market-open");
    }, msToOpen);
  }

  // Set up scan interval
  engine.intervalId = setInterval(() => {
    if (!engine.running) return;
    runScanGuarded("tick");
  }, scanIntervalMs);

  // 1-minute exit checks run in EVERY mode — uses live fetchQuote() to update
  // peakPrice and trigger trail/stop exits. The 15-min main scan is too slow
  // to track intraday peaks in swing modes (analysis.price = yesterday's close
  // on 1d bars), which is why trailing stops only moved on engine restart before
  // this fix.
  //
  // Same re-entrancy guard rationale as the main scan. Exit checks place
  // market sells (not limit buys), so the symptom on overlap is different
  // — a single position can get hit by two sell orders if the trail trigger
  // fires twice before the broker reflects the first sell. The
  // pendingSellSymbols guard inside runExitCheck normally catches this, but
  // belt-and-suspenders is cheap.
  let exitCheckInFlight = false;
  let exitCheckInFlightSince = 0;
  engine.exitCheckId = setInterval(() => {
    if (!engine.running || engine.halted) return;
    if (exitCheckInFlight) {
      const ageMs = Date.now() - exitCheckInFlightSince;
      if (ageMs < STALE_SCAN_MS) {
        log.debug({ userId, ageMs }, "Skipping exit check tick — previous still in flight");
        return;
      }
      log.error({ userId, ageMs }, "Previous exit check flagged in-flight for >10min — overriding flag");
    }
    exitCheckInFlight = true;
    exitCheckInFlightSince = Date.now();
    runExitCheck(userId)
      .catch((err) => {
        log.error({ err: err instanceof Error ? err.message : "unknown" }, "Exit check failed");
      })
      .finally(() => {
        exitCheckInFlight = false;
        exitCheckInFlightSince = 0;
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
 * Centralized brokerConnected mutation with diagnostic logging. Every
 * transition logs userId + from/to + source so future "watchdog keeps
 * firing broker_disconnect even though scans succeed" incidents leave
 * a forensic trail in journald (the 2026-05-26 mystery — the running
 * tactical-smart engine's broker_disconnect alert fired 96 times in
 * 24h, yet "Tactical Smart scan" log lines indicated the scan body
 * was reaching the brokerConnected=true assignment every cycle).
 *
 * Idempotent — no log line when value already matches, so the helper
 * is safe to call defensively at every reachability proof point.
 */
function setBrokerConnected(
  engine: EngineState,
  value: boolean,
  source: string
): void {
  if (engine.brokerConnected === value) return;
  log.info(
    { userId: engine.userId, from: engine.brokerConnected, to: value, source },
    "engine.brokerConnected transition"
  );
  engine.brokerConnected = value;
}

/**
 * Wall-clock budget for the heavy per-symbol analysis loops inside
 * runTacticalSmartScan. Once exceeded, the loops break early and the
 * scan proceeds to its tail (syncBrokerStops + heartbeat). 8 min sits
 * comfortably under the 10-min "previous scan likely crashed" override
 * and the 15-min SWING_SCAN_MS cadence — a scan that hits the budget
 * still finishes its protective work before the next tick fires.
 *
 * Motivated by the 2026-05-26 incident: ~500 screener-fed symbols × 1s
 * (Finnhub-rate-limited) per analyzeHybrid = scans hung indefinitely,
 * never reached syncBrokerStops, broker stops frozen for the session.
 */
const TACTICAL_SCAN_SYMBOL_BUDGET_MS = 8 * 60 * 1000;

/**
 * Hard cap on externally-fed symbols evaluated per tactical-smart scan.
 * SCAN_UNIVERSE (~30 hardcoded symbols) is always evaluated; the screener
 * feed adds the top-N highest-confidence BUY/STRONG_BUY symbols beyond
 * that. 50 was chosen so the worst-case loop ((30 + 50) × ~1s) fits
 * inside the budget with margin. The cap is intentionally on the
 * external-signal *count*, not on confidence threshold — we still want
 * the very best non-universe candidates regardless of universe size.
 */
const TACTICAL_MAX_EXTERNAL_SYMBOLS = 50;

/**
 * Filter + cap external signals to the top-N highest-confidence
 * BUY/STRONG_BUY symbols not already in SCAN_UNIVERSE. Centralizes the
 * inline logic that appeared twice in runTacticalSmartScan (initial
 * buy-in path + active-management path) so both apply the same cap.
 */
function selectExternalSymbolsForTactical(
  externalSignals: readonly ExternalSignal[],
  universe: readonly string[],
  maxCount: number = TACTICAL_MAX_EXTERNAL_SYMBOLS
): string[] {
  const universeSet = new Set(universe);
  // Filter to actionable signals not already in the hardcoded universe,
  // then sort by confidence desc, then take top N. Confidence comes
  // straight from the screener / hybrid pipeline.
  return externalSignals
    .filter((s) => (s.signal === "BUY" || s.signal === "STRONG_BUY") && !universeSet.has(s.symbol))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxCount)
    .map((s) => s.symbol);
}

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

  // v2 trail dynamism — pull current VIX from the engine's adaptive regime
  // snapshot if available. The cached snapshot is up to ~scan-interval
  // stale, which is fine for a per-scan stop refresh.
  const engine = getEngine(userId);
  const regimeVix = engine.adaptiveRegime?.vix;

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

      // Compute dynamic trailing stop. ATR + RSI are cached on the
      // position by the main scan loop (refreshed every scan when
      // indicators are computed). VIX comes from the adaptive-regime
      // snapshot. All optional — getDynamicTrailingPct falls back to
      // legacy fixed-% when any are absent.
      //
      // We deliberately skip currentPrice here — syncBrokerStops sets
      // the resting stop order at the broker, not an exit decision based
      // on a live price tick. The drawdown-tightening logic only makes
      // sense in the exit-decision context (runExitCheck + main scan).
      const strategy = await resolveStrategy(userId, symbol);
      const dynTrailPct = getDynamicTrailingPct(
        pos.entryPrice,
        pos.peakPrice,
        strategy.trailingStopPct,
        { atr: pos.atr, vix: regimeVix, rsi: pos.rsi }
      );
      const trailStop = pos.peakPrice * (1 - dynTrailPct);
      // v3 — use pos.stopLoss as the fixed-stop floor instead of
      // recomputing from entryPrice * (1 - strategy.stopLossPct).
      // pos.stopLoss carries:
      //   - the entry-time floor (initialized at entry)
      //   - any breakeven promotion from runExitCheck / main scan exit
      //   - any prior broker-stop ratchet from this function
      // Recomputing would silently undo all three.
      const targetStop = Math.max(pos.stopLoss, trailStop);

      // No stop on broker yet (e.g., position opened mid-run, before any stop/start cycle).
      // Place one now so the position has protection if the server crashes.
      if (!existing) {
        try {
          await placeEngineOrder(client, {
            symbol, side: "sell", qty: String(pos.qty),
            type: "stop", timeInForce: "gtc", stopPrice: targetStop.toFixed(2),
          });
          // Sync in-memory stopLoss so the dashboard reads the actual live
          // stop, not the original disaster-stop value
          pos.stopLoss = targetStop;
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

      // Reconcile in-memory stopLoss with the actual broker stop even when
      // we're not pushing an update — the broker might have a more recent
      // value than our memory if a previous run placed/replaced it and we
      // restarted, or if pos.stopLoss was initialized to the original
      // disaster level and never overwritten.
      if (existing.stopPrice > pos.stopLoss) {
        pos.stopLoss = existing.stopPrice;
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
        // Sync in-memory after a successful broker update
        pos.stopLoss = targetStop;
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
      // status="open" — same Alpaca default-status trap as the per-scan guards.
      // Without it, a still-pending cancel can be hidden behind filled noise
      // and we'd return early thinking the broker is clean.
      const orders = await client.getOrders(100, "open");
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
  let lastPositionCount = -1; // -1 = never observed (e.g., broker resolve failed)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resolved = await resolveBrokerClient(userId);
      if (!resolved) return; // no broker connection — not transient, nothing to retry

      const positions = await resolved.client.getPositions();
      lastPositionCount = positions.length;
      if (positions.length === 0) return;

      let lastMode: EngineMode = "optimized";
      try {
        const [status] = await db.select().from(traderStatus).where(eq(traderStatus.userId, userId)).limit(1);
        if (status?.mode?.startsWith("paper:")) {
          const parts = status.mode.split(":");
          const savedMode = parts.length > 1 ? (parts[1] as EngineMode) : null;
          const validModes: EngineMode[] = ["conservative", "moderate", "optimized", "aggressive", "tactical", "tactical-smart", "adaptive"];
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

  const errMsg = lastErr instanceof Error ? lastErr.message : "unknown";
  log.error(
    { userId, attempts: maxAttempts, err: errMsg, positionCount: lastPositionCount },
    "Auto-start failed after all retries — engine will not resume until manually started"
  );
  // Hash-chained audit so a post-deploy autostart failure leaves a durable
  // trace (pino logs rotate; the audit table doesn't). Surfaced in the
  // admin audit viewer. positionCount === -1 means the broker resolve itself
  // failed on every attempt and we never observed positions.
  void writeAudit({
    actor: { userId, email: null, role: null },
    action: AuditAction.ENGINE_AUTOSTART_FAILED,
    resourceType: "engine",
    resourceId: userId,
    metadata: {
      attempts: maxAttempts,
      error: errMsg,
      orphanedPositionCount: lastPositionCount,
    },
  });
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
  effectiveMode: EngineMode | null;
  adaptiveRegime: EngineState["adaptiveRegime"];
  lastScanAt: string | null;
  scanStartedAt: string | null;
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
    effectiveMode: engine.effectiveMode,
    adaptiveRegime: engine.adaptiveRegime,
    lastScanAt: engine.lastScanAt?.toISOString() ?? null,
    scanStartedAt: engine.scanStartedAt?.toISOString() ?? null,
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
  effectiveMode: EngineMode | null;
  adaptiveRegime: EngineState["adaptiveRegime"];
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
    effectiveMode: engine.effectiveMode,
    adaptiveRegime: engine.adaptiveRegime,
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

/**
 * Public entry-point for the standalone stop-sync scheduler. Calls
 * syncBrokerStops for a user IF the engine is healthy enough for the
 * sync to be meaningful:
 *   - engine instance exists + is running + not halted
 *   - position map is non-empty (nothing to sync)
 *   - no scan in flight (avoid racing the in-scan sync at the scan tail)
 *
 * Motivated by the "tactical-smart scans hang every cycle" incident on
 * 2026-05-26: syncBrokerStops was coupled to scan completion. When the
 * scan body never returned (hangs in the per-symbol Finnhub-paced
 * analyzer loop), broker stops never updated for the entire session
 * even though the 1-min runExitCheck poll was happily promoting
 * pos.stopLoss in memory. The dedicated 5-min stop-sync scheduler
 * breaks that coupling — see src/lib/stop-sync-scheduler.ts.
 *
 * No-op on missing/stopped/halted/empty engines. Errors inside
 * syncBrokerStops are already logged + swallowed there.
 *
 * Returns {ran: true} when the broker call was actually attempted;
 * {ran: false, reason} when skipped (for scheduler-side log diagnostics).
 */
export async function syncBrokerStopsForUser(
  userId: string
): Promise<{ ran: boolean; reason?: string }> {
  const engine = g.__tradingEngines?.get(userId);
  if (!engine) return { ran: false, reason: "no_engine" };
  if (!engine.running) return { ran: false, reason: "engine_stopped" };
  if (engine.halted) return { ran: false, reason: "engine_halted" };
  const positionMap = g2.__enginePositionMaps?.get(userId);
  if (!positionMap || positionMap.size === 0) {
    return { ran: false, reason: "no_positions" };
  }
  if (engine.scanStartedAt) {
    // Scan in-flight — its own syncBrokerStops at the scan tail will handle
    // this cycle. Don't race with it. NOTE: if a scan has been hung for
    // hours (the incident this whole PR addresses), scanStartedAt stays
    // set until the 10-min override clears it. The scheduler will skip
    // for that long, then fire on the next 5-min tick after the override.
    // That's acceptable — better than racing.
    return { ran: false, reason: "scan_in_flight" };
  }
  await syncBrokerStops(userId);
  return { ran: true };
}
