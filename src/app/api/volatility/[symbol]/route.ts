import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeBars } from "@/lib/indicators/analyzer";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("volatility");

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
        { error: "Not enough data for volatility analysis" },
        { status: 422 }
      );
    }

    const result = analyzeBars(upperSymbol, bars);

    // Calculate historical volatility: annualized stddev of daily returns
    const dailyReturns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const prevClose = bars[i - 1].close;
      if (prevClose !== 0) {
        dailyReturns.push((bars[i].close - prevClose) / prevClose);
      }
    }

    let historicalVol: number | null = null;
    if (dailyReturns.length >= 10) {
      const mean =
        dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) /
        (dailyReturns.length - 1);
      const stddev = Math.sqrt(variance);
      historicalVol = stddev * Math.sqrt(252) * 100;
    }

    const price = bars[bars.length - 1].close;
    const atr = result.indicators.atr_14;
    const atrPercent = atr !== null && price !== 0 ? (atr / price) * 100 : null;

    const bollingerUpper = result.indicators.bollinger_upper;
    const bollingerMiddle = result.indicators.bollinger_middle;
    const bollingerLower = result.indicators.bollinger_lower;

    // Bollinger bandwidth: (upper - lower) / middle * 100
    let bollingerBandwidth: number | null = null;
    if (
      bollingerUpper !== null &&
      bollingerLower !== null &&
      bollingerMiddle !== null &&
      bollingerMiddle !== 0
    ) {
      bollingerBandwidth =
        ((bollingerUpper - bollingerLower) / bollingerMiddle) * 100;
    }

    return NextResponse.json(
      {
        symbol: upperSymbol,
        price,
        atr,
        atrPercent,
        bollingerUpper,
        bollingerMiddle,
        bollingerLower,
        bollingerBandwidth,
        historicalVol,
      },
      {
        headers: { "Cache-Control": "private, max-age=120" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Volatility analysis error");
    return NextResponse.json(
      { error: "Volatility analysis failed" },
      { status: 500 }
    );
  }
}
