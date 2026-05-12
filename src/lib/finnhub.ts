import { FINNHUB_CONFIG } from "./config";

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export interface FinnhubNewsArticle {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string;
  category: string;
}

export interface FinnhubEarning {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  hour: string; // "bmo" = before market open, "amc" = after market close
}

export interface FinnhubSentiment {
  symbol: string;
  buzz: { articlesInLastWeek: number; weeklyAverage: number; buzz: number };
  sentiment: { bearishPercent: number; bullishPercent: number };
  companyNewsScore: number;
  sectorAverageBullishPercent: number;
  sectorAverageNewsScore: number;
}

/**
 * One row in Finnhub's earnings-call transcript listing. Full transcript
 * text is paid (`getTranscript(id)` would be a separate paid call); the
 * listing endpoint is free and is what this app uses.
 */
export interface FinnhubTranscriptEntry {
  symbol: string;
  id: string;        // Finnhub-internal id, opaque
  title: string;
  time: string;      // ISO timestamp
  year: number;
  quarter: number;
}

export interface FinnhubTranscriptsResponse {
  symbol: string;
  transcripts: FinnhubTranscriptEntry[];
}

/**
 * One row from Finnhub's Congressional Trading endpoint. Each row is a
 * single Periodic Transaction Report filing by a member of Congress.
 * `amountFrom` / `amountTo` are the lower/upper bounds of the disclosed
 * trade value range (federal disclosure rules require a range, not an
 * exact dollar amount).
 */
export interface FinnhubCongressionalTrade {
  symbol: string;
  transactionDate: string;       // ISO date
  filingDate: string;            // ISO date
  name: string;                  // "Pelosi, Nancy"
  position: string;              // "House" | "Senate"
  ownerType: string;             // "Self" | "Spouse" | "Joint" | "Child"
  amountFrom: number;
  amountTo: number;
  transactionType: string;       // "Purchase" | "Sale" | "Exchange" | "Partial Sale"
  party?: string;                // "Democrat" | "Republican" | "Independent" (when available)
}

export interface FinnhubCongressionalResponse {
  data: FinnhubCongressionalTrade[];
  symbol?: string;
}

export interface FinnhubOptionContract {
  contractName: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expirationDate: string;
  side: "call" | "put";
}

export interface FinnhubOptionChain {
  code: string;
  data: Array<{
    expirationDate: string;
    options: {
      CALL: FinnhubOptionContract[];
      PUT: FinnhubOptionContract[];
    };
  }>;
}

export interface FinnhubRecommendation {
  symbol: string;
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export interface FinnhubInsiderTransaction {
  name: string;
  share: number;
  change: number;
  transactionPrice: number;
  transactionType: string;
  filingDate: string;
}

export interface FinnhubInsiderResponse {
  data: FinnhubInsiderTransaction[];
  symbol: string;
}

export interface FinnhubSocialSentimentEntry {
  mention: number;
  positiveScore: number;
  negativeScore: number;
  score: number;
  atTime?: string;
}

export interface FinnhubSocialSentimentResponse {
  reddit: FinnhubSocialSentimentEntry[];
  twitter: FinnhubSocialSentimentEntry[];
  symbol: string;
}

export interface FinnhubCompanyProfile {
  country: string;
  currency: string;
  exchange: string;
  name: string;
  ticker: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  shareOutstanding: number;
  finnhubIndustry: string;
}

export interface FinnhubBasicFinancials {
  metric: Record<string, number | null>;
  metricType: string;
  symbol: string;
}

export interface FinnhubInsiderSentimentEntry {
  symbol: string;
  year: number;
  month: number;
  change: number;
  mspr: number;
}

export interface FinnhubInsiderSentimentResponse {
  data: FinnhubInsiderSentimentEntry[];
  symbol: string;
}

export interface FinnhubFinancialsReportedConcept {
  label: string;
  value: number;
  unit: string;
}

export interface FinnhubFinancialsReportedEntry {
  accessNumber: string;
  symbol: string;
  cik: string;
  year: number;
  quarter: number;
  form: string;
  startDate: string;
  endDate: string;
  filedDate: string;
  acceptedDate: string;
  report: {
    bs?: FinnhubFinancialsReportedConcept[];
    ic?: FinnhubFinancialsReportedConcept[];
    cf?: FinnhubFinancialsReportedConcept[];
  };
}

export interface FinnhubFinancialsReportedResponse {
  data: FinnhubFinancialsReportedEntry[];
  symbol: string;
}

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second

  constructor(maxPerMinute: number) {
    this.maxTokens = maxPerMinute;
    this.tokens = maxPerMinute;
    this.refillRate = maxPerMinute / 60;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

class FinnhubClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://finnhub.io/api/v1";
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly rateLimiter: RateLimiter;

  constructor() {
    this.apiKey = FINNHUB_CONFIG.apiKey;
    this.rateLimiter = new RateLimiter(FINNHUB_CONFIG.rateLimit);
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 });
    // Evict stale entries periodically
    if (this.cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now > v.expiry) this.cache.delete(k);
      }
    }
  }

  private async request<T>(path: string, cacheKey: string, cacheTtl: number): Promise<T> {
    const cached = this.getCached<T>(cacheKey);
    if (cached !== null) return cached;

    if (!this.apiKey) {
      throw new Error("FINNHUB_API_KEY is not configured");
    }

    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}${path}${path.includes("?") ? "&" : "?"}token=${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Finnhub API error: ${res.status} ${res.statusText}`);
      }
      const data: T = await res.json();
      this.setCache(cacheKey, data, cacheTtl);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCompanyNews(symbol: string, daysBack: number = 7): Promise<FinnhubNewsArticle[]> {
    const to = new Date();
    const from = new Date(to.getTime() - daysBack * 86400000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    const path = `/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}`;
    return this.request<FinnhubNewsArticle[]>(path, `news:${symbol}`, FINNHUB_CONFIG.newsCacheTtl);
  }

  async getMarketNews(category: string = "general"): Promise<FinnhubNewsArticle[]> {
    const path = `/news?category=${encodeURIComponent(category)}`;
    return this.request<FinnhubNewsArticle[]>(path, `market-news:${category}`, FINNHUB_CONFIG.newsCacheTtl);
  }

  async getEarningsCalendar(
    from: string,
    to: string,
    symbol?: string
  ): Promise<{ earningsCalendar: FinnhubEarning[] }> {
    let path = `/calendar/earnings?from=${from}&to=${to}`;
    if (symbol) path += `&symbol=${encodeURIComponent(symbol)}`;
    return this.request(path, `earnings:${symbol ?? "all"}:${from}:${to}`, FINNHUB_CONFIG.earningsCacheTtl);
  }

  async getNewsSentiment(symbol: string): Promise<FinnhubSentiment> {
    const path = `/news-sentiment?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubSentiment>(path, `sentiment:${symbol}`, FINNHUB_CONFIG.newsCacheTtl);
  }

  async getOptionChain(symbol: string): Promise<FinnhubOptionChain> {
    const path = `/stock/option-chain?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubOptionChain>(path, `options:${symbol}`, FINNHUB_CONFIG.newsCacheTtl);
  }

  async getRecommendations(symbol: string): Promise<FinnhubRecommendation[]> {
    const path = `/stock/recommendation?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubRecommendation[]>(
      path,
      `recommendations:${symbol}`,
      FINNHUB_CONFIG.recommendationsCacheTtl
    );
  }

  async getInsiderTransactions(symbol: string): Promise<FinnhubInsiderResponse> {
    const path = `/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubInsiderResponse>(
      path,
      `insider:${symbol}`,
      FINNHUB_CONFIG.insiderCacheTtl
    );
  }

  /**
   * Earnings call transcript metadata listing. Free tier returns the list
   * of available calls (year, quarter, date, duration, audio URL). Full
   * transcript text + AI summarization require the paid alternative-data
   * tier — listing alone is useful as a "latest call" surface on Analysis.
   */
  async getEarningsTranscripts(symbol: string): Promise<FinnhubTranscriptsResponse> {
    const path = `/stock/transcripts/list?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubTranscriptsResponse>(
      path,
      `transcripts:${symbol}`,
      FINNHUB_CONFIG.insiderCacheTtl
    );
  }

  /**
   * Congressional trading disclosures (Periodic Transaction Reports). When
   * `symbol` is supplied, returns only that ticker's trades; pass undefined
   * to get the most recent across all symbols (Finnhub returns up to 100).
   */
  async getCongressionalTrading(symbol?: string): Promise<FinnhubCongressionalResponse> {
    const path = symbol
      ? `/stock/congressional-trading?symbol=${encodeURIComponent(symbol)}`
      : `/stock/congressional-trading`;
    const cacheKey = symbol ? `congress:${symbol}` : "congress:recent";
    return this.request<FinnhubCongressionalResponse>(
      path,
      cacheKey,
      FINNHUB_CONFIG.insiderCacheTtl
    );
  }

  async getSocialSentiment(symbol: string): Promise<FinnhubSocialSentimentResponse> {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);
    const path = `/stock/social-sentiment?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}`;
    return this.request<FinnhubSocialSentimentResponse>(
      path,
      `social:${symbol}`,
      FINNHUB_CONFIG.socialSentimentCacheTtl
    );
  }

  async getPeers(symbol: string): Promise<string[]> {
    const path = `/stock/peers?symbol=${encodeURIComponent(symbol)}`;
    return this.request<string[]>(
      path,
      `peers:${symbol}`,
      FINNHUB_CONFIG.peersCacheTtl
    );
  }

  async getCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile> {
    const path = `/stock/profile2?symbol=${encodeURIComponent(symbol)}`;
    return this.request<FinnhubCompanyProfile>(
      path,
      `profile:${symbol}`,
      FINNHUB_CONFIG.profileCacheTtl
    );
  }

  async getBasicFinancials(symbol: string): Promise<FinnhubBasicFinancials> {
    const path = `/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`;
    return this.request<FinnhubBasicFinancials>(
      path,
      `financials:${symbol}`,
      FINNHUB_CONFIG.basicFinancialsCacheTtl
    );
  }

  async getInsiderSentiment(symbol: string): Promise<FinnhubInsiderSentimentResponse> {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 86400000);
    const fromStr = oneYearAgo.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);
    const path = `/stock/insider-sentiment?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}`;
    return this.request<FinnhubInsiderSentimentResponse>(
      path,
      `insider-sentiment:${symbol}`,
      FINNHUB_CONFIG.insiderSentimentCacheTtl
    );
  }

  async getFinancialsReported(symbol: string): Promise<FinnhubFinancialsReportedResponse> {
    const path = `/stock/financials-reported?symbol=${encodeURIComponent(symbol)}&freq=quarterly`;
    return this.request<FinnhubFinancialsReportedResponse>(
      path,
      `financials-reported:${symbol}`,
      FINNHUB_CONFIG.financialsReportedCacheTtl
    );
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton
const g = globalThis as typeof globalThis & { __finnhubClient?: FinnhubClient };
g.__finnhubClient ??= new FinnhubClient();

export function getFinnhubClient(): FinnhubClient {
  return g.__finnhubClient!;
}
