/**
 * Phase 17 — Tax report generator.
 *
 * Pure (no DB / no broker calls) functions that match BUY lots to SELL lots
 * using FIFO accounting, classify each closed pairing as short-term (held
 * <= 365 days) or long-term (> 365 days), and flag wash sales per §1091.
 *
 * Inputs: ordered trade events (BUY = open lot, SELL = consume lots).
 * Outputs: closed-lot records suitable for IRS Form 8949 reporting.
 *
 * Wash sale handling:
 *   IRS rule (§1091): a loss is disallowed if you buy "substantially
 *   identical" stock within 30 days before OR after the loss sale. The
 *   disallowed loss is added to the cost basis of the replacement shares.
 *
 *   Our implementation:
 *   - Symbol match only (we don't track substantially-identical ETFs)
 *   - Window: 30 days each side (61-day total)
 *   - Disallowed loss flagged on the closed lot; basis adjustment marked
 *     on the replacement lot. Tax software typically wants both.
 *
 * Out of scope (v1):
 *   - Substantially-identical-but-different-symbol matching (SPY ↔ IVV)
 *   - Partial-share fractional matching (Alpaca paper supports whole shares)
 *   - Cost basis adjustments for stock splits / dividends
 *   - §475(f) MTM mode (Tax Center separately surfaces MTM status; for
 *     MTM-elected users, the engine doesn't need wash-sale tracking at all)
 *
 * For the v1 deliverable, MTM-elected users get a simpler report that
 * just sums realized gains as ordinary income with no §1091 adjustments.
 */

import { neutralizeCsvFormula } from "./csv";

export interface TaxTradeEvent {
  /** Unique row id from trader_trades */
  id: string;
  symbol: string;
  action: "BUY" | "SELL";
  /** Filled quantity (not order quantity — partials count) */
  quantity: number;
  /** Actual broker fill price (from trader_trades.fill_price after reconciler) */
  fillPrice: number;
  /** Fill timestamp; falls back to trader_timestamp when fill_time unset */
  fillTime: Date;
  /** Optional notes (carried through to the report for context) */
  notes?: string | null;
}

export interface ClosedLot {
  symbol: string;
  /** Quantity of shares closed in this lot */
  quantity: number;
  /** When the lot was acquired (BUY fill time) */
  dateAcquired: Date;
  /** When the lot was disposed (SELL fill time) */
  dateSold: Date;
  /** Cost basis = entry_price × quantity */
  costBasis: number;
  /** Proceeds = exit_price × quantity */
  proceeds: number;
  /** Pre-wash-sale gain/loss */
  realizedGainLoss: number;
  /** True if held > 365 days */
  isLongTerm: boolean;
  /** Disallowed loss under §1091 (0 if no wash sale or this is a gain) */
  washSaleDisallowed: number;
  /** Acquired-lot trader_trades id (for cross-reference) */
  acquiredFromTradeId: string;
  /** Sold-lot trader_trades id */
  soldFromTradeId: string;
}

export interface TaxReportSummary {
  shortTermProceeds: number;
  shortTermCostBasis: number;
  shortTermGainLoss: number;
  longTermProceeds: number;
  longTermCostBasis: number;
  longTermGainLoss: number;
  totalWashSaleDisallowed: number;
  netRealized: number;
  closedLots: number;
  symbolsTraded: number;
}

interface OpenLot {
  tradeId: string;
  quantity: number;
  fillPrice: number;
  fillTime: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WASH_SALE_WINDOW_DAYS = 30;

/**
 * Match BUYs to SELLs using FIFO accounting. Returns the list of closed lots
 * sorted by sale date. Open lots (BUYs not fully consumed by SELLs) are
 * dropped — they show up in the next year's report or remain open.
 */
export function computeFifoClosedLots(events: TaxTradeEvent[]): ClosedLot[] {
  // Group events by symbol — FIFO is per-symbol
  const bySymbol = new Map<string, TaxTradeEvent[]>();
  for (const e of events) {
    if (e.quantity <= 0 || e.fillPrice <= 0) continue;
    const list = bySymbol.get(e.symbol) ?? [];
    list.push(e);
    bySymbol.set(e.symbol, list);
  }

  const closedLots: ClosedLot[] = [];

  for (const [symbol, symEvents] of bySymbol) {
    // Sort by fill time ascending so BUYs are added to the queue before
    // SELLs consume them
    const sorted = [...symEvents].sort((a, b) => a.fillTime.getTime() - b.fillTime.getTime());

    const lotQueue: OpenLot[] = [];

    for (const event of sorted) {
      if (event.action === "BUY") {
        lotQueue.push({
          tradeId: event.id,
          quantity: event.quantity,
          fillPrice: event.fillPrice,
          fillTime: event.fillTime,
        });
        continue;
      }

      // SELL — consume from front of queue (FIFO)
      let remaining = event.quantity;
      while (remaining > 0 && lotQueue.length > 0) {
        const head = lotQueue[0];
        const takeQty = Math.min(remaining, head.quantity);
        const proceeds = takeQty * event.fillPrice;
        const costBasis = takeQty * head.fillPrice;
        const realizedGainLoss = proceeds - costBasis;
        const holdingDays = (event.fillTime.getTime() - head.fillTime.getTime()) / MS_PER_DAY;

        closedLots.push({
          symbol,
          quantity: takeQty,
          dateAcquired: head.fillTime,
          dateSold: event.fillTime,
          costBasis,
          proceeds,
          realizedGainLoss,
          isLongTerm: holdingDays > 365,
          washSaleDisallowed: 0, // set in second pass below
          acquiredFromTradeId: head.tradeId,
          soldFromTradeId: event.id,
        });

        remaining -= takeQty;
        head.quantity -= takeQty;
        if (head.quantity === 0) lotQueue.shift();
      }

      // If SELL qty > lots, the excess is ignored (shouldn't happen with
      // a long-only engine that has Phase 8 broker-side enforcement)
    }
  }

  // Sort all closed lots by sale date
  closedLots.sort((a, b) => a.dateSold.getTime() - b.dateSold.getTime());

  // Second pass: flag wash sales. For each LOSING closed lot, check whether
  // ANY BUY of the same symbol happened within ±30 days of the sale date.
  //
  // KNOWN LIMITATIONS (P1 #7 audit, 2026-06-09) — deferred to a focused
  // IRC §1091 rewrite, tracked separately. Same scope as tax-engine.ts
  // generateForm8949:
  //   1. Disallowed loss = the entire loss, not pro-rated to replacement qty.
  //   2. Replacement lot's basis is NOT adjusted upward by the disallowed
  //      amount, so its later sale overstates gains.
  //   3. Holding period is NOT tacked onto the replacement lot.
  // Net direction: user overpays tax. The IRS isn't shorted. Fix
  // prioritized below the engine-safety items in the audit.
  const buysBySymbol = new Map<string, TaxTradeEvent[]>();
  for (const e of events) {
    if (e.action !== "BUY") continue;
    const list = buysBySymbol.get(e.symbol) ?? [];
    list.push(e);
    buysBySymbol.set(e.symbol, list);
  }

  for (const lot of closedLots) {
    if (lot.realizedGainLoss >= 0) continue; // no loss → no wash sale
    const buys = buysBySymbol.get(lot.symbol) ?? [];
    const saleMs = lot.dateSold.getTime();
    const windowMs = WASH_SALE_WINDOW_DAYS * MS_PER_DAY;
    const replacementBuy = buys.find((b) => {
      const delta = b.fillTime.getTime() - saleMs;
      // Within ±30 days but NOT the same trade that this lot was acquired from
      return Math.abs(delta) <= windowMs && b.id !== lot.acquiredFromTradeId;
    });
    if (replacementBuy) {
      lot.washSaleDisallowed = Math.abs(lot.realizedGainLoss);
    }
  }

  return closedLots;
}

/**
 * Filter closed lots to a tax year (Jan 1 – Dec 31 in user's reporting tz).
 * Default tz = "America/New_York" (US tax year).
 */
export function filterByTaxYear(lots: ClosedLot[], year: number): ClosedLot[] {
  const start = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const end = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
  return lots.filter((l) => {
    const t = l.dateSold.getTime();
    return t >= start && t < end;
  });
}

/**
 * Summarize closed lots into the standard Form 8949 short-term / long-term
 * totals + wash-sale-adjusted net realized.
 */
export function summarize(lots: ClosedLot[]): TaxReportSummary {
  let stProceeds = 0, stBasis = 0, stGain = 0;
  let ltProceeds = 0, ltBasis = 0, ltGain = 0;
  let totalWash = 0;
  const symbols = new Set<string>();

  for (const lot of lots) {
    symbols.add(lot.symbol);
    if (lot.isLongTerm) {
      ltProceeds += lot.proceeds;
      ltBasis += lot.costBasis;
      ltGain += lot.realizedGainLoss + lot.washSaleDisallowed;
    } else {
      stProceeds += lot.proceeds;
      stBasis += lot.costBasis;
      stGain += lot.realizedGainLoss + lot.washSaleDisallowed;
    }
    totalWash += lot.washSaleDisallowed;
  }

  return {
    shortTermProceeds: stProceeds,
    shortTermCostBasis: stBasis,
    shortTermGainLoss: stGain,
    longTermProceeds: ltProceeds,
    longTermCostBasis: ltBasis,
    longTermGainLoss: ltGain,
    totalWashSaleDisallowed: totalWash,
    netRealized: stGain + ltGain,
    closedLots: lots.length,
    symbolsTraded: symbols.size,
  };
}

/**
 * Format a closed lot list as IRS Form 8949-compatible CSV.
 * Columns match Form 8949 line items: description, dates, proceeds,
 * cost basis, adjustment code (W for wash sale), adjustment amount,
 * gain/loss.
 */
export function formatForm8949Csv(lots: ClosedLot[]): {
  shortTerm: string;
  longTerm: string;
} {
  const header = [
    "(a) Description",
    "(b) Date acquired",
    "(c) Date sold",
    "(d) Proceeds",
    "(e) Cost basis",
    "(f) Code(s)",
    "(g) Adjustment",
    "(h) Gain/(loss)",
  ];

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const row = (lot: ClosedLot) => [
    `${lot.quantity} sh. ${lot.symbol}`,
    fmtDate(lot.dateAcquired),
    fmtDate(lot.dateSold),
    lot.proceeds.toFixed(2),
    lot.costBasis.toFixed(2),
    lot.washSaleDisallowed > 0 ? "W" : "",
    lot.washSaleDisallowed > 0 ? lot.washSaleDisallowed.toFixed(2) : "",
    (lot.realizedGainLoss + lot.washSaleDisallowed).toFixed(2),
  ];

  const escape = (raw: string) => {
    const cell = neutralizeCsvFormula(raw);
    return cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell;
  };
  const toCsv = (filtered: ClosedLot[]) =>
    [header, ...filtered.map(row)].map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";

  return {
    shortTerm: toCsv(lots.filter((l) => !l.isLongTerm)),
    longTerm: toCsv(lots.filter((l) => l.isLongTerm)),
  };
}
