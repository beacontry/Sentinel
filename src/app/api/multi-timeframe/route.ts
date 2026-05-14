import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeBars } from "@/lib/indicators/analyzer";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("multi-timeframe");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Valid symbol required" }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();

    const [bars5m, bars1d] = await Promise.all([
      provider.fetchBars(symbol, 5, "5m"),
      provider.fetchBars(symbol, 90, "1d"),
    ]);

    const intraday = bars5m.length >= 20 ? analyzeBars(symbol, bars5m) : null;
    const daily = bars1d.length >= 20 ? analyzeBars(symbol, bars1d) : null;

    if (!intraday && !daily) {
      return NextResponse.json(
        { error: "Not enough data for analysis" },
        { status: 422 }
      );
    }

    // Compute confluence
    const bullishSignals = ["STRONG_BUY", "BUY"];
    const bearishSignals = ["STRONG_SELL", "SELL"];

    let status: "confirmed" | "divergent" | "mixed" = "mixed";
    let score = 50;
    let description = "Mixed signals across timeframes.";

    if (intraday && daily) {
      const intradayBullish = bullishSignals.includes(intraday.signal);
      const intradayBearish = bearishSignals.includes(intraday.signal);
      const dailyBullish = bullishSignals.includes(daily.signal);
      const dailyBearish = bearishSignals.includes(daily.signal);

      if ((intradayBullish && dailyBullish) || (intradayBearish && dailyBearish)) {
        status = "confirmed";
        score = Math.round((intraday.confidence + daily.confidence) / 2 * 100);
        description = intradayBullish
          ? "Bullish confluence — both timeframes align bullish."
          : "Bearish confluence — both timeframes align bearish.";
      } else if ((intradayBullish && dailyBearish) || (intradayBearish && dailyBullish)) {
        status = "divergent";
        score = Math.round(Math.abs(intraday.confidence - daily.confidence) * 50);
        description = "Divergent signals — timeframes disagree. Exercise caution.";
      } else {
        status = "mixed";
        score = 50;
        description = "One or both timeframes neutral. No strong confluence.";
      }
    }

    function extractTimeframe(result: typeof intraday, label: string) {
      if (!result) return { label, signal: "HOLD", confidence: 0, price: 0, rsi: null, macd_histogram: null, ema_9: null, ema_21: null, available: false };
      return {
        label,
        signal: result.signal,
        confidence: result.confidence,
        price: result.price,
        rsi: result.indicators.rsi_14,
        macd_histogram: result.indicators.macd_histogram,
        ema_9: result.indicators.ema_9,
        ema_21: result.indicators.ema_21,
        available: true,
      };
    }

    return NextResponse.json({
      symbol,
      timeframes: [
        extractTimeframe(intraday, "Intraday (5m)"),
        extractTimeframe(daily, "Daily"),
      ],
      confluence: { status, score, description },
    }, {
      headers: { "Cache-Control": "private, max-age=120" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Multi-timeframe error");
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
