import { db } from "./db";
import { portfolios, portfolioPositions, portfolioTrades } from "./db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
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
  // Single transaction with atomic, guarded SQL deltas (audit #12). The old
  // read-modify-write off a stale snapshot let two concurrent trades (double-
  // click / two tabs / a BUY racing a SELL) both pass the cash/share check and
  // both write off the same balance — silently losing one delta or overdrawing
  // the account, while BOTH trades were still recorded. Each WHERE-guarded
  // UPDATE makes the check and the write one statement; the row lock serializes
  // concurrent writers, and any throw rolls back the whole trade.
  await db.transaction(async (tx) => {
    const [portfolio] = await tx
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.id, portfolioId))
      .limit(1);
    if (!portfolio) throw new Error("Portfolio not found");

    if (side === "BUY") {
      const cost = shares * price;
      // Deduct cash only if the balance still covers it, atomically.
      const deducted = await tx
        .update(portfolios)
        .set({ currentBalance: sql`${portfolios.currentBalance} - ${cost}` })
        .where(and(eq(portfolios.id, portfolioId), gte(portfolios.currentBalance, cost)))
        .returning({ id: portfolios.id });
      if (deducted.length === 0) throw new Error("Insufficient cash");

      // Upsert the position; weighted-average entry computed in SQL against the
      // EXISTING row so concurrent buys can't lose shares to a stale read.
      await tx
        .insert(portfolioPositions)
        .values({ portfolioId, symbol, quantity: shares, entryPrice: price })
        .onConflictDoUpdate({
          target: [portfolioPositions.portfolioId, portfolioPositions.symbol],
          set: {
            entryPrice: sql`(${portfolioPositions.entryPrice} * ${portfolioPositions.quantity} + ${price * shares}) / (${portfolioPositions.quantity} + ${shares})`,
            quantity: sql`${portfolioPositions.quantity} + ${shares}`,
          },
        });
    } else {
      // SELL — decrement shares only if enough are held, atomically.
      const proceeds = shares * price;
      const sold = await tx
        .update(portfolioPositions)
        .set({ quantity: sql`${portfolioPositions.quantity} - ${shares}` })
        .where(
          and(
            eq(portfolioPositions.portfolioId, portfolioId),
            eq(portfolioPositions.symbol, symbol),
            gte(portfolioPositions.quantity, shares)
          )
        )
        .returning({ id: portfolioPositions.id, quantity: portfolioPositions.quantity });
      if (sold.length === 0) throw new Error("Insufficient shares");

      // Drop a now-empty lot.
      if (sold[0].quantity <= 0) {
        await tx.delete(portfolioPositions).where(eq(portfolioPositions.id, sold[0].id));
      }

      // Credit proceeds atomically.
      await tx
        .update(portfolios)
        .set({ currentBalance: sql`${portfolios.currentBalance} + ${proceeds}` })
        .where(eq(portfolios.id, portfolioId));
    }

    // Record the trade only after the balance/position mutation succeeded.
    await tx.insert(portfolioTrades).values({
      portfolioId,
      symbol,
      action: side,
      quantity: shares,
      price,
    });
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
