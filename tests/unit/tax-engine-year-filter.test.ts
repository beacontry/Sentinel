/**
 * Tests for the reporting-year filter in tax-engine FIFO matching (audit #8).
 *
 * The /api/tax/report route used to filter trades to the tax year BEFORE FIFO
 * matching, so a sale whose buy lot was in a prior year had no lot to match
 * against — its realized gain was silently dropped. The fix runs FIFO over the
 * FULL history and reports only disposals whose SELL falls in the tax-year
 * window (taxYearStart/taxYearEnd), while still consuming lots for out-of-range
 * sells so in-range sells match the correct remaining lots.
 */

import { describe, it, expect } from "vitest";
import { calculateTaxSummary, generateForm8949, type TaxTrade } from "@/lib/tax-engine";

const range2026 = {
  taxYearStart: new Date("2026-01-01T00:00:00.000-05:00"),
  taxYearEnd: new Date("2026-12-31T23:59:59.999-05:00"),
};

describe("tax-engine reporting-year filter (FIFO over full history)", () => {
  it("reports a 2026 sale whose buy lot is in 2025 (basis carried across years)", () => {
    const trades: TaxTrade[] = [
      { symbol: "AAPL", action: "BUY", quantity: 10, price: 100, executedAt: "2025-06-01T15:00:00.000Z" },
      { symbol: "AAPL", action: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T15:00:00.000Z" },
    ];
    const result = generateForm8949(trades, range2026);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].costBasis).toBe(1000); // 2025 buy basis preserved
    expect(result.lines[0].proceeds).toBe(1500);
    expect(result.lines[0].gainLoss).toBe(500);
    expect(result.lines[0].isLongTerm).toBe(false); // ~9 months
    expect(result.summary.shortTermGains).toBe(500);
  });

  it("excludes the prior-year sale but still consumes its lot for FIFO", () => {
    const trades: TaxTrade[] = [
      // 2025 buy fully sold in 2025 — out of the 2026 report
      { symbol: "MSFT", action: "BUY", quantity: 10, price: 100, executedAt: "2025-01-01T15:00:00.000Z" },
      { symbol: "MSFT", action: "SELL", quantity: 10, price: 120, executedAt: "2025-06-01T15:00:00.000Z" },
      // 2026 buy + sell — must match the 2026 lot (basis 100), not the spent 2025 lot
      { symbol: "MSFT", action: "BUY", quantity: 5, price: 100, executedAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "MSFT", action: "SELL", quantity: 5, price: 130, executedAt: "2026-06-01T15:00:00.000Z" },
    ];
    const result = generateForm8949(trades, range2026);
    expect(result.lines).toHaveLength(1); // only the 2026 disposal
    expect(result.lines[0].dateSold.startsWith("2026")).toBe(true);
    expect(result.lines[0].costBasis).toBe(500); // the 2026 lot, not the spent 2025 one
    expect(result.lines[0].gainLoss).toBe(150); // (130-100)*5
  });

  it("regression: pre-FIFO year filtering (the old bug) drops the orphaned sale", () => {
    // The OLD route passed only the tax year's trades to FIFO. A 2026 sale with
    // its buy lot in 2025 then had nothing to match → the gain vanished.
    const only2026: TaxTrade[] = [
      { symbol: "AAPL", action: "SELL", quantity: 10, price: 150, executedAt: "2026-03-01T15:00:00.000Z" },
    ];
    const broken = generateForm8949(only2026); // no buy lot present
    expect(broken.lines).toHaveLength(0); // gain silently lost — the bug we fixed
  });

  it("calculateTaxSummary forwards the range to generateForm8949", () => {
    const trades: TaxTrade[] = [
      { symbol: "NVDA", action: "BUY", quantity: 2, price: 200, executedAt: "2025-02-01T15:00:00.000Z" },
      { symbol: "NVDA", action: "SELL", quantity: 2, price: 300, executedAt: "2026-02-01T15:00:00.000Z" },
    ];
    const summary = calculateTaxSummary(trades, range2026);
    expect(summary.netGain).toBe(200); // (300-200)*2
    expect(summary.tradeCount).toBe(1);
  });

  it("no range = report everything (back-compat for existing callers)", () => {
    const trades: TaxTrade[] = [
      { symbol: "T", action: "BUY", quantity: 1, price: 10, executedAt: "2025-01-01T15:00:00.000Z" },
      { symbol: "T", action: "SELL", quantity: 1, price: 12, executedAt: "2025-02-01T15:00:00.000Z" },
      { symbol: "T", action: "BUY", quantity: 1, price: 10, executedAt: "2026-01-01T15:00:00.000Z" },
      { symbol: "T", action: "SELL", quantity: 1, price: 15, executedAt: "2026-02-01T15:00:00.000Z" },
    ];
    expect(generateForm8949(trades).lines).toHaveLength(2);
  });
});
