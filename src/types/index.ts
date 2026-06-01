// ─── Signal Types ──────────────────────────────────────────────────

export enum SignalType {
  STRONG_BUY = "STRONG_BUY",
  BUY = "BUY",
  HOLD = "HOLD",
  SELL = "SELL",
  STRONG_SELL = "STRONG_SELL",
}

// ─── Market Data ──────────────────────────────────────────────────

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSnapshot {
  sma_9: number | null;
  sma_20: number | null;
  sma_50: number | null;
  ema_9: number | null;
  ema_21: number | null;
  ema_50: number | null;
  vwap: number | null;
  vwap_upper_1: number | null;
  vwap_lower_1: number | null;
  rsi_14: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  atr_14: number | null;
  bollinger_upper: number | null;
  bollinger_middle: number | null;
  bollinger_lower: number | null;
}

export interface IndicatorSeries {
  sma_9: (number | null)[];
  sma_20: (number | null)[];
  sma_50: (number | null)[];
  ema_9: (number | null)[];
  ema_21: (number | null)[];
  ema_50: (number | null)[];
  vwap: (number | null)[];
  rsi_14: (number | null)[];
  macd_line: (number | null)[];
  macd_signal: (number | null)[];
  macd_histogram: (number | null)[];
  atr_14: (number | null)[];
  bollinger_upper: (number | null)[];
  bollinger_middle: (number | null)[];
  bollinger_lower: (number | null)[];
}

export interface FibonacciLevel {
  ratio: number;
  label: string;
  price: number;
}

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  swingHighDate: string;
  swingLowDate: string;
  levels: FibonacciLevel[];
}

// ─── Analysis ─────────────────────────────────────────────────────

export interface AnalysisResult {
  symbol: string;
  signal: SignalType;
  confidence: number;
  price: number;
  volume: number;
  indicators: IndicatorSnapshot;
  series: IndicatorSeries;
  bars: Bar[];
  reasons: string[];
  plainEnglish: string;
  timestamp: string;
  timeframe?: "5m" | "1d";
  fibonacci?: FibonacciLevels;
  unusualVolume?: boolean;
  volumeRatio?: number;
}

// ─── Hybrid Signal Engine ────────────────────────────────────────

export interface SentimentLayer {
  source: "news-ai";
  bullishPercent: number;
  bearishPercent: number;
  newsScore: number;
  headlineCount: number;
  adjustment: number;
  reasons: string[];
}

export interface OptionsFlowLayer {
  source: "yahoo";
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  unusualActivity: boolean;
  adjustment: number;
  reasons: string[];
}

export interface AiScoringLayer {
  model: string;
  adjustedSignal: SignalType;
  adjustedConfidence: number;
  reasoning: string;
  tokensUsed: number;
}

export interface AnalystLayer {
  source: "finnhub";
  consensus: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  buyCount: number;
  holdCount: number;
  sellCount: number;
  adjustment: number;
  reasons: string[];
}

export interface HybridSignalResult extends AnalysisResult {
  volumeRatio?: number;
  hybrid: {
    enabled: true;
    technicalConfidence: number;
    technicalSignal: SignalType;
    sentiment?: SentimentLayer;
    optionsFlow?: OptionsFlowLayer;
    analyst?: AnalystLayer;
    aiScoring?: AiScoringLayer;
    pipelineMs: number;
    layers: string[];
  };
}

export interface HybridPipelineOptions {
  enableSentiment?: boolean;
  enableOptionsFlow?: boolean;
  enableAnalyst?: boolean;
  enableAiScoring?: boolean;
  aiScoringTimeout?: number;
  /** Tuned EMA/RSI params from optimizer — omit to use defaults */
  signalParams?: import("@/lib/indicators/analyzer").SignalParams;
}

// ─── Watchlist ────────────────────────────────────────────────────

export interface WatchlistItem {
  id: string;
  symbol: string;
  addedAt: string;
}

// ─── User ─────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

// ─── Discord ──────────────────────────────────────────────────────

export interface DiscordWebhook {
  id: string;
  name: string;
  webhookUrl: string;
  channelName: string | null;
  minSignalStrength: number;
  symbols: string[];
  enabled: boolean;
}

// ─── Feed ─────────────────────────────────────────────────────────

export interface FeedPost {
  id: string;
  userId: string;
  userName: string;
  symbol: string;
  signal: SignalType;
  confidence: number;
  price: number;
  plainEnglish: string;
  comment: string | null;
  createdAt: string;
  likes: number;
  liked: boolean;
}

// ─── Signal Accuracy ──────────────────────────────────────────────

export interface SignalAccuracy {
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  avgReturn: number;
}

// ─── AI Market Intelligence ─────────────────────────────────────────

export interface MarketDigest {
  id: string;
  date: string;
  summary: string;
  generatedAt: string;
  cached: boolean;
  configured: boolean;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatSession {
  sessionId: string;
  firstMessage: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface MarketContext {
  news: { headline: string; summary: string; source: string; datetime: number }[];
  sectorPerformance: { sector: string; avgChange: number; symbols: { symbol: string; changePct: number }[] }[];
  topGainers: { symbol: string; changePct: number; price: number }[];
  topLosers: { symbol: string; changePct: number; price: number }[];
  recentSignals: { symbol: string; signal: string; confidence: number; plainEnglish: string; createdAt: string }[];
  date: string;
}

export interface ChatContext {
  /**
   * Server time when this context was assembled. The LLM treats this as
   * "right now" — every freshness check compares against it.
   */
  currentServerTime: string;
  /** Current US equity market session — gives the LLM a hint about what to expect. */
  marketSession: "pre-market" | "regular" | "post-market" | "closed";
  /**
   * Live SPY + QQQ snapshot for "what is the tape doing right now."
   * Single quote fetch — much fresher than the daily-bar movers list.
   * `null` for either symbol when the provider failed.
   */
  liveTape: {
    spy: { price: number; changePct: number; asOf: string } | null;
    qqq: { price: number; changePct: number; asOf: string } | null;
    fetchedAt: string;
  } | null;
  news: {
    headline: string;
    summary: string;
    /** ISO timestamp; falls back to fetchedAt when source has no per-article time. */
    publishedAt: string;
  }[];
  /** Cached digest with its generation timestamp so the LLM can age-check it. */
  recentDigest: { summary: string; generatedAt: string } | null;
  /**
   * Movers from daily-bar diffs. Inherently end-of-prior-day vs.
   * last-close-or-current — use liveTape for "right now" SPY/QQQ instead.
   */
  topMovers: {
    fetchedAt: string;
    items: { symbol: string; changePct: number }[];
  };
  relevantSignals: {
    symbol: string;
    signal: string;
    plainEnglish: string;
    /** ISO timestamp of signal creation; null when not available. */
    createdAt: string | null;
  }[];
  /**
   * Live quotes for tickers extracted from the user's current question.
   * Authoritative for "right now" per-symbol pricing — same code path as
   * the SPY/QQQ Live Tape. Empty array when no symbols matched or all
   * fetches failed.
   */
  mentionedSymbolQuotes: {
    symbol: string;
    price: number;
    changePct: number;
    asOf: string;
  }[];
  /** Top-K relevant Sentinel education guide snippets for the current query. */
  educationGuides?: {
    slug: string;
    title: string;
    sectionId: string;
    sectionHeading: string;
    snippet: string;
  }[];
}

// ─── Trade Journal ──────────────────────────────────────────────────

export type JournalEntryType =
  | "manual"
  | "auto-trade"
  | "pre-market"
  | "post-market"
  | "weekly-review";

export interface JournalEntry {
  id: string;
  symbol: string;
  title: string;
  notes: string;
  tags: string[];
  mood: string | null;
  rating: number | null;
  portfolioTradeId: string | null;
  traderTradeId: string | null;
  /** Journal-entry type. See JournalEntryType for the catalog. Defaults to "manual" for old rows. */
  type?: JournalEntryType;
  promptDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Saved Strategies ───────────────────────────────────────────────

export interface SavedStrategy {
  id: string;
  name: string;
  description: string | null;
  config: {
    symbol: string;
    days: number;
    holdPeriod: number;
    windowSize?: number;
    stepSize?: number;
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: number;
  };
  lastRunAt: string | null;
  lastResult: unknown;
  createdAt: string;
}

// ─── Symbol Strategies ─────────────────────────────────────────────

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

export interface SymbolStrategy {
  id: string;
  symbol: string;
  presetName: string | null;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
  atrTuned: boolean;
  lastAtr: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRiskProfile {
  id: string;
  accountSize: number | null;
  maxDailyLossPct: number | null;
  maxDrawdownPct: number | null;
  riskTolerance: RiskTolerance | null;
  maxPositionPct: number | null;
  maxPositionSize: number | null;
  maxSingleTradeLoss: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Economic Calendar ──────────────────────────────────────────────

export interface EconomicEvent {
  date: string;
  time: string | null;
  event: string;
  country: string;
  importance: "high" | "medium" | "low";
  category: "fomc" | "cpi" | "jobs" | "gdp" | "earnings" | "other";
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

// ─── Multi-Timeframe Confluence ─────────────────────────────────────

export interface ConfluenceResult {
  symbol: string;
  intraday: { signal: SignalType; confidence: number };
  daily: { signal: SignalType; confidence: number };
  confluenceScore: number;
  status: "confirmed" | "divergent" | "mixed";
  description: string;
}

// ─── Signal Leaderboard ────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  totalShared: number;
  measuredSignals: number;
  correctSignals: number;
  accuracy: number;
  avgReturn: number;
  badge: "gold" | "silver" | "bronze" | null;
}

// ─── P&L Calendar ──────────────────────────────────────────────────

export interface PnlCalendarDay {
  date: string;
  pnl: number;
  tradesCount: number;
  source: "portfolio" | "trader" | "both";
}

// ─── Forum ─────────────────────────────────────────────────────────

export interface ForumCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  threadCount?: number;
}

export interface ForumThread {
  id: string;
  userId: string;
  userName: string;
  categoryId: string;
  categoryName: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  viewCount: number;
  replyCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ForumReply {
  id: string;
  userId: string;
  userName: string;
  threadId: string;
  parentReplyId: string | null;
  body: string;
  createdAt: string;
}

// ─── Social ───────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  userId: string;
  userName: string;
  content: string;
  symbol: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
}

export interface SocialComment {
  id: string;
  userId: string;
  userName: string;
  postId: string;
  content: string;
  createdAt: string;
}

// ─── Education ────────────────────────────────────────────────────

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string | null;
  examples: string[] | null;
  relatedTerms: string[] | null;
}

export interface EducationProgress {
  id: string;
  termId: string;
  viewed: boolean;
  quizScore: number | null;
  viewedAt: string | null;
}

// ─── Tax ──────────────────────────────────────────────────────────

export interface TaxDocument {
  id: string;
  filename: string;
  fileType: string;
  taxYear: number;
  uploadedAt: string;
}

export interface TaxReport {
  id: string;
  taxYear: number;
  reportData: unknown;
  generatedAt: string;
}

export interface HarvestingSuggestion {
  id: string;
  symbol: string;
  suggestion: string;
  potentialSavings: number | null;
  createdAt: string;
}

// ─── Content ──────────────────────────────────────────────────────

export interface Article {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  slug: string;
  body: string;
  category: string | null;
  price: number;
  publishedAt: string | null;
  createdAt: string;
  purchased?: boolean;
}

// ─── Policy ───────────────────────────────────────────────────────

export interface PolicyItem {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  affectedSectors: string[] | null;
  sourceUrl: string | null;
  lastUpdated: string | null;
  createdAt: string;
}

// ─── SEC Filings ──────────────────────────────────────────────────

export interface SecFiling {
  id: string;
  symbol: string;
  filingType: string;
  filedAt: string;
  url: string;
  summary: string | null;
  createdAt: string;
}

// ─── Dashboard ────────────────────────────────────────────────────

export interface DashboardLayout {
  id: string;
  name: string;
  layoutData: unknown;
  isDefault: boolean;
  createdAt: string;
}

// ─── Paper Trading ────────────────────────────────────────────────

export interface PaperTradingConfig {
  id: string;
  name: string;
  strategyConfig: unknown;
  riskConfig: unknown;
  createdAt: string;
}

export interface PaperTradingRun {
  id: string;
  configId: string;
  startedAt: string;
  endedAt: string | null;
  results: unknown;
}
