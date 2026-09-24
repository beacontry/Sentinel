/**
 * WP07 (finding #11): a paper trade never executes at $0.
 *
 * The route checked only `!quote`, so a non-null $0 quote went through to
 * executeTrade: a BUY cost shares * 0, passed the cash check, deducted nothing
 * and still credited the shares at entryPrice 0. The route now answers 422 for
 * a quote without a positive price, and executeTrade itself refuses a
 * non-positive price before touching the balance.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  quote: null as null | { price: number; volume: number },
  executed: [] as unknown[][],
  dbWrites: 0,
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchQuote: async () => state.quote }),
}));

vi.mock("@/lib/db", () => {
  const portfolio = { id: "pf-1", userId: "user-1" };
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => [portfolio],
  };
  const touch = () => {
    state.dbWrites++;
    throw new Error("db must not be written");
  };
  const db = {
    select: () => selectChain,
    transaction: touch,
    update: touch,
    insert: touch,
    delete: touch,
  };
  return { db };
});

vi.mock("@/lib/portfolio-sim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/portfolio-sim")>();
  return {
    ...actual,
    executeTrade: vi.fn(async (...args: unknown[]) => {
      state.executed.push(args);
    }),
  };
});

import { POST } from "@/app/api/portfolio/[id]/trade/route";

function tradeRequest(body: unknown): Request {
  return new Request("http://localhost/api/portfolio/pf-1/trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "pf-1" }) };

describe("paper trade route quote validity (WP07)", () => {
  beforeEach(() => {
    state.executed = [];
    state.dbWrites = 0;
  });

  it("refuses a BUY against a $0 quote and executes nothing", async () => {
    state.quote = { price: 0, volume: 0 };
    const res = await POST(tradeRequest({ symbol: "AAPL", side: "BUY", shares: 100 }), params);
    expect(res.status).toBe(422);
    expect(state.executed).toHaveLength(0);
  });

  it("refuses a SELL against a NaN quote and executes nothing", async () => {
    state.quote = { price: Number.NaN, volume: 0 };
    const res = await POST(tradeRequest({ symbol: "AAPL", side: "SELL", shares: 1 }), params);
    expect(res.status).toBe(422);
    expect(state.executed).toHaveLength(0);
  });

  it("executes at a positive quote", async () => {
    state.quote = { price: 50, volume: 10 };
    const res = await POST(tradeRequest({ symbol: "AAPL", side: "BUY", shares: 2 }), params);
    expect(res.status).toBe(200);
    expect(state.executed).toEqual([["pf-1", "AAPL", "BUY", 2, 50]]);
  });
});

describe("executeTrade price guard (WP07)", () => {
  beforeEach(() => {
    state.dbWrites = 0;
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws on price %s before any cash or share mutation",
    async (price) => {
      const { executeTrade } = await vi.importActual<typeof import("@/lib/portfolio-sim")>(
        "@/lib/portfolio-sim"
      );
      await expect(executeTrade("pf-1", "AAPL", "BUY", 100, price)).rejects.toThrow("Invalid price");
      expect(state.dbWrites).toBe(0);
    }
  );
});
