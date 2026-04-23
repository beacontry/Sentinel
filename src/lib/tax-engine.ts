// ─── Tax Engine ────────────────────────────────────────────────────
// Compute short-term vs long-term capital gains from trade history,
// generate Form 8949 lot-level detail, and suggest tax-loss harvesting.

const LONG_TERM_DAYS = 365;
const WASH_SALE_DAYS = 30;

// ─── Tax bracket tables (2024 rates) ──────────────────────────────

export type FilingStatus = "single" | "married_joint" | "married_separate" | "head_of_household";

interface TaxBracket {
  min: number;
  max: number;
  rate: number;
}

const ORDINARY_BRACKETS: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  married_joint: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
  married_separate: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 365600, rate: 0.35 },
    { min: 365600, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 16550, rate: 0.10 },
    { min: 16550, max: 63100, rate: 0.12 },
    { min: 63100, max: 100500, rate: 0.22 },
    { min: 100500, max: 191950, rate: 0.24 },
    { min: 191950, max: 243700, rate: 0.32 },
    { min: 243700, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
};

// Long-term capital gains brackets
const LTCG_BRACKETS: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { min: 0, max: 47025, rate: 0.00 },
    { min: 47025, max: 518900, rate: 0.15 },
    { min: 518900, max: Infinity, rate: 0.20 },
  ],
  married_joint: [
    { min: 0, max: 94050, rate: 0.00 },
    { min: 94050, max: 583750, rate: 0.15 },
    { min: 583750, max: Infinity, rate: 0.20 },
  ],
  married_separate: [
    { min: 0, max: 47025, rate: 0.00 },
    { min: 47025, max: 291850, rate: 0.15 },
    { min: 291850, max: Infinity, rate: 0.20 },
  ],
  head_of_household: [
    { min: 0, max: 63000, rate: 0.00 },
    { min: 63000, max: 551350, rate: 0.15 },
    { min: 551350, max: Infinity, rate: 0.20 },
  ],
};

function getMarginalRate(brackets: TaxBracket[], taxableIncome: number): number {
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].min) return brackets[i].rate;
  }
  return brackets[0].rate;
}

function calculateBracketTax(brackets: TaxBracket[], amount: number): number {
  if (amount <= 0) return 0;
  let tax = 0;
  let remaining = amount;
  for (const bracket of brackets) {
    const width = bracket.max - bracket.min;
    const taxable = Math.min(remaining, width);
    tax += taxable * bracket.rate;
    remaining -= taxable;
    if (remaining <= 0) break;
  }
  return tax;
}

// ─── Types ────────────────────────────────────────────────────────

export interface TaxTrade {
  symbol: string;
  action: string; // "BUY" | "SELL"
  quantity: number;
  price: number;
  executedAt: string; // ISO date
  source?: "portfolio" | "engine"; // where the trade came from
}

/** A single matched lot — one line on Form 8949 */
export interface Form8949Line {
  symbol: string;
  dateAcquired: string;  // YYYY-MM-DD
  dateSold: string;      // YYYY-MM-DD
  proceeds: number;      // sale price × quantity
  costBasis: number;     // purchase price × quantity
  quantity: number;
  gainLoss: number;      // proceeds - costBasis (adjusted for wash sale)
  holdingDays: number;
  isLongTerm: boolean;
  washSale: boolean;     // flagged if wash sale detected
  washSaleDisallowed: number; // disallowed loss amount added to replacement cost basis
  source: "portfolio" | "engine";
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

export interface Form8949Result {
  lines: Form8949Line[];
  summary: TaxSummary;
  scheduleDSummary: ScheduleDSummary;
}

export interface ScheduleDSummary {
  // Part I — Short-term
  shortTermProceeds: number;
  shortTermCostBasis: number;
  shortTermGainLoss: number;
  shortTermWashSaleAdj: number;
  // Part II — Long-term
  longTermProceeds: number;
  longTermCostBasis: number;
  longTermGainLoss: number;
  longTermWashSaleAdj: number;
  // Totals
  netShortTerm: number;
  netLongTerm: number;
  totalGainLoss: number;
  // Tax estimate
  estimatedTax: number;
  effectiveRate: number;
  filingStatus: FilingStatus;
  ordinaryIncome: number;
  // Loss carryforward
  capitalLossCarryforward: number; // excess losses beyond $3,000 deduction limit
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

export interface TaxCalcOptions {
  filingStatus?: FilingStatus;
  ordinaryIncome?: number; // other income for marginal rate estimation
}

// ─── Form 8949 Generator ──────────────────────────────────────────

/**
 * Generate Form 8949 lot-level detail with wash sale detection.
 * Uses FIFO matching. Detects wash sales when the same symbol is
 * repurchased within 30 days before or after a loss sale.
 */
export function generateForm8949(
  trades: TaxTrade[],
  options: TaxCalcOptions = {}
): Form8949Result {
  const {
    filingStatus = "single",
    ordinaryIncome = 50000,
  } = options;

  const sorted = [...trades].sort(
    (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
  );

  // Build all BUY events indexed by symbol for wash sale lookups
  const buyEvents: Map<string, { date: Date; price: number; quantity: number }[]> = new Map();
  for (const t of sorted) {
    if (t.action === "BUY") {
      const sym = t.symbol.toUpperCase();
      const list = buyEvents.get(sym) ?? [];
      list.push({ date: new Date(t.executedAt), price: t.price, quantity: t.quantity });
      buyEvents.set(sym, list);
    }
  }

  // FIFO lot matching
  const lots: Map<string, { quantity: number; price: number; date: Date; source: "portfolio" | "engine" }[]> = new Map();
  const lines: Form8949Line[] = [];

  for (const trade of sorted) {
    const symbol = trade.symbol.toUpperCase();
    const source = trade.source ?? "portfolio";

    if (trade.action === "BUY") {
      const symbolLots = lots.get(symbol) ?? [];
      symbolLots.push({
        quantity: trade.quantity,
        price: trade.price,
        date: new Date(trade.executedAt),
        source,
      });
      lots.set(symbol, symbolLots);
      continue;
    }

    if (trade.action === "SELL") {
      const symbolLots = lots.get(symbol) ?? [];
      let remaining = trade.quantity;
      const sellDate = new Date(trade.executedAt);

      while (remaining > 0 && symbolLots.length > 0) {
        const lot = symbolLots[0];
        const matched = Math.min(remaining, lot.quantity);

        const proceeds = trade.price * matched;
        const costBasis = lot.price * matched;
        const gainLoss = proceeds - costBasis;
        const holdingDays = Math.floor(
          (sellDate.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isLongTerm = holdingDays >= LONG_TERM_DAYS;

        // Wash sale detection: did we buy the same symbol within
        // 30 days before or after this loss sale?
        let washSale = false;
        let washSaleDisallowed = 0;
        if (gainLoss < 0) {
          const symbolBuys = buyEvents.get(symbol) ?? [];
          const windowStart = sellDate.getTime() - WASH_SALE_DAYS * 86400000;
          const windowEnd = sellDate.getTime() + WASH_SALE_DAYS * 86400000;
          for (const buy of symbolBuys) {
            const buyTime = buy.date.getTime();
            // Exclude the original purchase lot itself
            if (buyTime === lot.date.getTime() && buy.price === lot.price) continue;
            if (buyTime >= windowStart && buyTime <= windowEnd) {
              washSale = true;
              washSaleDisallowed = Math.abs(gainLoss);
              break;
            }
          }
        }

        lines.push({
          symbol,
          dateAcquired: lot.date.toISOString().slice(0, 10),
          dateSold: sellDate.toISOString().slice(0, 10),
          proceeds: round2(proceeds),
          costBasis: round2(costBasis),
          quantity: matched,
          gainLoss: round2(washSale ? 0 : gainLoss), // disallowed loss = 0 reported gain
          holdingDays,
          isLongTerm,
          washSale,
          washSaleDisallowed: round2(washSaleDisallowed),
          source: lot.source,
        });

        remaining -= matched;
        lot.quantity -= matched;
        if (lot.quantity <= 0) symbolLots.shift();
      }

      lots.set(symbol, symbolLots);
    }
  }

  // Build Schedule D summary
  const shortTermLines = lines.filter((l) => !l.isLongTerm);
  const longTermLines = lines.filter((l) => l.isLongTerm);

  const shortTermProceeds = sumField(shortTermLines, "proceeds");
  const shortTermCostBasis = sumField(shortTermLines, "costBasis");
  const shortTermWashSaleAdj = sumField(shortTermLines, "washSaleDisallowed");
  const shortTermGainLoss = sumField(shortTermLines, "gainLoss");

  const longTermProceeds = sumField(longTermLines, "proceeds");
  const longTermCostBasis = sumField(longTermLines, "costBasis");
  const longTermWashSaleAdj = sumField(longTermLines, "washSaleDisallowed");
  const longTermGainLoss = sumField(longTermLines, "gainLoss");

  const netShortTerm = shortTermGainLoss;
  const netLongTerm = longTermGainLoss;
  const totalGainLoss = netShortTerm + netLongTerm;

  // Capital loss limitation: max $3,000 deduction per year ($1,500 married filing separately)
  const lossLimit = filingStatus === "married_separate" ? 1500 : 3000;
  const capitalLossCarryforward = totalGainLoss < -lossLimit
    ? Math.abs(totalGainLoss) - lossLimit
    : 0;

  // Tax estimation
  const shortTermTax = netShortTerm > 0
    ? calculateBracketTax(ORDINARY_BRACKETS[filingStatus], ordinaryIncome + netShortTerm)
      - calculateBracketTax(ORDINARY_BRACKETS[filingStatus], ordinaryIncome)
    : netShortTerm < 0
      ? -(getMarginalRate(ORDINARY_BRACKETS[filingStatus], ordinaryIncome) * Math.min(Math.abs(netShortTerm), lossLimit))
      : 0;

  const longTermTax = netLongTerm > 0
    ? calculateBracketTax(LTCG_BRACKETS[filingStatus], ordinaryIncome + netLongTerm)
      - calculateBracketTax(LTCG_BRACKETS[filingStatus], ordinaryIncome)
    : 0;

  const estimatedTax = round2(Math.max(0, shortTermTax + longTermTax));
  const effectiveRate = totalGainLoss > 0 ? round2((estimatedTax / totalGainLoss) * 100) : 0;

  // Legacy summary (used by tax-center)
  const shortTermGains = sumField(shortTermLines.filter(l => l.gainLoss > 0), "gainLoss");
  const shortTermLosses = Math.abs(sumField(shortTermLines.filter(l => l.gainLoss < 0), "gainLoss"));
  const longTermGains = sumField(longTermLines.filter(l => l.gainLoss > 0), "gainLoss");
  const longTermLosses = Math.abs(sumField(longTermLines.filter(l => l.gainLoss < 0), "gainLoss"));

  return {
    lines,
    summary: {
      shortTermGains: round2(shortTermGains),
      shortTermLosses: round2(shortTermLosses),
      longTermGains: round2(longTermGains),
      longTermLosses: round2(longTermLosses),
      netGain: round2(totalGainLoss),
      estimatedTax,
      tradeCount: lines.length,
    },
    scheduleDSummary: {
      shortTermProceeds: round2(shortTermProceeds),
      shortTermCostBasis: round2(shortTermCostBasis),
      shortTermGainLoss: round2(shortTermGainLoss),
      shortTermWashSaleAdj: round2(shortTermWashSaleAdj),
      longTermProceeds: round2(longTermProceeds),
      longTermCostBasis: round2(longTermCostBasis),
      longTermGainLoss: round2(longTermGainLoss),
      longTermWashSaleAdj: round2(longTermWashSaleAdj),
      netShortTerm: round2(netShortTerm),
      netLongTerm: round2(netLongTerm),
      totalGainLoss: round2(totalGainLoss),
      estimatedTax,
      effectiveRate,
      filingStatus,
      ordinaryIncome,
      capitalLossCarryforward: round2(capitalLossCarryforward),
    },
  };
}

/**
 * Calculate tax summary from a list of trades (legacy wrapper).
 * Matches BUY → SELL in FIFO order to compute realized gains/losses.
 */
export function calculateTaxSummary(trades: TaxTrade[]): TaxSummary {
  return generateForm8949(trades).summary;
}

/**
 * Suggest tax-loss harvesting opportunities from positions with unrealized losses.
 * Recommends selling losers to offset gains, with wash-sale date warning.
 */
export function suggestHarvesting(
  positions: TaxPosition[],
  filingStatus: FilingStatus = "single",
  ordinaryIncome: number = 50000,
): HarvestingSuggestion[] {
  const suggestions: HarvestingSuggestion[] = [];
  const marginalRate = getMarginalRate(ORDINARY_BRACKETS[filingStatus], ordinaryIncome);

  for (const pos of positions) {
    if (pos.unrealizedPnl >= 0) continue; // only losses

    const currentLoss = Math.abs(pos.unrealizedPnl);
    const potentialSavings = round2(currentLoss * marginalRate);

    const now = new Date();
    const washSaleDate = new Date(now.getTime() + WASH_SALE_DAYS * 86400000);

    suggestions.push({
      symbol: pos.symbol,
      currentLoss: round2(currentLoss),
      potentialSavings,
      washSaleDate: washSaleDate.toISOString().slice(0, 10),
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
    });
  }

  suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);
  return suggestions;
}

// ─── Helpers ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumField(items: Form8949Line[], field: keyof Form8949Line): number {
  return items.reduce((acc, item) => acc + (item[field] as number), 0);
}
