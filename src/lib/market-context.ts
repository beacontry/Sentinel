import { db } from "./db";
import { signals, marketDigests } from "./db/schema";
import { desc, gte } from "drizzle-orm";
import { getFinnhubClient } from "./finnhub";
import { getMarketDataProvider } from "./market-data";
import { getPopularSymbolsBySector, getSymbolSector } from "./sectors";
import type { MarketContext, ChatContext } from "@/types";

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
  // Gather data in parallel
  const [newsResult, moversResult, signalsResult, digestResult] = await Promise.allSettled([
    getFinnhubClient().isConfigured
      ? getFinnhubClient().getMarketNews("general")
      : Promise.resolve([]),
    fetchSectorMovers(),
    db
      .select({
        symbol: signals.symbol,
        signal: signals.signal,
        plainEnglish: signals.plainEnglish,
      })
      .from(signals)
      .where(gte(signals.createdAt, new Date(Date.now() - 86400000)))
      .orderBy(desc(signals.confidence))
      .limit(10),
    db
      .select({ summary: marketDigests.summary })
      .from(marketDigests)
      .orderBy(desc(marketDigests.createdAt))
      .limit(1),
  ]);

  const news = newsResult.status === "fulfilled"
    ? newsResult.value.slice(0, 10).map((a) => ({
        headline: a.headline,
        summary: a.summary,
      }))
    : [];

  const movers = moversResult.status === "fulfilled" ? moversResult.value : [];
  const sorted = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const topMovers = sorted.slice(0, 10).map((m) => ({ symbol: m.symbol, changePct: m.changePct }));

  const relevantSignals = signalsResult.status === "fulfilled"
    ? signalsResult.value.map((s) => ({
        symbol: s.symbol,
        signal: s.signal,
        plainEnglish: s.plainEnglish,
      }))
    : [];

  const recentDigest = digestResult.status === "fulfilled" && digestResult.value.length > 0
    ? digestResult.value[0].summary
    : null;

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
          })
          .from(signals)
          .where(gte(signals.createdAt, new Date(Date.now() - 7 * 86400000)))
          .orderBy(desc(signals.createdAt))
          .limit(3);

        relevantSignals.unshift(
          ...symSignals
            .filter((s) => s.symbol === sym)
            .map((s) => ({ symbol: s.symbol, signal: s.signal, plainEnglish: s.plainEnglish }))
        );
      } catch {
        // Non-critical
      }
    }
  }

  return { news, recentDigest, topMovers, relevantSignals };
}
