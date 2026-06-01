import { db } from "./db";
import { signals, marketDigests } from "./db/schema";
import { desc, gte } from "drizzle-orm";
import { getFinnhubClient } from "./finnhub";
import { getMarketDataProvider } from "./market-data";
import { getPopularSymbolsBySector, getSymbolSector } from "./sectors";
import { searchGuides } from "./education/guide-search";
import type { MarketContext, ChatContext } from "@/types";

/**
 * Classify the current US equity market session in America/New_York time.
 * Used by the chat path so the LLM knows whether it's premarket / open /
 * post / closed and can frame stale data accordingly.
 *
 * Approximation: weekend → closed; weekday 04:00-09:30 ET → pre-market;
 * 09:30-16:00 ET → regular; 16:00-20:00 ET → post-market; else closed.
 * Doesn't observe holidays — those still show as "regular" / "closed"
 * by hour-of-day; close enough for chat framing.
 */
function classifyMarketSession(now: Date): ChatContext["marketSession"] {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10
  );
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const mins = hour * 60 + minute;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre-market";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "post-market";
  return "closed";
}

/**
 * Single live quote for SPY + QQQ — gives the chat path a real "right
 * now" data point. Uses the existing market-data provider (Yahoo by
 * default) so no new dependency.
 */
async function fetchLiveTape(): Promise<ChatContext["liveTape"]> {
  const provider = getMarketDataProvider();
  const fetchedAt = new Date().toISOString();
  const [spyRes, qqqRes] = await Promise.allSettled([
    fetchQuoteWithChange(provider, "SPY"),
    fetchQuoteWithChange(provider, "QQQ"),
  ]);
  const spy =
    spyRes.status === "fulfilled" && spyRes.value
      ? { ...spyRes.value, asOf: fetchedAt }
      : null;
  const qqq =
    qqqRes.status === "fulfilled" && qqqRes.value
      ? { ...qqqRes.value, asOf: fetchedAt }
      : null;
  if (!spy && !qqq) return null;
  return { spy, qqq, fetchedAt };
}

/**
 * Words that look like tickers but virtually never are in a chat context.
 * Conservative list — we'd rather pass a real-but-ambiguous symbol through
 * and let Yahoo return null than hide a legitimate ticker question.
 *
 * Tickers that intentionally are NOT stopworded even though they're
 * common words: AI (C3.ai), ON (ON Semi), IT (was Gartner), HE
 * (Helmerich & Payne — actually HP), F (Ford), T (AT&T). If the user
 * asks "is IT going up" the worst case is we fetch C3.ai too — they
 * see one extra data point, not less.
 */
const TICKER_STOPWORDS = new Set([
  // Articles / pronouns / prepositions
  "I", "A", "AN", "THE", "MY", "WE", "US", "YOU", "HIS", "HER", "OUR",
  "HE", "SHE", "IT", "ITS",
  "OF", "TO", "IS", "AM", "PM", "BE", "DO", "GO", "IF", "OR", "SO", "AS",
  "AT", "BY", "IN", "ON", "UP", "NO", "NOT", "ARE", "WAS", "WERE",
  "AND", "BUT", "FOR", "WITH", "THIS", "THAT", "THEY", "WHO", "CAN",
  "GET", "HAS", "HAVE", "HAD", "WILL", "WOULD", "COULD", "SHOULD",
  // Question words
  "HOW", "WHY", "WHEN", "WHAT", "WHERE", "WHICH",
  // Common acknowledgments
  "OK", "OKAY", "YES", "YEP", "NOPE", "MAYBE", "SURE", "NICE", "COOL",
  // Time / unit acronyms that are not tickers
  "ET", "EST", "PST", "EDT", "UTC", "USD", "EUR", "GBP", "JPY",
  // Generic finance/tech acronyms
  "AI", "API", "APR", "ATH", "ATM", "AUM", "AVG", "CEO", "CFO", "CTO",
  "EOD", "EOM", "EOY", "ETF", "EPS", "FAQ", "FDA", "FED", "FOMC", "GDP",
  "IPO", "IRS", "MAX", "MIN", "MOM", "NOW", "NYSE", "OTC", "PE", "PEG",
  "QQQ", "ROI", "RSS", "SEC", "SPY", "TBD", "TLDR", "TTM", "URL", "USA",
  "YOLO", "YOY", "YTD",
]);

/**
 * Extract candidate ticker symbols from a chat question. Pure function so
 * it's testable in isolation. Returns unique uppercase symbols of length
 * 1–5, filtered against the stopword list, capped at `maxSymbols`.
 *
 * The cap exists because user can paste a list of 20 tickers and we'd
 * otherwise fan out 20 quote fetches per chat message. 5 covers the
 * realistic case where someone asks about 2–3 names.
 */
export function extractSymbolsFromQuestion(
  question: string,
  maxSymbols = 5
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Match strictly all-caps tokens 1–5 chars. Lowercase ticker mentions
  // (e.g. "what about aapl") are intentionally ignored — too ambiguous.
  const tokenRegex = /\b[A-Z]{1,5}\b/g;
  for (const match of question.matchAll(tokenRegex)) {
    const sym = match[0];
    if (TICKER_STOPWORDS.has(sym)) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= maxSymbols) break;
  }
  return out;
}

async function fetchQuoteWithChange(
  provider: ReturnType<typeof getMarketDataProvider>,
  symbol: string
): Promise<{ price: number; changePct: number } | null> {
  // Use 2 daily bars so we can compute % change vs. prior close — fetchQuote
  // alone returns only the last price, which can't be contextualised.
  const bars = await provider.fetchBars(symbol, 2, "1d");
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2].close;
  const curr = bars[bars.length - 1].close;
  if (!(prev > 0)) return null;
  return { price: curr, changePct: ((curr - prev) / prev) * 100 };
}

interface SymbolChange {
  symbol: string;
  changePct: number;
  price: number;
  sector: string;
}

async function fetchSectorMovers(): Promise<SymbolChange[]> {
  const provider = getMarketDataProvider();
  const sectorSymbols = getPopularSymbolsBySector();

  // Take top 3 symbols per sector (skip ETFs), limit total API calls
  const selected: string[] = [];
  for (const [sector, syms] of Object.entries(sectorSymbols)) {
    if (sector === "ETF") continue;
    selected.push(...syms.slice(0, 3));
  }
  // Also add major ETFs for market overview
  selected.push("SPY", "QQQ", "DIA");

  const results = await Promise.allSettled(
    selected.map(async (sym): Promise<SymbolChange> => {
      const bars = await provider.fetchBars(sym, 2, "1d");
      if (bars.length < 2) throw new Error(`Insufficient data for ${sym}`);
      const prev = bars[bars.length - 2].close;
      const curr = bars[bars.length - 1].close;
      return {
        symbol: sym,
        changePct: ((curr - prev) / prev) * 100,
        price: curr,
        sector: getSymbolSector(sym),
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<SymbolChange> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function gatherMarketContext(): Promise<MarketContext> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000);

  // Gather data in parallel
  const [newsResult, moversResult, signalsResult] = await Promise.allSettled([
    getFinnhubClient().isConfigured
      ? getFinnhubClient().getMarketNews("general")
      : Promise.resolve([]),
    fetchSectorMovers(),
    db
      .select({
        symbol: signals.symbol,
        signal: signals.signal,
        confidence: signals.confidence,
        plainEnglish: signals.plainEnglish,
        createdAt: signals.createdAt,
      })
      .from(signals)
      .where(gte(signals.createdAt, yesterday))
      .orderBy(desc(signals.confidence))
      .limit(10),
  ]);

  const news = newsResult.status === "fulfilled"
    ? newsResult.value.slice(0, 15).map((a) => ({
        headline: a.headline,
        summary: a.summary,
        source: a.source,
        datetime: a.datetime,
      }))
    : [];

  const movers = moversResult.status === "fulfilled" ? moversResult.value : [];

  const recentSignals = signalsResult.status === "fulfilled"
    ? signalsResult.value.map((s) => ({
        symbol: s.symbol,
        signal: s.signal,
        confidence: s.confidence,
        plainEnglish: s.plainEnglish,
        createdAt: s.createdAt.toISOString(),
      }))
    : [];

  // Group movers by sector
  const sectorMap = new Map<string, SymbolChange[]>();
  for (const m of movers) {
    if (m.sector === "ETF") continue;
    const existing = sectorMap.get(m.sector) ?? [];
    existing.push(m);
    sectorMap.set(m.sector, existing);
  }

  const sectorPerformance = [...sectorMap.entries()].map(([sector, syms]) => ({
    sector,
    avgChange: syms.reduce((sum, s) => sum + s.changePct, 0) / syms.length,
    symbols: syms.map((s) => ({ symbol: s.symbol, changePct: s.changePct })),
  }));

  // Top gainers/losers
  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  const topGainers = sorted.slice(0, 5).filter((s) => s.changePct > 0);
  const topLosers = sorted.slice(-5).filter((s) => s.changePct < 0).reverse();

  return { news, sectorPerformance, topGainers, topLosers, recentSignals, date: today };
}

export async function gatherChatContext(question: string): Promise<ChatContext> {
  const now = new Date();
  const currentServerTime = now.toISOString();
  const marketSession = classifyMarketSession(now);
  const moversFetchedAt = currentServerTime;
  const mentionedSymbols = extractSymbolsFromQuestion(question);

  // Gather data in parallel. Live tape is its own call so SPY/QQQ "right
  // now" prices land alongside the slower daily-bar movers list.
  // Per-symbol mentioned quotes piggyback on the same Yahoo provider —
  // capped at 5 symbols by the extractor, so worst case is 5 extra fetches.
  const provider = getMarketDataProvider();
  const symbolQuotesPromise = Promise.allSettled(
    mentionedSymbols.map(async (sym) => {
      const q = await fetchQuoteWithChange(provider, sym);
      return q ? { symbol: sym, ...q } : null;
    })
  );

  const [newsResult, moversResult, signalsResult, digestResult, liveTapeResult] =
    await Promise.allSettled([
      getFinnhubClient().isConfigured
        ? getFinnhubClient().getMarketNews("general")
        : Promise.resolve([]),
      fetchSectorMovers(),
      db
        .select({
          symbol: signals.symbol,
          signal: signals.signal,
          plainEnglish: signals.plainEnglish,
          createdAt: signals.createdAt,
        })
        .from(signals)
        .where(gte(signals.createdAt, new Date(Date.now() - 86400000)))
        .orderBy(desc(signals.confidence))
        .limit(10),
      db
        .select({
          summary: marketDigests.summary,
          generatedAt: marketDigests.generatedAt,
        })
        .from(marketDigests)
        .orderBy(desc(marketDigests.createdAt))
        .limit(1),
      fetchLiveTape(),
    ]);

  const news = newsResult.status === "fulfilled"
    ? newsResult.value.slice(0, 10).map((a) => ({
        headline: a.headline,
        summary: a.summary,
        // Finnhub returns unix epoch seconds; convert. Fallback to fetch
        // time when missing so the LLM can still age-check generically.
        publishedAt:
          typeof a.datetime === "number" && a.datetime > 0
            ? new Date(a.datetime * 1000).toISOString()
            : currentServerTime,
      }))
    : [];

  const movers = moversResult.status === "fulfilled" ? moversResult.value : [];
  const sorted = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const topMovers = {
    fetchedAt: moversFetchedAt,
    items: sorted
      .slice(0, 10)
      .map((m) => ({ symbol: m.symbol, changePct: m.changePct })),
  };

  const relevantSignals = signalsResult.status === "fulfilled"
    ? signalsResult.value.map((s) => ({
        symbol: s.symbol,
        signal: s.signal,
        plainEnglish: s.plainEnglish,
        createdAt: s.createdAt ? s.createdAt.toISOString() : null,
      }))
    : [];

  const recentDigest = digestResult.status === "fulfilled" && digestResult.value.length > 0
    ? {
        summary: digestResult.value[0].summary,
        generatedAt: digestResult.value[0].generatedAt.toISOString(),
      }
    : null;

  const liveTape = liveTapeResult.status === "fulfilled" ? liveTapeResult.value : null;

  // Collect successful per-symbol quote fetches. Stamp asOf at receive
  // time so the chat block can render "as of HH:MM" consistently.
  const symbolQuotesSettled = await symbolQuotesPromise;
  const symbolFetchedAt = new Date().toISOString();
  const mentionedSymbolQuotes = symbolQuotesSettled
    .map((r) =>
      r.status === "fulfilled" && r.value
        ? { ...r.value, asOf: symbolFetchedAt }
        : null
    )
    .filter((x): x is { symbol: string; price: number; changePct: number; asOf: string } => x !== null);

  // If question mentions a specific symbol, add its signals to the front
  const symbolMatch = question.toUpperCase().match(/\b([A-Z]{1,5})\b/);
  if (symbolMatch) {
    const sym = symbolMatch[1];
    const hasIt = relevantSignals.some((s) => s.symbol === sym);
    if (!hasIt) {
      try {
        const symSignals = await db
          .select({
            symbol: signals.symbol,
            signal: signals.signal,
            plainEnglish: signals.plainEnglish,
            createdAt: signals.createdAt,
          })
          .from(signals)
          .where(gte(signals.createdAt, new Date(Date.now() - 7 * 86400000)))
          .orderBy(desc(signals.createdAt))
          .limit(3);

        relevantSignals.unshift(
          ...symSignals
            .filter((s) => s.symbol === sym)
            .map((s) => ({
              symbol: s.symbol,
              signal: s.signal,
              plainEnglish: s.plainEnglish,
              createdAt: s.createdAt ? s.createdAt.toISOString() : null,
            }))
        );
      } catch {
        // Non-critical
      }
    }
  }

  // Education guide retrieval — RAG step. Synchronous (in-memory index) so
  // we don't need to await; failures here should not break chat.
  let educationGuides: ChatContext["educationGuides"] = undefined;
  try {
    const hits = searchGuides(question, 3);
    if (hits.length > 0) {
      educationGuides = hits.map((h) => ({
        slug: h.slug,
        title: h.title,
        sectionId: h.sectionId,
        sectionHeading: h.sectionHeading,
        snippet: h.snippet,
      }));
    }
  } catch {
    // Non-critical
  }

  return {
    currentServerTime,
    marketSession,
    liveTape,
    news,
    recentDigest,
    topMovers,
    relevantSignals,
    mentionedSymbolQuotes,
    educationGuides,
  };
}
