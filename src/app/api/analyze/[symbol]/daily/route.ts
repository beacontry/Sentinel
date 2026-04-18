import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeHybrid } from "@/lib/hybrid";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();
    const bars = await provider.fetchBars(upperSymbol, 90, "1d");

    if (bars.length < 30) {
      return NextResponse.json(
        { error: "Not enough daily data for analysis" },
        { status: 422 }
      );
    }

    const result = await analyzeHybrid(upperSymbol, bars, {
      enableAiScoring: false,
    });

    return NextResponse.json(
      { ...result, timeframe: "1d" },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Daily analysis error:", message);
    return NextResponse.json(
      { error: "Daily analysis failed" },
      { status: 500 }
    );
  }
}
