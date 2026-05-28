import { CLAUDE_CONFIG } from "./config";
import { getLlmApiKey } from "./system-config";
import { getMarketDataProvider } from "./market-data";
import { getFinnhubClient } from "./finnhub";

export interface QuickInsightResult {
  insight: string;
  factors: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

interface CacheEntry {
  data: QuickInsightResult;
  expiry: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const g = globalThis as typeof globalThis & {
  __insightCache?: Map<string, CacheEntry>;
};
g.__insightCache ??= new Map();
const cache = g.__insightCache;

// Set + bounded eviction. Without the sweep the map grows one entry per
// distinct symbol queried over the process lifetime (TTL only gates read
// freshness, not memory). Mirrors the hybrid layers' caches.
function setInsightCache(symbol: string, data: QuickInsightResult): void {
  cache.set(symbol, { data, expiry: Date.now() + CACHE_TTL_MS });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) if (now > v.expiry) cache.delete(k);
  }
}

const INSIGHT_SYSTEM_PROMPT = `You are a concise market analyst. Given a stock's current price, recent change, and news headlines, explain in 2-3 sentences why this stock is moving today. Be specific and cite news when possible.

Respond with valid JSON only, no markdown. The JSON must have this exact structure:
{"insight": "string", "factors": ["string", "string", "string"], "sentiment": "bullish" | "bearish" | "neutral"}

- insight: 2-3 sentence explanation of why the stock is moving
- factors: 3-5 key factors driving the price
- sentiment: overall sentiment based on the data`;

export async function getQuickInsight(symbol: string): Promise<QuickInsightResult> {
  const upperSymbol = symbol.toUpperCase();

  // Check cache
  const cached = cache.get(upperSymbol);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  if (cached) cache.delete(upperSymbol); // expired — free it instead of lingering

  // Fetch current quote
  const provider = getMarketDataProvider();
  const quote = await provider.fetchQuote(upperSymbol);

  // Fetch recent news (best effort)
  let newsHeadlines: string[] = [];
  const finnhub = getFinnhubClient();
  if (finnhub.isConfigured) {
    try {
      const articles = await finnhub.getCompanyNews(upperSymbol, 3);
      newsHeadlines = articles.slice(0, 10).map((a) => a.headline);
    } catch {
      // News unavailable, proceed without
    }
  }

  // If no API key, return a fallback
  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    const fallback = buildFallbackInsight(upperSymbol, quote, newsHeadlines);
    setInsightCache(upperSymbol, fallback);
    return fallback;
  }

  // Build user prompt
  const parts: string[] = [`Symbol: ${upperSymbol}`];
  if (quote) {
    parts.push(`Current Price: $${quote.price.toFixed(2)}`);
    parts.push(`Volume: ${quote.volume.toLocaleString()}`);
  } else {
    parts.push("Current quote unavailable.");
  }
  if (newsHeadlines.length > 0) {
    parts.push("\nRecent News Headlines:");
    for (const h of newsHeadlines) {
      parts.push(`- ${h}`);
    }
  } else {
    parts.push("\nNo recent news available.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CLAUDE_CONFIG.model,
        messages: [
          { role: "system", content: INSIGHT_SYSTEM_PROMPT },
          { role: "user", content: parts.join("\n") },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    let text = data.choices?.[0]?.message?.content ?? "";

    // Strip markdown code fences if the model wrapped the JSON
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    let parsed: QuickInsightResult;
    try {
      parsed = JSON.parse(text);
    } catch {
      // AI returned non-JSON, wrap it
      parsed = {
        insight: text.slice(0, 500),
        factors: ["AI analysis available"],
        sentiment: "neutral",
      };
    }

    // Validate structure
    if (!parsed.insight || !Array.isArray(parsed.factors)) {
      parsed = {
        insight: parsed.insight ?? text.slice(0, 500),
        factors: parsed.factors ?? ["Market analysis"],
        sentiment: parsed.sentiment ?? "neutral",
      };
    }

    if (!["bullish", "bearish", "neutral"].includes(parsed.sentiment)) {
      parsed.sentiment = "neutral";
    }

    setInsightCache(upperSymbol, parsed);
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackInsight(
  symbol: string,
  quote: { price: number; volume: number } | null,
  headlines: string[]
): QuickInsightResult {
  if (!quote) {
    return {
      insight: `Unable to fetch current market data for ${symbol}. Check back later for AI-powered analysis.`,
      factors: ["Quote data unavailable"],
      sentiment: "neutral",
    };
  }

  const factors: string[] = [];
  if (quote.volume > 0) {
    factors.push(`Trading volume: ${quote.volume.toLocaleString()}`);
  }
  factors.push(`Current price: $${quote.price.toFixed(2)}`);
  if (headlines.length > 0) {
    factors.push(...headlines.slice(0, 3));
  }

  return {
    insight: `${symbol} is currently trading at $${quote.price.toFixed(2)}. AI analysis requires a Groq API key to be configured. Configure GROQ_API_KEY in your environment for detailed insights.`,
    factors: factors.slice(0, 5),
    sentiment: "neutral",
  };
}
