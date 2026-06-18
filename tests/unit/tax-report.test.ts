/**
 * Phase 17 — pin the FIFO matching + wash-sale flagging logic. These rules
 * are tricky enough that ad-hoc tests aren't enough — multiple scenarios
 * covering partial fills, multi-buy / multi-sell, long-term vs short-term
 * boundary, and wash sale window edges.
 */

import { describe, it, expect } from "vitest";
import {
  computeFifoClosedLots,
  filterByTaxYear,
  summarize,
  formatForm8949Csv,
  type TaxTradeEvent,
} from "@/lib/tax-report";

const D = (s: string) => new Date(s);
const evt = (overrides: Partial<TaxTradeEvent> & { id: string }): TaxTradeEvent => ({
  symbol: "AAPL",
  action: "BUY",
  quantity: 100,
  fillPrice: 100,
  fillTime: D("2025-01-01T15:00:00Z"),
  ...overrides,
});

describe("FIFO matching", () => {
  it("simple round-trip: buy 100 @ $100, sell 100 @ $110 → $1000 gain", () => {
    const events = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 110, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(100);
    expect(lots[0].costBasis).toBe(10_000);
    expect(lots[0].proceeds).toBe(11_000);
    expect(lots[0].realizedGainLoss).toBe(1_000);
    expect(lots[0].isLongTerm).toBe(false);
  });

  it("partial sell consumes oldest lot first (FIFO)", () => {
    const events = [
      evt({ id: "b1", action: "BUY", quantity: 50, fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "b2", action: "BUY", quantity: 50, fillPrice: 110, fillTime: D("2025-02-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", quantity: 75, fillPrice: 120, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots).toHaveLength(2);
    // First lot: 50 shares from b1 @ $100 → cost 5000, proceeds 6000, gain 1000
    expect(lots[0].acquiredFromTradeId).toBe("b1");
    expect(lots[0].quantity).toBe(50);
    expect(lots[0].realizedGainLoss).toBe(1_000);
    // Second lot: 25 shares from b2 @ $110 → cost 2750, proceeds 3000, gain 250
    expect(lots[1].acquiredFromTradeId).toBe("b2");
    expect(lots[1].quantity).toBe(25);
    expect(lots[1].realizedGainLoss).toBe(250);
  });

  it("classifies as long-term when held > 365 days", () => {
    const events = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2024-01-01T15:00:00Z") }),
      // 366 days later
      evt({ id: "s1", action: "SELL", fillPrice: 150, fillTime: D("2025-01-02T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].isLongTerm).toBe(true);
  });

  it("classifies as short-term when held exactly 365 days (boundary)", () => {
    const events = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2024-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 150, fillTime: D("2024-12-31T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].isLongTerm).toBe(false);
  });

  it("leap-year boundary: sale on the 1-year anniversary spanning a leap year is short-term (audit #36)", () => {
    // 2024 is a leap year → 366 calendar days from 2024-01-01 to 2025-01-01.
    // The 1-year anniversary is 2025-01-01; a sale ON it is NOT more than one
    // year (IRS Pub 550), so short-term. The old `holdingDays > 365` count
    // misclassified this 366-day hold as long-term.
    const events = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2024-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 150, fillTime: D("2025-01-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].isLongTerm).toBe(false);
  });

  it("losses produce negative realized gain", () => {
    const events = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-02-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].realizedGainLoss).toBe(-1_000);
  });

  it("symbols are matched separately (AAPL trades don't consume NVDA lots)", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", symbol: "AAPL", action: "BUY", quantity: 10, fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "b2", symbol: "NVDA", action: "BUY", quantity: 10, fillPrice: 500, fillTime: D("2025-01-02T15:00:00Z") }),
      evt({ id: "s1", symbol: "AAPL", action: "SELL", quantity: 10, fillPrice: 110, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots).toHaveLength(1);
    expect(lots[0].symbol).toBe("AAPL");
  });

  it("orders by sale date in output", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", symbol: "AAPL", action: "BUY", fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "b2", symbol: "NVDA", action: "BUY", fillPrice: 500, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", symbol: "AAPL", action: "SELL", fillPrice: 110, fillTime: D("2025-04-01T15:00:00Z") }),
      evt({ id: "s2", symbol: "NVDA", action: "SELL", fillPrice: 550, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots.map((l) => l.soldFromTradeId)).toEqual(["s2", "s1"]);
  });
});

describe("Wash sale flagging (§1091)", () => {
  it("flags loss if a BUY happens within 30 days AFTER the loss sale", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      // Loss sale at $90
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-03-01T15:00:00Z") }),
      // Replacement buy 10 days later — wash sale triggered
      evt({ id: "b2", action: "BUY", fillPrice: 95, fillTime: D("2025-03-11T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots).toHaveLength(1);
    expect(lots[0].washSaleDisallowed).toBe(1_000); // entire $1000 loss disallowed
  });

  it("flags loss if a BUY happens within 30 days BEFORE the loss sale", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      // Loss sale (after a recent additional buy)
      evt({ id: "b2", action: "BUY", quantity: 50, fillPrice: 95, fillTime: D("2025-02-15T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    // First lot (from b1 @ 100): sold 100 @ 90 → loss 1000. b2 is 14 days before — wash trigger.
    expect(lots[0].washSaleDisallowed).toBe(1_000);
  });

  it("does NOT flag gain sales (only losses are wash-sensitive)", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      // GAIN sale
      evt({ id: "s1", action: "SELL", fillPrice: 120, fillTime: D("2025-03-01T15:00:00Z") }),
      // Replacement buy 10 days later — irrelevant for gains
      evt({ id: "b2", action: "BUY", fillPrice: 125, fillTime: D("2025-03-11T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].washSaleDisallowed).toBe(0);
  });

  it("does NOT flag if replacement buy is > 30 days away", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-03-01T15:00:00Z") }),
      // 31 days after the loss → outside window
      evt({ id: "b2", action: "BUY", fillPrice: 95, fillTime: D("2025-04-02T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].washSaleDisallowed).toBe(0);
  });

  it("does NOT count the SAME BUY that supplied the closed lot as replacement", () => {
    // Edge case: if you ONLY have one BUY and one SELL, the BUY is the
    // acquired lot, not a "replacement" buy. Otherwise every losing trade
    // would be a wash sale, which is wrong.
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-03-01T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].washSaleDisallowed).toBe(0);
  });

  it("different-symbol BUY does not trigger wash (substantially-identical not tracked)", () => {
    const events: TaxTradeEvent[] = [
      evt({ id: "b1", symbol: "SPY", action: "BUY", fillPrice: 400, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", symbol: "SPY", action: "SELL", fillPrice: 390, fillTime: D("2025-03-01T15:00:00Z") }),
      evt({ id: "b2", symbol: "IVV", action: "BUY", fillPrice: 390, fillTime: D("2025-03-10T15:00:00Z") }),
    ];
    const lots = computeFifoClosedLots(events);
    expect(lots[0].washSaleDisallowed).toBe(0);
  });
});

describe("Year filtering + summary", () => {
  const lots = computeFifoClosedLots([
    evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2024-06-01T15:00:00Z") }),
    evt({ id: "s1", action: "SELL", fillPrice: 110, fillTime: D("2024-12-15T15:00:00Z") }),
    evt({ id: "b2", action: "BUY", fillPrice: 200, fillTime: D("2025-01-15T15:00:00Z") }),
    evt({ id: "s2", action: "SELL", fillPrice: 250, fillTime: D("2025-06-01T15:00:00Z") }),
  ]);

  it("filterByTaxYear isolates correct year", () => {
    const yr2024 = filterByTaxYear(lots, 2024);
    const yr2025 = filterByTaxYear(lots, 2025);
    expect(yr2024).toHaveLength(1);
    expect(yr2024[0].soldFromTradeId).toBe("s1");
    expect(yr2025).toHaveLength(1);
    expect(yr2025[0].soldFromTradeId).toBe("s2");
  });

  it("summarize aggregates short-term and long-term separately", () => {
    const summary = summarize(lots);
    // Both lots are short-term (<= 365 days)
    expect(summary.shortTermGainLoss).toBe(1_000 + 5_000); // ($110-$100)*100 + ($250-$200)*100
    expect(summary.longTermGainLoss).toBe(0);
    expect(summary.closedLots).toBe(2);
    expect(summary.symbolsTraded).toBe(1);
    expect(summary.netRealized).toBe(6_000);
  });
});

describe("Form 8949 CSV format", () => {
  it("produces Form 8949 columns in the right order", () => {
    const lots = computeFifoClosedLots([
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 110, fillTime: D("2025-03-01T15:00:00Z") }),
    ]);
    const { shortTerm } = formatForm8949Csv(lots);
    expect(shortTerm).toContain("(a) Description,(b) Date acquired,(c) Date sold");
    expect(shortTerm).toContain("100 sh. AAPL");
    expect(shortTerm).toContain("2025-01-01");
    expect(shortTerm).toContain("2025-03-01");
    expect(shortTerm).toContain("11000.00"); // proceeds
    expect(shortTerm).toContain("10000.00"); // cost basis
    expect(shortTerm).toContain("1000.00"); // gain
  });

  it("adds 'W' code + adjustment column when wash sale flagged", () => {
    const lots = computeFifoClosedLots([
      evt({ id: "b1", action: "BUY", fillPrice: 100, fillTime: D("2025-01-01T15:00:00Z") }),
      evt({ id: "s1", action: "SELL", fillPrice: 90, fillTime: D("2025-03-01T15:00:00Z") }),
      evt({ id: "b2", action: "BUY", fillPrice: 95, fillTime: D("2025-03-11T15:00:00Z") }),
    ]);
    const { shortTerm } = formatForm8949Csv(lots);
    expect(shortTerm).toContain(",W,");
    expect(shortTerm).toContain(",1000.00,"); // disallowed amount
    expect(shortTerm).toContain(",0.00\r\n"); // wash-adjusted gain
  });
});
