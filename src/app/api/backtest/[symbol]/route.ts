import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { runBacktest } from "@/lib/backtester";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("backtest");

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
  const holdPeriod = Math.min(Number(searchParams.get("holdPeriod")) || 20, 60);

  // Risk config — defaults match the live trader's settings.yaml
  const stopLossPct = Math.min(Math.max(Number(searchParams.get("stopLoss")) || 0.02, 0.005), 0.2);
  const takeProfitPct = Math.min(Math.max(Number(searchParams.get("takeProfit")) || 0.03, 0.005), 0.5);
  const trailingStopPct = Math.min(Math.max(Number(searchParams.get("trailingStop")) || 0.015, 0.005), 0.2);

  // Date range mode: startDate + endDate (ISO YYYY-MM-DD). Otherwise fall back to "last N days".
  const startDateRaw = searchParams.get("startDate");
  const endDateRaw = searchParams.get("endDate");
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  let days: number;
  let endDate: Date | undefined;
  let startDate: Date | undefined;

  if (startDateRaw && endDateRaw) {
    if (!ISO_DATE.test(startDateRaw) || !ISO_DATE.test(endDateRaw)) {
      return NextResponse.json({ error: "Invalid date format (expected YYYY-MM-DD)" }, { status: 400 });
    }
    startDate = new Date(`${startDateRaw}T00:00:00Z`);
    endDate = new Date(`${endDateRaw}T23:59:59Z`);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    // Cap at ~25 years; pad with 60 days for indicator warmup.
    const spanMs = endDate.getTime() - startDate.getTime();
    days = Math.min(Math.ceil(spanMs / 86400000) + 60, 25 * 365);
  } else {
    days = Math.min(Number(searchParams.get("days")) || 90, 365);
  }

  try {
    const provider = getMarketDataProvider();
    let bars = await provider.fetchBars(upperSymbol, days, "1d", endDate);

    // In date-range mode, trim warmup padding so the result reflects the requested window.
    if (startDate && endDate) {
      const startMs = startDate.getTime();
      const endMs = endDate.getTime();
      bars = bars.filter((b) => {
        const t = new Date(b.date).getTime();
        return t >= startMs && t <= endMs;
      });
    }

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
    log.error({ err: message }, "Backtest error");
    return NextResponse.json(
      { error: "Backtest failed" },
      { status: 500 }
    );
  }
}
