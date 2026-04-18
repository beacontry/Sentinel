import type { SignalType } from "@/types";
import { getFinnhubClient } from "../finnhub";
import { CLAUDE_CONFIG } from "../config";

// ─── Types ──────────────────────────────────────────────────────────

export interface SentimentLayer {
  source: "news-ai";
  bullishPercent: number;
  bearishPercent: number;
  newsScore: number;
  headlineCount: number;
  adjustment: number; // -0.15 to +0.15
  reasons: string[];
}

// ─── Cache ──────────────────────────────────────────────────────────

interface SentimentCacheEntry {
  data: SentimentLayer;
  expiry: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes (AI calls are expensive)

const g = globalThis as typeof globalThis & {
  __sentimentCache?: Map<string, SentimentCacheEntry>;
};
g.__sentimentCache ??= new Map();

function getCached(symbol: string): SentimentLayer | null {
  const entry = g.__sentimentCache!.get(symbol);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    g.__sentimentCache!.delete(symbol);
    return null;
  }
  return entry.data;
}

function setCache(symbol: string, data: SentimentLayer): void {
  g.__sentimentCache!.set(symbol, { data, expiry: Date.now() + CACHE_TTL_MS });
  if (g.__sentimentCache!.size > 200) {
    const now = Date.now();
    for (const [k, v] of g.__sentimentCache!) {
      if (now > v.expiry) g.__sentimentCache!.delete(k);
    }
  }
}

// ─── Layer ──────────────────────────────────────────────────────────

/**
 * Sentiment layer using FREE Finnhub company news + Claude AI scoring.
 * No paid Finnhub tier needed — uses /company-news (free) and scores headlines with Claude.
 */
export async function applySentimentLayer(
  symbol: string,
  baseSignal: SignalType
): Promise<SentimentLayer | null> {
  const cached = getCached(symbol);
  if (cached) {
    // Recalculate adjustment for current signal direction
    return { ...cached, ...computeAdjustment(cached.bullishPercent, cached.bearishPercent, cached.newsScore, cached.headlineCount, baseSignal) };
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) return null;

  try {
    // Fetch free company news (last 3 days)
    const news = await client.getCompanyNews(symbol, 3);
    if (!news || news.length === 0) return null;

    // Take top 15 most recent headlines
    const headlines = news
      .slice(0, 15)
      .map((n: { headline: string; summary?: string }) => n.headline)
      .filter(Boolean);

    if (headlines.length === 0) return null;

    // Score sentiment with Claude (or use heuristic fallback)
    const apiKey = CLAUDE_CONFIG.apiKey;
    let bullishPercent = 0.5;
    let bearishPercent = 0.5;
    let newsScore = 0.5;

    if (apiKey) {
      const scored = await scoreSentimentWithAI(symbol, headlines, apiKey);
      if (scored) {
        bullishPercent = scored.bullish;
        bearishPercent = scored.bearish;
        newsScore = scored.strength;
      }
    } else {
      // Simple heuristic: count positive/negative keywords
      const scored = scoreSentimentHeuristic(headlines);
      bullishPercent = scored.bullish;
      bearishPercent = scored.bearish;
      newsScore = headlines.length > 5 ? 0.7 : 0.4;
    }

    const result: SentimentLayer = {
      source: "news-ai",
      bullishPercent,
      bearishPercent,
      newsScore,
      headlineCount: headlines.length,
      ...computeAdjustment(bullishPercent, bearishPercent, newsScore, headlines.length, baseSignal),
    };

    setCache(symbol, result);
    return result;
  } catch {
    return null;
  }
}

// ─── AI Scoring ─────────────────────────────────────────────────────

async function scoreSentimentWithAI(
  symbol: string,
  headlines: string[],
  apiKey: string
): Promise<{ bullish: number; bearish: number; strength: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 200,
      system: "You score news sentiment for stocks. Return ONLY valid JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Score the sentiment of these ${symbol} news headlines on a 0-1 scale.

Headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Return JSON: {"bullish": 0.0-1.0, "bearish": 0.0-1.0, "strength": 0.0-1.0}
- bullish: how positive the news is (0=not at all, 1=very positive)
- bearish: how negative the news is (0=not at all, 1=very negative)
- strength: how significant/impactful the news is (0=trivial, 1=major)
bullish + bearish should roughly sum to 1.0`,
      }],
    }, { signal: controller.signal });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[^}]+\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    return {
      bullish: Math.max(0, Math.min(1, Number(parsed.bullish) || 0.5)),
      bearish: Math.max(0, Math.min(1, Number(parsed.bearish) || 0.5)),
      strength: Math.max(0, Math.min(1, Number(parsed.strength) || 0.5)),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Heuristic Fallback ─────────────────────────────────────────────

const BULLISH_WORDS = ["surge", "jump", "rally", "gain", "rise", "beat", "upgrade", "record", "high", "strong", "growth", "profit", "revenue", "bullish", "positive", "outperform"];
const BEARISH_WORDS = ["drop", "fall", "decline", "loss", "miss", "downgrade", "low", "weak", "cut", "slash", "bearish", "negative", "underperform", "crash", "plunge", "sell-off"];

function scoreSentimentHeuristic(headlines: string[]): { bullish: number; bearish: number } {
  let bullCount = 0;
  let bearCount = 0;
  const joined = headlines.join(" ").toLowerCase();

  for (const word of BULLISH_WORDS) {
    if (joined.includes(word)) bullCount++;
  }
  for (const word of BEARISH_WORDS) {
    if (joined.includes(word)) bearCount++;
  }

  const total = bullCount + bearCount || 1;
  return {
    bullish: bullCount / total,
    bearish: bearCount / total,
  };
}

// ─── Adjustment Calculation ─────────────────────────────────────────

function computeAdjustment(
  bullishPercent: number,
  bearishPercent: number,
  newsScore: number,
  headlineCount: number,
  baseSignal: SignalType
): { adjustment: number; reasons: string[] } {
  const reasons: string[] = [];
  const sentimentDelta = bullishPercent - bearishPercent;
  const strength = Math.min(newsScore, 1.0) * Math.min(headlineCount / 5, 1.0); // Scale by news volume

  let adjustment = 0;

  if (baseSignal === "BUY" || baseSignal === "STRONG_BUY") {
    adjustment = sentimentDelta * 0.15 * strength;
    if (sentimentDelta > 0.15) {
      reasons.push(`News sentiment bullish (${(bullishPercent * 100).toFixed(0)}% positive, ${headlineCount} articles)`);
    } else if (sentimentDelta < -0.15) {
      reasons.push(`News sentiment contradicts bullish signal (${(bearishPercent * 100).toFixed(0)}% negative)`);
    }
  } else if (baseSignal === "SELL" || baseSignal === "STRONG_SELL") {
    adjustment = -sentimentDelta * 0.15 * strength;
    if (sentimentDelta < -0.15) {
      reasons.push(`News sentiment bearish (${(bearishPercent * 100).toFixed(0)}% negative, ${headlineCount} articles)`);
    } else if (sentimentDelta > 0.15) {
      reasons.push(`News sentiment contradicts bearish signal (${(bullishPercent * 100).toFixed(0)}% positive)`);
    }
  }

  adjustment = Math.max(-0.15, Math.min(0.15, adjustment));

  return { adjustment, reasons };
}
