import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, portfolioPositions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("tax-harvesting");
import { suggestHarvesting, type TaxPosition } from "@/lib/tax-engine";
import { getMarketDataProvider } from "@/lib/market-data";
import { getBrokerPositionCache } from "@/lib/trading-engine";
import { checkTier } from "@/lib/tiers-server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    // Get user's portfolios
    const userPortfolios = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, session.userId as string));

    const portfolioIds = userPortfolios.map((p) => p.id);

    const allPositions: TaxPosition[] = [];
    const provider = getMarketDataProvider();

    // 1. Manual portfolio positions
    for (const pId of portfolioIds) {
      const positions = await db
        .select()
        .from(portfolioPositions)
        .where(eq(portfolioPositions.portfolioId, pId));

      for (const pos of positions) {
        const quote = await provider.fetchQuote(pos.symbol).catch(() => null);
        const currentPrice = quote?.price ?? pos.entryPrice;
        const unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;

        allPositions.push({
          symbol: pos.symbol,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          currentPrice,
          unrealizedPnl,
          // Manual positions carry an entry date → holding-period-aware rate
          // (audit #9). Broker positions below have no lot date, so they're
          // left undefined and treated as short-term.
          acquisitionDate: pos.entryDate,
        });
      }
    }

    // 2. Live engine positions (broker cache; broker is source of truth)
    const brokerCache = getBrokerPositionCache(session.userId as string);
    if (brokerCache) {
      for (const pos of brokerCache.positions) {
        if (pos.qty <= 0) continue;
        allPositions.push({
          symbol: pos.symbol,
          quantity: pos.qty,
          entryPrice: pos.avgEntryPrice,
          currentPrice: pos.currentPrice,
          unrealizedPnl: pos.unrealizedPnl,
        });
      }
    }

    if (allPositions.length === 0) {
      return NextResponse.json(
        { suggestions: [] },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const suggestions = suggestHarvesting(allPositions);

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Tax harvesting error");
    return NextResponse.json(
      { error: "Failed to generate harvesting suggestions" },
      { status: 500 }
    );
  }
}
