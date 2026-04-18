import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { discordWebhooks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendDiscordWebhook } from "@/lib/discord";
import type { AnalysisResult, SignalType } from "@/types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const id = body.id;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [webhook] = await db
    .select()
    .from(discordWebhooks)
    .where(
      and(
        eq(discordWebhooks.id, id),
        eq(discordWebhooks.userId, session.userId)
      )
    )
    .limit(1);

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const testResult: AnalysisResult = {
    symbol: "TEST",
    signal: "BUY" as SignalType,
    confidence: 0.78,
    price: 150.25,
    volume: 1250000,
    indicators: {
      sma_9: 149.50,
      sma_20: 148.00,
      sma_50: 145.00,
      ema_9: 149.80,
      ema_21: 148.50,
      ema_50: 145.50,
      vwap: 149.00,
      vwap_upper_1: 151.00,
      vwap_lower_1: 147.00,
      rsi_14: 58.5,
      macd_line: 0.85,
      macd_signal: 0.60,
      macd_histogram: 0.25,
      atr_14: 2.50,
      bollinger_upper: 153.00,
      bollinger_middle: 148.00,
      bollinger_lower: 143.00,
    },
    series: {
      sma_9: [], sma_20: [], sma_50: [],
      ema_9: [], ema_21: [], vwap: [],
      rsi_14: [], macd_line: [], macd_signal: [], macd_histogram: [],
      atr_14: [], bollinger_upper: [], bollinger_middle: [], bollinger_lower: [],
    },
    bars: [],
    reasons: [
      "Price above VWAP (bullish positioning)",
      "Short-term EMA above long-term EMA (uptrend)",
      "Fresh bullish EMA crossover detected",
    ],
    plainEnglish:
      "TEST at $150.25 is showing bullish signals (78% confidence). Some indicators are in agreement: price above VWAP, short-term EMA above long-term EMA, and fresh bullish EMA crossover detected. The technicals suggest a potential entry point.",
    timestamp: new Date().toISOString(),
  };

  const result = await sendDiscordWebhook(webhook.webhookUrl, testResult);

  if (result.success) {
    return NextResponse.json({ success: true });
  } else {
    return NextResponse.json(
      { error: result.error ?? "Webhook test failed" },
      { status: 502 }
    );
  }
}
