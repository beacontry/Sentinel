import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPortfolioDetails, getPortfolioValue } from "@/lib/portfolio-sim";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("portfolio-detail");
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const [portfolio] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, id))
        .limit(1);
    });

    if (!portfolio || portfolio.userId !== session.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const details = await getPortfolioDetails(id);
    if (!details) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Enrich positions with current prices
    const provider = getMarketDataProvider();
    const enrichedPositions = await Promise.all(
      details.positions.map(async (pos) => {
        const quote = await provider.fetchQuote(pos.symbol);
        const currentPrice = quote?.price ?? pos.entryPrice;
        const marketValue = currentPrice * pos.quantity;
        const unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
        const unrealizedPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        return {
          ...pos,
          entryDate: pos.entryDate.toISOString(),
          currentPrice,
          marketValue,
          unrealizedPnl,
          unrealizedPct,
        };
      })
    );

    const totalValue = await getPortfolioValue(id);

    return NextResponse.json({
      portfolio: {
        ...details.portfolio,
        createdAt: details.portfolio.createdAt.toISOString(),
        currentValue: totalValue,
        totalReturn: ((totalValue - details.portfolio.initialBalance) / details.portfolio.initialBalance) * 100,
      },
      positions: enrichedPositions,
      trades: details.trades.map((t) => ({
        ...t,
        executedAt: t.executedAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Portfolio detail error");
    return NextResponse.json({ error: "Failed to load portfolio" }, { status: 500 });
  }
}
