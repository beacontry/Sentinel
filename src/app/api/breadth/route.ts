import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { getPopularSymbolsBySector } from "@/lib/sectors";
import { RSI } from "@/lib/indicators/rsi";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("breadth");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const provider = getMarketDataProvider();
    const sectorSymbols = getPopularSymbolsBySector();

    // Collect symbols, skip ETFs, limit to 50
    const allSymbols: { symbol: string; sector: string }[] = [];
    for (const [sector, syms] of Object.entries(sectorSymbols)) {
      if (sector === "ETF" || sector === "Other") continue;
      for (const s of syms.slice(0, 6)) {
        allSymbols.push({ symbol: s, sector });
      }
    }
    const limited = allSymbols.slice(0, 50);

    const results = await Promise.allSettled(
      limited.map(async ({ symbol, sector }) => {
        const bars = await provider.fetchBars(symbol, 250, "1d");
        if (bars.length < 50) return null;

        const closes = bars.map((b) => b.close);
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const change = (lastClose - prevClose) / prevClose;

        // SMA 50
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        const aboveSma50 = lastClose > sma50;

        // SMA 200
        let aboveSma200 = false;
        if (closes.length >= 200) {
          const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
          aboveSma200 = lastClose > sma200;
        }

        // RSI
        const rsi = new RSI(14);
        for (const bar of bars) rsi.update(bar);
        const rsiVal = rsi.value();

        return { symbol, sector, change, aboveSma50, aboveSma200, rsi: rsiVal };
      })
    );

    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    let above50 = 0;
    let above200 = 0;
    let rsiSum = 0;
    let rsiCount = 0;
    let scanned = 0;
    const sectorData: Record<string, { advancers: number; decliners: number; changes: number[] }> = {};
    // Phase 9 — per-symbol change% for the Market Overview widget
    const allMovers: { symbol: string; changePct: number }[] = [];

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const v = r.value;
      scanned++;
      allMovers.push({ symbol: v.symbol, changePct: v.change * 100 });

      if (v.change > 0.001) advancers++;
      else if (v.change < -0.001) decliners++;
      else unchanged++;

      if (v.aboveSma50) above50++;
      if (v.aboveSma200) above200++;
      if (v.rsi !== null) { rsiSum += v.rsi; rsiCount++; }

      if (!sectorData[v.sector]) sectorData[v.sector] = { advancers: 0, decliners: 0, changes: [] };
      if (v.change > 0.001) sectorData[v.sector].advancers++;
      else if (v.change < -0.001) sectorData[v.sector].decliners++;
      sectorData[v.sector].changes.push(v.change);
    }

    const pctAbove50 = scanned > 0 ? Math.round((above50 / scanned) * 100) : 0;
    const pctAbove200 = scanned > 0 ? Math.round((above200 / scanned) * 100) : 0;
    const avgRSI = rsiCount > 0 ? Math.round(rsiSum / rsiCount * 10) / 10 : 50;

    // Breadth score: weighted combination
    const adRatio = scanned > 0 ? advancers / scanned : 0.5;
    const breadthScore = Math.round(adRatio * 30 + (pctAbove50 / 100) * 30 + (pctAbove200 / 100) * 20 + (Math.min(avgRSI, 70) / 70) * 20);

    let marketStatus: "strong" | "neutral" | "weak" = "neutral";
    if (breadthScore >= 65) marketStatus = "strong";
    else if (breadthScore <= 35) marketStatus = "weak";

    const bySector = Object.entries(sectorData).map(([sector, d]) => ({
      sector,
      advancers: d.advancers,
      decliners: d.decliners,
      avgChange: d.changes.length > 0
        ? Math.round(d.changes.reduce((a, b) => a + b, 0) / d.changes.length * 10000) / 100
        : 0,
    })).sort((a, b) => b.avgChange - a.avgChange);

    // Phase 9 — top 5 gainers / losers for the Market Overview widget
    const sortedMovers = [...allMovers].sort((a, b) => b.changePct - a.changePct);
    const topGainers = sortedMovers.slice(0, 5);
    const topLosers = sortedMovers.slice(-5).reverse();

    return NextResponse.json({
      scanned, advancers, decliners, unchanged,
      pctAbove50, pctAbove200, avgRSI, breadthScore,
      marketStatus, bySector,
      topGainers, topLosers,
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Breadth error");
    return NextResponse.json({ error: "Breadth scan failed" }, { status: 500 });
  }
}
