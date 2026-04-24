import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { getPopularSymbolsBySector } from "@/lib/sectors";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("unusual-activity");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const provider = getMarketDataProvider();
    const sectorSymbols = getPopularSymbolsBySector();

    const allSymbols: { symbol: string; sector: string }[] = [];
    for (const [sector, syms] of Object.entries(sectorSymbols)) {
      for (const s of syms.slice(0, 5)) {
        allSymbols.push({ symbol: s, sector });
      }
    }
    const limited = allSymbols.slice(0, 40);

    const results = await Promise.allSettled(
      limited.map(async ({ symbol, sector }) => {
        const bars = await provider.fetchBars(symbol, 30, "1d");
        if (bars.length < 21) return null;

        const volumes = bars.map((b) => b.volume);
        const todayVolume = volumes[volumes.length - 1];
        const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
        const volumeRatio = avgVolume20 > 0 ? todayVolume / avgVolume20 : 0;

        const lastClose = bars[bars.length - 1].close;
        const prevClose = bars[bars.length - 2].close;
        const priceChange = ((lastClose - prevClose) / prevClose) * 100;

        return {
          symbol,
          sector,
          price: lastClose,
          priceChange: Math.round(priceChange * 100) / 100,
          todayVolume,
          avgVolume20: Math.round(avgVolume20),
          volumeRatio: Math.round(volumeRatio * 100) / 100,
          unusual: volumeRatio >= 2.0,
        };
      })
    );

    type ActivityItem = {
      symbol: string; sector: string; price: number; priceChange: number;
      todayVolume: number; avgVolume20: number; volumeRatio: number; unusual: boolean;
    };
    const symbols: ActivityItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) {
        symbols.push(r.value as ActivityItem);
      }
    }
    symbols.sort((a, b) => b.volumeRatio - a.volumeRatio);

    return NextResponse.json({
      symbols,
      scanned: symbols.length,
      unusualCount: symbols.filter((s) => s.unusual).length,
      timestamp: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Unusual activity error");
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
