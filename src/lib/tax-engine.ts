// ─── Tax Engine ────────────────────────────────────────────────────
// Compute short-term vs long-term capital gains from trade history
// and suggest tax-loss harvesting opportunities.

const SHORT_TERM_RATE = 0.22;
const LONG_TERM_RATE = 0.15;
const LONG_TERM_DAYS = 365;
const WASH_SALE_DAYS = 30;

export interface TaxTrade {
  symbol: string;
  action: string; // "BUY" | "SELL"
  quantity: number;
  price: number;
  executedAt: string; // ISO date
}

export interface TaxSummary {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netGain: number;
  estimatedTax: number;
  tradeCount: number;
}

export interface HarvestingSuggestion {
  symbol: string;
  currentLoss: number;
  potentialSavings: number;
  washSaleDate: string; // ISO date — earliest date to re-buy
  quantity: number;
  entryPrice: number;
  currentPrice: number;
}

export interface TaxPosition {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

/**
 * Calculate tax summary from a list of trades.
 * Matches BUY → SELL in FIFO order to compute realized gains/losses.
 */
export function calculateTaxSummary(trades: TaxTrade[]): TaxSummary {
  // Build cost basis lots per symbol (FIFO)
  const lots: Map<string, { quantity: number; price: number; date: Date }[]> = new Map();
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;
  let tradeCount = 0;

  // Sort trades chronologically
  const sorted = [...trades].sort(
    (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
  );

  for (const trade of sorted) {
    const symbol = trade.symbol.toUpperCase();

    if (trade.action === "BUY") {
      const symbolLots = lots.get(symbol) ?? [];
      symbolLots.push({
        quantity: trade.quantity,
        price: trade.price,
        date: new Date(trade.executedAt),
      });
      lots.set(symbol, symbolLots);
      continue;
    }

    // SELL — match against earliest lots (FIFO)
    if (trade.action === "SELL") {
      const symbolLots = lots.get(symbol) ?? [];
      let remaining = trade.quantity;
      const sellDate = new Date(trade.executedAt);

      while (remaining > 0 && symbolLots.length > 0) {
        const lot = symbolLots[0];
        const matched = Math.min(remaining, lot.quantity);

        const gainPerShare = trade.price - lot.price;
        const totalGain = gainPerShare * matched;
        const holdingDays = Math.floor(
          (sellDate.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isLongTerm = holdingDays >= LONG_TERM_DAYS;

        if (totalGain >= 0) {
          if (isLongTerm) longTermGains += totalGain;
          else shortTermGains += totalGain;
        } else {
          if (isLongTerm) longTermLosses += Math.abs(totalGain);
          else shortTermLosses += Math.abs(totalGain);
        }

        remaining -= matched;
        lot.quantity -= matched;
        if (lot.quantity <= 0) symbolLots.shift();
        tradeCount++;
      }

      lots.set(symbol, symbolLots);
    }
  }

  const netShort = shortTermGains - shortTermLosses;
  const netLong = longTermGains - longTermLosses;
  const netGain = netShort + netLong;

  const estimatedTax =
    Math.max(0, netShort) * SHORT_TERM_RATE +
    Math.max(0, netLong) * LONG_TERM_RATE;

  return {
    shortTermGains: Math.round(shortTermGains * 100) / 100,
    shortTermLosses: Math.round(shortTermLosses * 100) / 100,
    longTermGains: Math.round(longTermGains * 100) / 100,
    longTermLosses: Math.round(longTermLosses * 100) / 100,
    netGain: Math.round(netGain * 100) / 100,
    estimatedTax: Math.round(estimatedTax * 100) / 100,
    tradeCount,
  };
}

/**
 * Suggest tax-loss harvesting opportunities from positions with unrealized losses.
 * Recommends selling losers to offset gains, with wash-sale date warning.
 */
export function suggestHarvesting(positions: TaxPosition[]): HarvestingSuggestion[] {
  const suggestions: HarvestingSuggestion[] = [];

  for (const pos of positions) {
    if (pos.unrealizedPnl >= 0) continue; // only losses

    const currentLoss = Math.abs(pos.unrealizedPnl);
    // Potential savings at the higher short-term rate
    const potentialSavings = Math.round(currentLoss * SHORT_TERM_RATE * 100) / 100;

    const now = new Date();
    const washSaleDate = new Date(now.getTime() + WASH_SALE_DAYS * 24 * 60 * 60 * 1000);

    suggestions.push({
      symbol: pos.symbol,
      currentLoss: Math.round(currentLoss * 100) / 100,
      potentialSavings,
      washSaleDate: washSaleDate.toISOString().slice(0, 10),
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
    });
  }

  // Sort by largest potential savings first
  suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);

  return suggestions;
}
