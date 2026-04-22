import { db } from "./db";
import { signals, signalAccuracy } from "./db/schema";
import { eq, isNull, isNotNull, lte, and, sql } from "drizzle-orm";
import { getMarketDataProvider } from "./market-data";

/**
 * Check the outcome of a signal by comparing entry price to current price.
 * BUY/STRONG_BUY is correct if price went up; SELL/STRONG_SELL if price went down.
 */
export async function checkSignalOutcome(signalId: string): Promise<void> {
  const rows = await db
    .select({
      id: signalAccuracy.id,
      entryPrice: signalAccuracy.entryPrice,
      signalType: signals.signal,
      symbol: signals.symbol,
    })
    .from(signalAccuracy)
    .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
    .where(eq(signalAccuracy.signalId, signalId))
    .limit(1);

  if (rows.length === 0) return;

  const row = rows[0];
  if (!row.symbol || !row.entryPrice) return;

  const provider = getMarketDataProvider();
  const quote = await provider.fetchQuote(row.symbol);
  if (!quote) return;

  const exitPrice = quote.price;
  const actualReturn = ((exitPrice - row.entryPrice) / row.entryPrice) * 100;

  const isBuySignal = row.signalType === "BUY" || row.signalType === "STRONG_BUY";
  const isSellSignal = row.signalType === "SELL" || row.signalType === "STRONG_SELL";
  const wasCorrect =
    (isBuySignal && actualReturn > 0) ||
    (isSellSignal && actualReturn < 0);

  await db
    .update(signalAccuracy)
    .set({
      exitPrice,
      actualReturn,
      wasCorrect,
      measuredAt: new Date(),
    })
    .where(eq(signalAccuracy.id, row.id));
}

/** Map timeframe to appropriate hold period in hours before checking accuracy. */
export function holdHoursForTimeframe(timeframe: string | null, checkHours: number | null): number {
  if (checkHours && checkHours > 0) return checkHours;
  switch (timeframe) {
    case "5m": return 2;    // Intraday signals: check after 2 hours
    case "1d": return 72;   // Daily signals: check after 3 trading days
    default: return 24;     // Unknown: default 24 hours
  }
}

/**
 * Batch check signals that are old enough but haven't been measured yet.
 * Uses timeframe-aware hold periods — 5-min signals are checked after 2 hours,
 * daily signals after 3 trading days.
 * Returns the number of signals checked.
 */
export async function batchCheckAccuracy(maxBatch: number = 50): Promise<number> {
  // Fetch unchecked signals with their timeframe info
  const unchecked = await db
    .select({
      signalId: signalAccuracy.signalId,
      timeframe: signalAccuracy.timeframe,
      checkHours: signalAccuracy.checkHours,
      createdAt: signals.createdAt,
    })
    .from(signalAccuracy)
    .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
    .where(isNull(signalAccuracy.exitPrice))
    .limit(maxBatch * 2); // Fetch extra since some may not be ready yet

  const now = Date.now();
  let checked = 0;

  for (const row of unchecked) {
    if (checked >= maxBatch) break;

    // Only check if enough time has passed for this signal's timeframe
    const holdMs = holdHoursForTimeframe(row.timeframe, row.checkHours) * 60 * 60 * 1000;
    const ageMs = now - new Date(row.createdAt).getTime();
    if (ageMs < holdMs) continue;

    try {
      await checkSignalOutcome(row.signalId);
      checked++;
    } catch {
      // Skip failed checks — will retry next batch
    }
  }

  return checked;
}

/**
 * Get accuracy stats for a symbol.
 */
export async function getAccuracyStats(symbol?: string) {
  const conditions = [isNotNull(signalAccuracy.exitPrice)];
  if (symbol) {
    conditions.push(eq(signals.symbol, symbol));
  }

  const rows = await db
    .select({
      totalSignals: sql<number>`count(*)`.as("total"),
      correctSignals: sql<number>`count(*) filter (where ${signalAccuracy.wasCorrect} = true)`.as("correct"),
      avgReturn: sql<number>`avg(${signalAccuracy.actualReturn})`.as("avg_return"),
    })
    .from(signalAccuracy)
    .innerJoin(signals, eq(signalAccuracy.signalId, signals.id))
    .where(and(...conditions));

  const row = rows[0];
  const total = Number(row?.totalSignals ?? 0);
  const correct = Number(row?.correctSignals ?? 0);

  return {
    totalSignals: total,
    correctSignals: correct,
    accuracy: total > 0 ? correct / total : 0,
    avgReturn: Number(row?.avgReturn ?? 0),
  };
}
