import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { getPopularSymbolsBySector } from "@/lib/sectors";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("sector-rotation");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    const provider = getMarketDataProvider();
    const sectorSymbols = getPopularSymbolsBySector();

    type SymPerf = { sector: string; symbol: string; perf1w: number; perf1m: number; perf3m: number };

    // Flatten the (sector × symbol) plan into one parallel batch instead of
    // serializing per-sector. Each sector's symbols still resolve together,
    // but all sectors fetch concurrently.
    const plan: { sector: string; symbol: string }[] = [];
    for (const [sector, syms] of Object.entries(sectorSymbols)) {
      if (sector === "ETF" || sector === "Other") continue;
      for (const sym of syms.slice(0, 5)) plan.push({ sector, symbol: sym });
    }

    const settled = await Promise.allSettled(
      plan.map(async ({ sector, symbol }): Promise<SymPerf | null> => {
        const bars = await provider.fetchBars(symbol, 100, "1d");
        if (bars.length < 10) return null;
        const closes = bars.map((b) => b.close);
        const last = closes[closes.length - 1];

        const perf = (idx: number) => {
          if (closes.length < idx + 1) return 0;
          const past = closes[closes.length - 1 - idx];
          return ((last - past) / past) * 100;
        };

        return {
          sector,
          symbol,
          perf1w: perf(5),
          perf1m: perf(21),
          perf3m: perf(Math.min(63, closes.length - 1)),
        };
      })
    );

    const bySector = new Map<string, SymPerf[]>();
    for (const r of settled) {
      if (r.status !== "fulfilled" || r.value === null) continue;
      const existing = bySector.get(r.value.sector) ?? [];
      existing.push(r.value);
      bySector.set(r.value.sector, existing);
    }

    const sectorResults: {
      name: string;
      perf1w: number;
      perf1m: number;
      perf3m: number;
      momentum: number;
      phase: "leading" | "weakening" | "lagging" | "improving";
      topSymbol: string;
      topSymbolPerf: number;
    }[] = [];

    for (const [sector, valid] of bySector) {
      if (valid.length === 0) continue;

      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const perf1w = Math.round(avg(valid.map((v) => v.perf1w)) * 100) / 100;
      const perf1m = Math.round(avg(valid.map((v) => v.perf1m)) * 100) / 100;
      const perf3m = Math.round(avg(valid.map((v) => v.perf3m)) * 100) / 100;
      const momentum = Math.round((perf1m - perf3m) * 100) / 100;

      let phase: "leading" | "weakening" | "lagging" | "improving";
      if (perf1m > 0 && momentum > 0) phase = "leading";
      else if (perf1m > 0 && momentum <= 0) phase = "weakening";
      else if (perf1m <= 0 && momentum < 0) phase = "lagging";
      else phase = "improving";

      const best = valid.reduce((a, b) => (b.perf1m > a.perf1m ? b : a));

      sectorResults.push({
        name: sector,
        perf1w, perf1m, perf3m, momentum, phase,
        topSymbol: best.symbol,
        topSymbolPerf: Math.round(best.perf1m * 100) / 100,
      });
    }

    // Restore deterministic ordering — bySector iteration order tracks insertion.
    sectorResults.sort((a, b) => b.perf1m - a.perf1m);

    return NextResponse.json({
      sectors: sectorResults,
      asOf: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Sector rotation error");
    return NextResponse.json({ error: "Sector rotation failed" }, { status: 500 });
  }
}
