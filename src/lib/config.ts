export const APP_CONFIG = {
  name: "Beacontry",
  description: "Trading intelligence platform",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export const AUTH_CONFIG = {
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  cookieName: "sentinel-session",
  maxAge: 60 * 60 * 24 * 7, // 7 days
  bcryptRounds: 12,
} as const;

export const MARKET_DATA_CONFIG = {
  provider: process.env.MARKET_DATA_PROVIDER ?? "yahoo",
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? "",
  cacheTtlSeconds: 60,
  maxBarsForAnalysis: 200,
} as const;

export const INDICATOR_DEFAULTS = {
  sma: { windows: [9, 20, 50] },
  ema: { windows: [9, 21, 50] },
  vwap: { bandStdDevs: [1.0, 2.0] },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
} as const;

export const SIGNAL_CONFIG = {
  crossoverLookback: 3,
  volumeConfirmationMultiplier: 1.5,
  volumeAvgWindow: 20,
  unusualVolumeThreshold: 3.0,
} as const;

export const SCREENER_CONFIG = {
  batchSize: 25,
  cacheTtlSeconds: 300,
  maxFilters: 10,
  intradayIntervalMs: 5 * 60 * 1000, // 5 minutes
  marketOpenHour: 9,
  marketOpenMinute: 31,
  marketCloseHour: 16,
  marketCloseMinute: 0,
  timezone: "America/New_York",
} as const;

export const DISCORD_CONFIG = {
  maxWebhooksPerUser: 10,
  rateLimitPerSecond: 2,
} as const;

export const FINNHUB_CONFIG = {
  apiKey: process.env.FINNHUB_API_KEY ?? "",
  rateLimit: 60, // requests per minute (free tier)
  newsCacheTtl: 300, // 5 minutes
  earningsCacheTtl: 3600, // 1 hour
  recommendationsCacheTtl: 3600, // 1 hour
  insiderCacheTtl: 3600, // 1 hour
  socialSentimentCacheTtl: 1800, // 30 minutes
  peersCacheTtl: 86400, // 24 hours
  profileCacheTtl: 86400, // 24 hours
  basicFinancialsCacheTtl: 3600, // 1 hour
  insiderSentimentCacheTtl: 3600, // 1 hour
  financialsReportedCacheTtl: 86400, // 24 hours
} as const;

export const POLLING_INTERVALS = {
  dashboardRefresh: 60_000,
  feedRefresh: 30_000,
  traderDashboard: 10_000,
  optimizerActiveRuns: 3_000,
  screenerCache: 30_000,
  newsRefresh: 300_000,
  postsRefresh: 30_000,
} as const;

export const TRADER_PUSH_CONFIG = {
  url: process.env.TRADER_URL ?? "",
  secret: process.env.TRADER_SECRET ?? "",
  minConfidence: 0.8,
} as const;

export const RS_CONFIG = {
  benchmark: "SPY",
  defaultPeriod: 30,
} as const;

export const HYBRID_CONFIG = {
  sentimentEnabled: process.env.HYBRID_SENTIMENT_ENABLED !== "false",
  optionsFlowEnabled: process.env.HYBRID_OPTIONS_ENABLED !== "false",
  analystEnabled: process.env.HYBRID_ANALYST_ENABLED !== "false",
  aiScoringEnabled: process.env.HYBRID_AI_SCORING_ENABLED === "true",
  aiScoringTimeout: 15000,
  sentimentMaxAdjustment: 0.15,
  optionsMaxAdjustment: 0.10,
  analystMaxAdjustment: 0.08,
  aiMaxConfidenceDelta: 0.20,
} as const;

export const CLAUDE_CONFIG = {
  get apiKey() { return process.env.GROQ_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? ""; },
  model: "llama-3.3-70b-versatile" as const,
  digestMaxTokens: 1500,
  chatMaxTokens: 1000,
  digestRateLimitMs: 60 * 60 * 1000, // 1 hour between user-triggered digests
  chatHistoryLimit: 20,
} as const;
