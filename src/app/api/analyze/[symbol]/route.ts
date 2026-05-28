import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeHybrid } from "@/lib/hybrid";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { signals, signalAccuracy } from "@/lib/db/schema";
import { sendDiscordWebhook, signalStrengthValue } from "@/lib/discord";
import { discordWebhooks } from "@/lib/db/schema";
import { pushSignalToTrader } from "@/lib/trader-push";
import { eq, and } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("analyze");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

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
    const url = new URL(_request.url);

    // Allow callers to specify timeframe (screener uses 90d daily bars)
    const daysParam = parseInt(url.searchParams.get("days") ?? "5", 10);
    const resolutionParam = url.searchParams.get("resolution") ?? "5m";
    const days = daysParam > 0 && daysParam <= 365 ? daysParam : 5;
    const resolution = resolutionParam === "1d" ? "1d" : "5m";

    const bars = await provider.fetchBars(upperSymbol, days, resolution);

    if (controller.signal.aborted) throw new Error("Route timeout");

    if (bars.length < 30) {
      return NextResponse.json(
        { error: "Not enough data for analysis" },
        { status: 422 }
      );
    }

    // Check if AI scoring is explicitly requested via query param
    const enableAi = url.searchParams.get("ai") === "true";

    const result = await analyzeHybrid(upperSymbol, bars, {
      enableAiScoring: enableAi,
    });

    if (controller.signal.aborted) throw new Error("Route timeout");

    // Persist the signal
    const [saved] = await withTimeout(3000, async (tx) => {
      const [s] = await tx
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
      await tx
        .insert(signalAccuracy)
        .values({
          signalId: s.id,
          entryPrice: result.price,
          timeframe: resolution,
        })
        .onConflictDoNothing();

      return [s];
    });

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
            sendDiscordWebhook(wh.webhookUrl, result).catch((err) => {
              log.warn({ err: err instanceof Error ? err.message : String(err), symbol: upperSymbol }, "Discord webhook failed");
            });
          }
        })
        .catch((err) => {
          log.warn({ err: err instanceof Error ? err.message : String(err) }, "Failed to query Discord webhooks");
        });
    }

    pushSignalToTrader(result.symbol, result.signal, result.confidence, result.price);

    // Alert rules are now evaluated by the scheduled /api/cron/evaluate-alerts
    // job (per-user, on fresh data, market-hours-gated). The old fire-here
    // path keyed rules by symbol-only, so a stranger's analyze drove your
    // rule and symbols nobody analyzed were never checked.

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("aborted") || message === "Route timeout";
    log.error({ err: message, symbol: upperSymbol }, "Analysis error");
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
