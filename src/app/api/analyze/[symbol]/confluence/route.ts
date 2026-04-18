import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeHybrid } from "@/lib/hybrid";
import type { ConfluenceResult } from "@/types";
import type { SignalType } from "@/types";

const BUY_SIGNALS: SignalType[] = ["BUY" as SignalType, "STRONG_BUY" as SignalType];
const SELL_SIGNALS: SignalType[] = ["SELL" as SignalType, "STRONG_SELL" as SignalType];
const STRONG_SIGNALS: SignalType[] = ["STRONG_BUY" as SignalType, "STRONG_SELL" as SignalType];

function isBuyish(signal: SignalType): boolean {
  return BUY_SIGNALS.includes(signal);
}

function isSellish(signal: SignalType): boolean {
  return SELL_SIGNALS.includes(signal);
}

function isDirectional(signal: SignalType): boolean {
  return isBuyish(signal) || isSellish(signal);
}

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

    // Fetch both timeframes in parallel
    const [intradayBars, dailyBars] = await Promise.all([
      provider.fetchBars(upperSymbol, 5, "5m"),
      provider.fetchBars(upperSymbol, 90, "1d"),
    ]);

    if (intradayBars.length < 30) {
      return NextResponse.json(
        { error: "Not enough intraday data for confluence analysis" },
        { status: 422 }
      );
    }

    if (dailyBars.length < 30) {
      return NextResponse.json(
        { error: "Not enough daily data for confluence analysis" },
        { status: 422 }
      );
    }

    const hybridOptions = { enableAiScoring: false };
    const intradayResult = await analyzeHybrid(upperSymbol, intradayBars, hybridOptions);
    const dailyResult = await analyzeHybrid(upperSymbol, dailyBars, hybridOptions);

    const intradaySignal = intradayResult.signal;
    const dailySignal = dailyResult.signal;

    // Compute confluence
    let confluenceScore: number;
    let status: ConfluenceResult["status"];
    let description: string;

    const bothBuyish = isBuyish(intradaySignal) && isBuyish(dailySignal);
    const bothSellish = isSellish(intradaySignal) && isSellish(dailySignal);
    const sameDirection = bothBuyish || bothSellish;

    if (sameDirection) {
      // Both same direction: score = avg confidence * 100
      confluenceScore = ((intradayResult.confidence + dailyResult.confidence) / 2) * 100;
      status = "confirmed";

      // Bonus +10 if both STRONG variants
      if (STRONG_SIGNALS.includes(intradaySignal) && STRONG_SIGNALS.includes(dailySignal)) {
        confluenceScore = Math.min(100, confluenceScore + 10);
      }

      const direction = bothBuyish ? "bullish" : "bearish";
      description = `Both intraday and daily timeframes confirm a ${direction} signal. High conviction setup.`;
    } else if (
      (isDirectional(intradaySignal) && !isDirectional(dailySignal)) ||
      (!isDirectional(intradaySignal) && isDirectional(dailySignal))
    ) {
      // One HOLD, other directional
      confluenceScore = 50;
      status = "mixed";

      const directionalTf = isDirectional(intradaySignal) ? "intraday" : "daily";
      const directionalSignal = isDirectional(intradaySignal) ? intradaySignal : dailySignal;
      description = `Mixed signals: ${directionalTf} shows ${directionalSignal} while the other timeframe is neutral. Wait for confirmation.`;
    } else if (
      (isBuyish(intradaySignal) && isSellish(dailySignal)) ||
      (isSellish(intradaySignal) && isBuyish(dailySignal))
    ) {
      // Opposing directions
      confluenceScore = 0;
      status = "divergent";
      description = `Timeframes disagree: intraday is ${intradaySignal} while daily is ${dailySignal}. Avoid trading until alignment improves.`;
    } else {
      // Both HOLD
      confluenceScore = 50;
      status = "mixed";
      description = "Both timeframes show HOLD signals. No clear directional bias.";
    }

    confluenceScore = Math.round(Math.max(0, Math.min(100, confluenceScore)));

    const result: ConfluenceResult = {
      symbol: upperSymbol,
      intraday: { signal: intradaySignal, confidence: intradayResult.confidence },
      daily: { signal: dailySignal, confidence: dailyResult.confidence },
      confluenceScore,
      status,
      description,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=120" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Confluence analysis error:", message);
    return NextResponse.json(
      { error: "Confluence analysis failed" },
      { status: 500 }
    );
  }
}
