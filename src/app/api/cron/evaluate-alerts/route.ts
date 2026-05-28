import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alertRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { safeCompare } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeBars } from "@/lib/indicators/analyzer";
import { evaluateAlertRules } from "@/lib/alert-engine";
import { isMarketOpen } from "@/lib/market-hours";

const log = createRouteLogger("cron-evaluate-alerts");

/**
 * Scheduled alert evaluator. Replaces the old "evaluate when someone happens
 * to analyze the symbol" trigger, which keyed rules by symbol-only (so a
 * stranger's analyze drove your rule, and a symbol nobody analyzed was never
 * checked → missed alerts). Runs every ~5 min during market hours: one data
 * fetch per distinct enabled-rule symbol, then evaluates every rule on that
 * symbol against fresh data. Per-rule edge-trigger + cooldown live in
 * alert-engine. Auth: x-cron-secret vs CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || !secret || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Outside regular trading hours the data is stale (prior close), so alerts
  // would evaluate against yesterday's values. Skip cleanly.
  if (!isMarketOpen()) {
    return NextResponse.json({ status: "skipped", reason: "market_closed" });
  }

  const rows = await db
    .selectDistinct({ symbol: alertRules.symbol })
    .from(alertRules)
    .where(eq(alertRules.enabled, true));
  const symbols = rows.map((r) => r.symbol);

  const provider = getMarketDataProvider();
  let evaluated = 0;
  let fired = 0;
  let errored = 0;

  for (const symbol of symbols) {
    try {
      const bars = await provider.fetchBars(symbol, 60, "1d");
      if (bars.length < 10) continue;
      const analysis = analyzeBars(symbol, bars);
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const avgVolume = bars.reduce((s, b) => s + b.volume, 0) / bars.length;

      fired += await evaluateAlertRules({
        symbol,
        price: analysis.price,
        volume: last.volume,
        avgVolume,
        previousPrice: prev?.close,
        signal: analysis.signal,
        indicators: analysis.indicators,
      });
      evaluated++;
    } catch (err) {
      errored++;
      log.warn(
        { symbol, err: err instanceof Error ? err.message : "unknown" },
        "Alert evaluation failed for symbol"
      );
    }
  }

  log.info({ symbols: symbols.length, evaluated, fired, errored }, "Alert evaluation cron complete");
  return NextResponse.json({ status: "ok", symbols: symbols.length, evaluated, fired, errored });
}
