import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPortfolioValue } from "@/lib/portfolio-sim";
import {
  getBrokerPositionCache,
  resolveBrokerClient,
} from "@/lib/trading-engine";
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

    // Live broker positions — try the engine's in-memory cache first
    // (synchronous, populated when the engine is running). Fall back to
    // a direct broker API call when the cache is cold so a user with a
    // connected broker but no running engine still sees their positions
    // here.
    //
    // Without the fallback, the Portfolio page showed $0.00 for Broker
    // (Live) until the user started the engine — confusing dead-end
    // reported 2026-05-13.
    let brokerPositions: { symbol: string; qty: number; marketValue: number; unrealizedPnl: number }[] = [];
    let cacheAge: number | null = null;
    let brokerSource: "cache" | "live" | "none" = "none";

    const brokerCache = getBrokerPositionCache(session.userId);
    if (brokerCache && brokerCache.positions.length > 0) {
      brokerPositions = brokerCache.positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        marketValue: p.marketValue,
        unrealizedPnl: p.unrealizedPnl,
      }));
      cacheAge = Math.floor((Date.now() - brokerCache.fetchedAt.getTime()) / 1000);
      brokerSource = "cache";
    } else {
      // Cache cold — try a live fetch. Best-effort: log + continue with
      // empty if the broker is unreachable. Don't block the summary on
      // broker downtime.
      try {
        const resolved = await resolveBrokerClient(session.userId);
        if (resolved) {
          const live = await resolved.client.getPositions();
          brokerPositions = live.map((p) => ({
            symbol: p.symbol,
            qty: p.qty,
            marketValue: p.marketValue,
            unrealizedPnl: p.unrealizedPnl,
          }));
          cacheAge = 0;
          brokerSource = "live";
        }
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : "unknown", userId: session.userId },
          "Live broker fetch failed in portfolio summary — falling back to empty",
        );
      }
    }
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
        positions: brokerPositions,
        cacheAge,
        // `source` is informational — UI can show "live" / "cached
        // (Xs ago)" / "none" to help users debug an unexpected $0.
        source: brokerSource,
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
