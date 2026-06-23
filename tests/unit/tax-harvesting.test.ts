/**
 * Audit #9 — suggestHarvesting must value a harvested loss at the rate that
 * matches its holding period: a long-term loss offsets long-term gains at the
 * LTCG rate (0/15/20%), a short-term loss offsets ordinary income at the higher
 * ordinary rate. The old code applied the ordinary rate to every loss,
 * overstating the savings for long-term losers.
 */

import { describe, it, expect } from "vitest";
import { suggestHarvesting, type TaxPosition } from "@/lib/tax-engine";

function loser(overrides: Partial<TaxPosition>): TaxPosition {
  return {
    symbol: "TST",
    quantity: 100,
    entryPrice: 100,
    currentPrice: 50,
    unrealizedPnl: -5000,
    ...overrides,
  };
}

const TWO_YEARS_AGO = new Date(Date.now() - 730 * 86400000);
const ONE_MONTH_AGO = new Date(Date.now() - 30 * 86400000);

describe("suggestHarvesting holding-period rate selection (audit #9)", () => {
  it("values a LONG-term loss at the LTCG rate, not the ordinary rate", () => {
    // single filer, $50k ordinary income → ordinary marginal 22%, LTCG 15%.
    const [s] = suggestHarvesting([loser({ acquisitionDate: TWO_YEARS_AGO })], "single", 50000);
    expect(s.isLongTerm).toBe(true);
    expect(s.holdingPeriodKnown).toBe(true);
    // $5000 loss × 15% LTCG = $750, NOT $1100 (the old 22% ordinary result).
    expect(s.potentialSavings).toBeCloseTo(750, 2);
  });

  it("values a SHORT-term loss at the ordinary rate", () => {
    const [s] = suggestHarvesting([loser({ acquisitionDate: ONE_MONTH_AGO })], "single", 50000);
    expect(s.isLongTerm).toBe(false);
    expect(s.holdingPeriodKnown).toBe(true);
    // $5000 × 22% ordinary = $1100.
    expect(s.potentialSavings).toBeCloseTo(1100, 2);
  });

  it("treats a position with no acquisition date as short-term and flags it", () => {
    const [s] = suggestHarvesting([loser({})], "single", 50000); // broker lot, no date
    expect(s.holdingPeriodKnown).toBe(false);
    expect(s.isLongTerm).toBe(false);
    expect(s.potentialSavings).toBeCloseTo(1100, 2); // ordinary rate assumed
  });

  it("skips winners and orders suggestions by potential savings desc", () => {
    const out = suggestHarvesting(
      [
        loser({ symbol: "WIN", unrealizedPnl: 1000 }), // gain — skipped
        loser({ symbol: "SML", unrealizedPnl: -1000, acquisitionDate: ONE_MONTH_AGO }),
        loser({ symbol: "BIG", unrealizedPnl: -8000, acquisitionDate: ONE_MONTH_AGO }),
      ],
      "single",
      50000
    );
    expect(out.map((s) => s.symbol)).toEqual(["BIG", "SML"]);
  });
});
