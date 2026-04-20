import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { computeCorrelationMatrix } from "@/lib/correlation";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("correlation");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,10}$/.test(s))
    .slice(0, 10);

  if (symbols.length < 2) {
    return NextResponse.json({ error: "Need at least 2 symbols" }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();
    const symbolBars: Record<string, import("@/types").Bar[]> = {};

    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const bars = await provider.fetchBars(sym, 90, "1d");
        return { sym, bars };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.bars.length >= 20) {
        symbolBars[r.value.sym] = r.value.bars;
      }
    }

    if (Object.keys(symbolBars).length < 2) {
      return NextResponse.json(
        { error: "Not enough data for correlation" },
        { status: 422 }
      );
    }

    const result = computeCorrelationMatrix(symbolBars);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Correlation error");
    return NextResponse.json({ error: "Correlation failed" }, { status: 500 });
  }
}
