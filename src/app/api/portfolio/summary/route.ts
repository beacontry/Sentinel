import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPortfolioValue } from "@/lib/portfolio-sim";
import { getBrokerPositionCache } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("portfolio-summary");

/**
 * Aggregate net worth across all the user's portfolios + live broker positions.
 *
 * Sources:
 *   - portfolios + getPortfolioValue() for manual paper portfolios
 *   - getBrokerPositionCache(userId) for live broker positions (in-memory cache,
 *     populated by the trading engine; null if engine hasn't run)
 *
 * Returns separate breakdown so the UI can display sources distinctly. Cash
 * balances aren't tracked here — out of scope for v1; broker provides positions
 * only via cache.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withTimeout(5000, async (tx) => {
      // Manual portfolios
      const userPortfolios = await tx
        .select({
          id: portfolios.id,
          name: portfolios.name,
        })
        .from(portfolios)
        .where(eq(portfolios.userId, session.userId));

      // Sum portfolio values (one query per portfolio — small N expected)
      let manualTotal = 0;
      const portfolioBreakdown: { id: string; name: string; value: number }[] = [];
      for (const p of userPortfolios) {
        try {
          const v = await getPortfolioValue(p.id);
          manualTotal += v;
          portfolioBreakdown.push({ id: p.id, name: p.name, value: v });
        } catch (err) {
          // One bad portfolio shouldn't kill the summary
          const message = err instanceof Error ? err.message : "Unknown error";
          log.warn({ err: message, portfolioId: p.id }, "Portfolio value lookup failed");
        }
      }

      return { portfolioBreakdown, manualTotal };
    });

    // Live broker positions (in-memory cache — synchronous lookup)
    const brokerCache = getBrokerPositionCache(session.userId);
    const brokerPositions = brokerCache?.positions ?? [];
    const brokerTotal = brokerPositions.reduce(
      (acc, p) => acc + p.marketValue,
      0,
    );

    const total = result.manualTotal + brokerTotal;

    return NextResponse.json({
      total,
      manual: {
        total: result.manualTotal,
        portfolios: result.portfolioBreakdown,
      },
      broker: {
        total: brokerTotal,
        positions: brokerPositions.map((p) => ({
          symbol: p.symbol,
          qty: p.qty,
          marketValue: p.marketValue,
          unrealizedPnl: p.unrealizedPnl,
        })),
        cacheAge: brokerCache
          ? Math.floor((Date.now() - brokerCache.fetchedAt.getTime()) / 1000)
          : null,
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Net worth summary failed");
    return NextResponse.json(
      { error: "Failed to compute summary" },
      { status: 500 },
    );
  }
}
