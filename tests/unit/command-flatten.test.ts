/**
 * POST /api/trader/command { command: "flatten" } waits for cancelled stops to
 * release their shares before selling (WP02, finding #42).
 *
 * Alpaca cancels asynchronously: a cancelled stop sits in pending_cancel and
 * its shares stay held_for_orders, so a market sell sent right after the
 * cancel is rejected for insufficient qty. The fake broker below models that
 * by release-after-N-polls, not by time, so a fixed sleep cannot pass these
 * tests and only a real poll of the order list can.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

type FakeOrder = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  status: string;
  pollsLeft?: number;
};

const state = vi.hoisted(() => ({
  userId: "user-1",
  positions: [] as Array<Record<string, unknown>>,
  orders: [] as FakeOrder[],
  releaseAfterPolls: 2,
  cancelAllCalls: 0,
  cancelOrderCalls: [] as string[],
  sells: [] as string[],
}));

const HOLDING = ["new", "accepted", "pending_new", "partially_filled", "held", "pending_cancel"];

vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  requireAuthWithCsrf: async () => ({ userId: state.userId, email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/db", () => {
  function chain(): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve([
                { id: "conn-1", userId: state.userId, broker: "alpaca", environment: "paper", isActive: true, apiKey: "k", apiSecret: "s" },
              ]);
          }
          return () => proxy;
        },
      }
    );
    return proxy;
  }
  return {
    db: new Proxy({}, { get: () => () => chain() }),
    withTimeout: <T,>(p: Promise<T>) => p,
    isStatementTimeout: () => false,
  };
});

function cancel(o: FakeOrder) {
  o.status = "pending_cancel";
  o.pollsLeft = state.releaseAfterPolls;
}

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: () => ({
      broker: "alpaca",
      environment: "paper",
      getPositions: async () => state.positions,
      getOrders: async (_limit?: number, status?: string) => {
        for (const o of state.orders) {
          if (o.status !== "pending_cancel") continue;
          if ((o.pollsLeft ?? 0) <= 0) o.status = "canceled";
          else o.pollsLeft = (o.pollsLeft ?? 0) - 1;
        }
        const visible = status === "open" ? state.orders.filter((o) => HOLDING.includes(o.status)) : state.orders;
        return visible.map((o) => ({ ...o }));
      },
      cancelOrder: async (id: string) => {
        state.cancelOrderCalls.push(id);
        const o = state.orders.find((x) => x.id === id);
        if (o) cancel(o);
      },
      cancelAllOrders: async () => {
        state.cancelAllCalls++;
        for (const o of state.orders) if (HOLDING.includes(o.status) && o.status !== "pending_cancel") cancel(o);
      },
      placeOrder: async (params: Record<string, unknown>) => {
        const symbol = params.symbol as string;
        const held = state.orders.some((o) => o.symbol === symbol && o.side === "sell" && HOLDING.includes(o.status));
        if (held) throw new Error(`Alpaca order 403: {"message":"insufficient qty available for order"}`);
        state.sells.push(symbol);
        return { id: `ord-${state.sells.length}`, status: "accepted" };
      },
    }),
  };
});

import { POST } from "@/app/api/trader/command/route";

let seq = 0;

function flattenRequest(symbol?: string): NextRequest {
  return new NextRequest("http://localhost/api/trader/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(symbol ? { command: "flatten", symbol } : { command: "flatten" }),
  });
}

const AAPL = { symbol: "AAPL", qty: 10, avgEntryPrice: 200, currentPrice: 190, unrealizedPnl: -100 };
const MSFT = { symbol: "MSFT", qty: 5, avgEntryPrice: 400, currentPrice: 410, unrealizedPnl: 50 };

function stop(id: string, symbol: string): FakeOrder {
  return { id, symbol, side: "sell", type: "stop", status: "new" };
}

beforeEach(() => {
  seq++;
  // A fresh user per test keeps the per-user command rate limit out of it.
  state.userId = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  state.positions = [];
  state.orders = [];
  state.releaseAfterPolls = 2;
  state.cancelAllCalls = 0;
  state.cancelOrderCalls = [];
  state.sells = [];
});

describe("flatten waits for cancelled stops to release (finding #42)", () => {
  it("single-symbol flatten polls until its stop leaves pending_cancel, then sells", async () => {
    state.positions = [AAPL, MSFT];
    state.orders = [stop("stop-aapl", "AAPL"), stop("stop-msft", "MSFT")];

    const res = await POST(flattenRequest("AAPL"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toEqual([expect.objectContaining({ symbol: "AAPL", status: "sold" })]);
    expect(state.sells).toEqual(["AAPL"]);
    expect(state.cancelOrderCalls).toEqual(["stop-aapl"]); // the other symbol's stop is untouched
    expect(state.cancelAllCalls).toBe(0);
    expect(state.orders.find((o) => o.id === "stop-msft")?.status).toBe("new");
  });

  it("flatten-all cancels broker-wide and waits for every stop to release before selling", async () => {
    state.positions = [AAPL, MSFT];
    state.orders = [stop("stop-aapl", "AAPL"), stop("stop-msft", "MSFT")];

    const res = await POST(flattenRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toEqual([
      expect.objectContaining({ symbol: "AAPL", status: "sold" }),
      expect.objectContaining({ symbol: "MSFT", status: "sold" }),
    ]);
    expect(state.cancelAllCalls).toBe(1);
    expect(state.orders.every((o) => o.status === "canceled")).toBe(true);
  });
});
