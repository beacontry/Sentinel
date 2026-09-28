import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  quote: null as null | { price: number; volume: number },
  row: { id: "acc-1", entryPrice: 100, signalType: "SELL", symbol: "AAPL" } as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", () => {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: async () => [state.row],
  };
  const db = {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
  };
  return { db };
});

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchQuote: async () => state.quote }),
}));

import { holdHoursForTimeframe, checkSignalOutcome } from "@/lib/accuracy";

describe("checkSignalOutcome quote validity (WP07)", () => {
  beforeEach(() => {
    state.updates = [];
    state.row = { id: "acc-1", entryPrice: 100, signalType: "SELL", symbol: "AAPL" };
  });

  it("does not score a signal against a $0 quote", async () => {
    // Pre-fix: exitPrice 0, actualReturn -100%, a SELL marked correct, and the
    // row never re-checked because exitPrice was no longer null.
    state.quote = { price: 0, volume: 0 };
    await checkSignalOutcome("sig-1");
    expect(state.updates).toHaveLength(0);
  });

  it("does not score a signal against a NaN quote", async () => {
    state.quote = { price: Number.NaN, volume: 0 };
    await checkSignalOutcome("sig-1");
    expect(state.updates).toHaveLength(0);
  });

  it("scores a signal against a positive quote", async () => {
    state.quote = { price: 90, volume: 1 };
    await checkSignalOutcome("sig-1");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].exitPrice).toBe(90);
    expect(state.updates[0].actualReturn).toBeCloseTo(-10, 6);
    expect(state.updates[0].wasCorrect).toBe(true);
  });
});

describe("holdHoursForTimeframe", () => {
  it("returns 2 hours for 5-minute timeframe", () => {
    expect(holdHoursForTimeframe("5m", null)).toBe(2);
  });

  it("returns 72 hours for daily timeframe", () => {
    expect(holdHoursForTimeframe("1d", null)).toBe(72);
  });

  it("returns 24 hours for unknown timeframe", () => {
    expect(holdHoursForTimeframe("unknown", null)).toBe(24);
  });

  it("returns 24 hours for null timeframe", () => {
    expect(holdHoursForTimeframe(null, null)).toBe(24);
  });

  it("uses checkHours override when provided", () => {
    expect(holdHoursForTimeframe("5m", 48)).toBe(48);
    expect(holdHoursForTimeframe("1d", 6)).toBe(6);
    expect(holdHoursForTimeframe(null, 12)).toBe(12);
  });

  it("ignores zero or negative checkHours", () => {
    expect(holdHoursForTimeframe("5m", 0)).toBe(2);
    expect(holdHoursForTimeframe("1d", -1)).toBe(72);
  });
});
