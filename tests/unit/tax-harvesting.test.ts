/**
 * Audit #9 — suggestHarvesting must value a harvested loss at the rate that
 * matches its holding period: a long-term loss offsets long-term gains at the
 * LTCG rate (0/15/20%), a short-term loss offsets ordinary income at the higher
 * ordinary rate. The old code applied the ordinary rate to every loss,
 * overstating the savings for long-term losers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { suggestHarvesting, type TaxPosition } from "@/lib/tax-engine";

// Route-level mocks for the WP07 tests at the bottom of this file. The
// suggestHarvesting tests above do not touch any of these modules.
const routeState = vi.hoisted(() => ({
  positions: [] as Array<Record<string, unknown>>,
  quotes: {} as Record<string, "throw" | null | { price: number; volume: number }>,
}));

vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));
vi.mock("@/lib/trading-engine", () => ({ getBrokerPositionCache: () => null }));
vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({
    fetchQuote: async (symbol: string) => {
      const q = routeState.quotes[symbol];
      if (q === "throw") throw new Error("timeout");
      return q ?? null;
    },
  }),
}));
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () =>
          table === schema.portfolios ? [{ id: "pf-1" }] : routeState.positions,
      }),
    }),
  };
  return { db };
});

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

describe("harvesting route quote validity (WP07, finding #13)", () => {
  const lot = (symbol: string) => ({
    symbol,
    quantity: 100,
    entryPrice: 100,
    entryDate: ONE_MONTH_AGO,
  });

  beforeEach(() => {
    routeState.positions = [];
    routeState.quotes = {};
  });

  async function callRoute() {
    const { GET } = await import("@/app/api/tax/harvesting/route");
    const res = await GET();
    expect(res.status).toBe(200);
    return (await res.json()) as {
      suggestions: Array<{ symbol: string }>;
      unpricedSymbols: string[];
    };
  }

  it("marks a null-quote position unpriced instead of valuing it at cost", async () => {
    routeState.positions = [lot("DOWN"), lot("NOQ")];
    routeState.quotes = { DOWN: { price: 70, volume: 1 }, NOQ: null };
    const body = await callRoute();
    expect(body.unpricedSymbols).toEqual(["NOQ"]);
    expect(body.suggestions.map((s) => s.symbol)).toEqual(["DOWN"]);
  });

  it("marks a throwing quote unpriced", async () => {
    routeState.positions = [lot("ERR")];
    routeState.quotes = { ERR: "throw" };
    const body = await callRoute();
    expect(body.unpricedSymbols).toEqual(["ERR"]);
    expect(body.suggestions).toEqual([]);
  });

  it("does not suggest harvesting a fabricated 100% loss from a $0 quote", async () => {
    routeState.positions = [lot("ZERO")];
    routeState.quotes = { ZERO: { price: 0, volume: 0 } };
    const body = await callRoute();
    expect(body.unpricedSymbols).toEqual(["ZERO"]);
    expect(body.suggestions).toEqual([]);
  });

  it("returns an empty unpricedSymbols list when every position is priced", async () => {
    routeState.positions = [lot("DOWN")];
    routeState.quotes = { DOWN: { price: 70, volume: 1 } };
    const body = await callRoute();
    expect(body.unpricedSymbols).toEqual([]);
    expect(body.suggestions.map((s) => s.symbol)).toEqual(["DOWN"]);
  });
});
