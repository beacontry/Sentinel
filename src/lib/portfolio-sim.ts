import { db } from "./db";
import { portfolios, portfolioPositions, portfolioTrades } from "./db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getMarketDataProvider } from "./market-data";

export async function createPortfolio(userId: string, name: string, initialCash: number = 10000) {
  const [portfolio] = await db
    .insert(portfolios)
    .values({ userId, name, initialBalance: initialCash, currentBalance: initialCash })
    .returning();
  return portfolio;
}

export async function getUserPortfolios(userId: string) {
  return db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(portfolios.createdAt);
}

export async function getPortfolioDetails(portfolioId: string) {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!portfolio) return null;

  const positions = await db
    .select()
    .from(portfolioPositions)
    .where(eq(portfolioPositions.portfolioId, portfolioId));

  const trades = await db
    .select()
    .from(portfolioTrades)
    .where(eq(portfolioTrades.portfolioId, portfolioId))
    .orderBy(sql`${portfolioTrades.executedAt} DESC`)
    .limit(50);

  return { portfolio, positions, trades };
}

export async function executeTrade(
  portfolioId: string,
  symbol: string,
  side: "BUY" | "SELL",
  shares: number,
  price: number
) {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);

  if (!portfolio) throw new Error("Portfolio not found");

  if (side === "BUY") {
    const cost = shares * price;
    if (cost > portfolio.currentBalance) {
      throw new Error("Insufficient cash");
    }

    // Deduct cash
    await db
      .update(portfolios)
      .set({ currentBalance: portfolio.currentBalance - cost })
      .where(eq(portfolios.id, portfolioId));

    // Update or create position
    const [existing] = await db
      .select()
      .from(portfolioPositions)
      .where(
        and(
          eq(portfolioPositions.portfolioId, portfolioId),
          eq(portfolioPositions.symbol, symbol)
        )
      )
      .limit(1);

    if (existing) {
      const totalCost = existing.entryPrice * existing.quantity + price * shares;
      const totalShares = existing.quantity + shares;
      await db
        .update(portfolioPositions)
        .set({
          quantity: totalShares,
          entryPrice: totalCost / totalShares,
        })
        .where(eq(portfolioPositions.id, existing.id));
    } else {
      await db.insert(portfolioPositions).values({
        portfolioId,
        symbol,
        quantity: shares,
        entryPrice: price,
      });
    }
  } else {
    // SELL
    const [position] = await db
      .select()
      .from(portfolioPositions)
      .where(
        and(
          eq(portfolioPositions.portfolioId, portfolioId),
          eq(portfolioPositions.symbol, symbol)
        )
      )
      .limit(1);

    if (!position || position.quantity < shares) {
      throw new Error("Insufficient shares");
    }

    const proceeds = shares * price;

    // Add cash
    await db
      .update(portfolios)
      .set({ currentBalance: portfolio.currentBalance + proceeds })
      .where(eq(portfolios.id, portfolioId));

    // Update or remove position
    const remaining = position.quantity - shares;
    if (remaining === 0) {
      await db
        .delete(portfolioPositions)
        .where(eq(portfolioPositions.id, position.id));
    } else {
      await db
        .update(portfolioPositions)
        .set({ quantity: remaining })
        .where(eq(portfolioPositions.id, position.id));
    }
  }

  // Record trade
  await db.insert(portfolioTrades).values({
    portfolioId,
    symbol,
    action: side,
    quantity: shares,
    price,
  });
}

export async function getPortfolioValue(portfolioId: string): Promise<number> {
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1);
  if (!portfolio) return 0;

  const positions = await db
    .select()
    .from(portfolioPositions)
    .where(eq(portfolioPositions.portfolioId, portfolioId));

  let totalValue = portfolio.currentBalance;
  const provider = getMarketDataProvider();

  for (const pos of positions) {
    const quote = await provider.fetchQuote(pos.symbol);
    if (quote) {
      totalValue += quote.price * pos.quantity;
    } else {
      totalValue += pos.entryPrice * pos.quantity;
    }
  }

  return totalValue;
}
