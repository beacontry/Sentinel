import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, portfolioPositions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { suggestHarvesting, type TaxPosition } from "@/lib/tax-engine";
import { getMarketDataProvider } from "@/lib/market-data";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's portfolios
    const userPortfolios = await db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, session.userId as string));

    const portfolioIds = userPortfolios.map((p) => p.id);

    if (portfolioIds.length === 0) {
      return NextResponse.json(
        { suggestions: [] },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    // Fetch all positions across portfolios
    const allPositions: TaxPosition[] = [];
    const provider = getMarketDataProvider();

    for (const pId of portfolioIds) {
      const positions = await db
        .select()
        .from(portfolioPositions)
        .where(eq(portfolioPositions.portfolioId, pId));

      for (const pos of positions) {
        // Get current price
        const quote = await provider.fetchQuote(pos.symbol).catch(() => null);
        const currentPrice = quote?.price ?? pos.entryPrice;
        const unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;

        allPositions.push({
          symbol: pos.symbol,
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          currentPrice,
          unrealizedPnl,
        });
      }
    }

    const suggestions = suggestHarvesting(allPositions);

    return NextResponse.json(
      { suggestions },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Tax harvesting error:", message);
    return NextResponse.json(
      { error: "Failed to generate harvesting suggestions" },
      { status: 500 }
    );
  }
}
