import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { getSymbolSector, getPopularSymbolsBySector } from "@/lib/sectors";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const provider = getMarketDataProvider();
    const sectorSymbols = getPopularSymbolsBySector();

    // Pick top symbols from each sector (limit to avoid rate limits)
    const symbols: string[] = [];
    for (const [, syms] of Object.entries(sectorSymbols)) {
      symbols.push(...syms.slice(0, 5));
    }
    const limited = symbols.slice(0, 30);

    // Fetch quotes in batches
    const results = await Promise.allSettled(
      limited.map(async (sym) => {
        const bars = await provider.fetchBars(sym, 2, "1d");
        if (bars.length < 2) return null;
        const prev = bars[bars.length - 2].close;
        const curr = bars[bars.length - 1].close;
        return {
          symbol: sym,
          price: curr,
          changePct: ((curr - prev) / prev) * 100,
          sector: getSymbolSector(sym),
        };
      })
    );

    const sectors: Record<string, { symbol: string; price: number; changePct: number }[]> = {};
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { sector, ...data } = r.value;
      if (!sectors[sector]) sectors[sector] = [];
      sectors[sector].push(data);
    }

    return NextResponse.json({
      sectors: Object.entries(sectors).map(([name, symbols]) => ({
        name,
        symbols: symbols.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)),
      })),
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Heatmap error:", message);
    return NextResponse.json({ error: "Failed to load heatmap" }, { status: 500 });
  }
}
