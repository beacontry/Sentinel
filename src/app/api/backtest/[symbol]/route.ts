import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtester";

export async function GET(
  request: NextRequest,
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

  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(Number(searchParams.get("days")) || 90, 365);
  const holdPeriod = Math.min(Number(searchParams.get("holdPeriod")) || 20, 60);

  // Risk config — defaults match the live trader's settings.yaml
  const stopLossPct = Math.min(Math.max(Number(searchParams.get("stopLoss")) || 0.02, 0.005), 0.2);
  const takeProfitPct = Math.min(Math.max(Number(searchParams.get("takeProfit")) || 0.03, 0.005), 0.5);
  const trailingStopPct = Math.min(Math.max(Number(searchParams.get("trailingStop")) || 0.015, 0.005), 0.2);

  try {
    const provider = getMarketDataProvider();
    const bars = await provider.fetchBars(upperSymbol, days, "1d");

    if (bars.length < 50) {
      return NextResponse.json(
        { error: "Not enough historical data for backtesting" },
        { status: 422 }
      );
    }

    // Window must leave room for holdPeriod trades
    const maxWindow = Math.floor((bars.length - holdPeriod) * 0.7);
    const windowSize = Math.max(30, Math.min(50, maxWindow));
    const stepSize = Math.max(1, Math.floor(windowSize / 10));

    const result = runBacktest(upperSymbol, bars, windowSize, holdPeriod, stepSize, {
      stopLossPct,
      takeProfitPct,
      trailingStopPct,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Backtest error:", message);
    return NextResponse.json(
      { error: "Backtest failed" },
      { status: 500 }
    );
  }
}
