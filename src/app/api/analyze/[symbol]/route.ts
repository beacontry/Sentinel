import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeHybrid } from "@/lib/hybrid";
import { db } from "@/lib/db";
import { signals, signalAccuracy } from "@/lib/db/schema";
import { sendDiscordWebhook, signalStrengthValue } from "@/lib/discord";
import { discordWebhooks } from "@/lib/db/schema";
import { evaluateAlertRules } from "@/lib/alert-engine";
import { pushSignalToTrader } from "@/lib/trader-push";
import { eq, and } from "drizzle-orm";

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

  // Overall route timeout — prevents cascading provider/layer timeouts
  // from holding the request open indefinitely
  const controller = new AbortController();
  const routeTimeout = setTimeout(() => controller.abort(), 15000);

  try {
    const provider = getMarketDataProvider();
    const bars = await provider.fetchBars(upperSymbol, 5);

    if (controller.signal.aborted) throw new Error("Route timeout");

    if (bars.length < 30) {
      return NextResponse.json(
        { error: "Not enough data for analysis" },
        { status: 422 }
      );
    }

    // Check if AI scoring is explicitly requested via query param
    const url = new URL(_request.url);
    const enableAi = url.searchParams.get("ai") === "true";

    const result = await analyzeHybrid(upperSymbol, bars, {
      enableAiScoring: enableAi,
    });

    if (controller.signal.aborted) throw new Error("Route timeout");

    // Persist the signal
    const [saved] = await db
      .insert(signals)
      .values({
        symbol: result.symbol,
        signal: result.signal,
        confidence: result.confidence,
        price: result.price,
        volume: result.volume,
        indicators: result.indicators,
        plainEnglish: result.plainEnglish,
      })
      .returning({ id: signals.id });

    // Create placeholder accuracy row for later outcome checking
    await db
      .insert(signalAccuracy)
      .values({
        signalId: saved.id,
        entryPrice: result.price,
        timeframe: "5m",
      })
      .onConflictDoNothing();

    // Fire-and-forget: Discord, trader push, alert rules — don't block response
    if (result.signal !== "HOLD") {
      const strength = signalStrengthValue(result.signal);
      db.select()
        .from(discordWebhooks)
        .where(
          and(
            eq(discordWebhooks.userId, session.userId),
            eq(discordWebhooks.enabled, true)
          )
        )
        .then((userWebhooks) => {
          for (const wh of userWebhooks) {
            if (strength < wh.minSignalStrength) continue;
            const whSymbols = wh.symbols as string[];
            if (whSymbols.length > 0 && !whSymbols.includes(upperSymbol)) continue;
            sendDiscordWebhook(wh.webhookUrl, result).catch(() => {});
          }
        })
        .catch(() => {});
    }

    pushSignalToTrader(result.symbol, result.signal, result.confidence, result.price);

    evaluateAlertRules({
      symbol: upperSymbol,
      price: result.price,
      volume: result.volume,
      signal: result.signal,
    }).catch(() => {});

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("aborted") || message === "Route timeout";
    console.error(`Analysis error [${upperSymbol}]:`, message);
    return NextResponse.json(
      { error: isTimeout ? "Analysis timed out — market data provider may be slow" : "Analysis failed" },
      {
        status: isTimeout ? 504 : 500,
        headers: isTimeout ? { "X-Query-Timeout": "true" } : undefined,
      }
    );
  } finally {
    clearTimeout(routeTimeout);
  }
}
