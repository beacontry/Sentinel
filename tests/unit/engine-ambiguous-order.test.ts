/**
 * Engine BUYs whose broker response is lost (WP04, finding #51).
 *
 *   - placeEngineOrder fixes the client_order_id before the POST. When the
 *     POST times out (or the connection drops, or a 5xx comes back) it looks
 *     the order up by that id: a found order is returned as placed, so the
 *     caller runs recordOrderPlacement, the cooldown and the PENDING row with
 *     the broker order id instead of logging FAILED with no id.
 *   - recordFailedEngineBuy (runScan and the tactical entry loop) logs the
 *     failure, calls pushError and writes a FAILED row. An unresolved
 *     ambiguous BUY is counted against the rate and notional caps as if
 *     placed; a definite refusal is not.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  void schema;
  function chain(): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
          return (...args: unknown[]) => {
            if (prop === "values") state.inserts.push(args[0] as Record<string, unknown>);
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  const db = new Proxy({}, { get: () => () => chain() });
  return { db, withTimeout: <T,>(p: Promise<T>) => p, isStatementTimeout: () => false };
});

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

vi.mock("@/lib/market-hours", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market-hours")>();
  return { ...actual, isMarketOpen: () => true };
});

import {
  placeEngineOrder,
  recordFailedEngineBuy,
  getEngineStatus,
  type EngineState,
} from "@/lib/trading-engine";
import { BrokerError, ORDER_LOOKUP_TIMEOUT_MS, type BrokerClient, type BrokerOrder } from "@/lib/brokers";

const g = globalThis as typeof globalThis & { __tradingEngines?: Map<string, EngineState> };

let userSeq = 0;
function runningEngine(): EngineState {
  userSeq++;
  const userId = `00000000-0000-4000-8000-${String(900000 + userSeq).padStart(12, "0")}`;
  getEngineStatus(userId); // creates the engine state
  const engine = g.__tradingEngines!.get(userId)!;
  engine.userId = userId;
  engine.running = true;
  engine.halted = false;
  return engine;
}

function brokerOrder(id: string): BrokerOrder {
  return {
    id, symbol: "NVDA", side: "buy", qty: 10, filledQty: 0, type: "limit", status: "accepted",
    filledPrice: null, timeInForce: "day", limitPrice: "100.10", stopPrice: null,
    submittedAt: "2026-09-23T14:30:00Z", filledAt: null, canceledAt: null,
  };
}

function timeoutError(): BrokerError {
  return new BrokerError("Connection timed out", 504, "Connection timed out", true, null, "unknown");
}

type Calls = { placed: Array<Record<string, unknown>>; lookups: string[] };

function fakeClient(opts: {
  place: (p: Record<string, unknown>) => Promise<BrokerOrder>;
  lookup?: (id: string) => Promise<BrokerOrder | null>;
}): { client: BrokerClient; calls: Calls } {
  const calls: Calls = { placed: [], lookups: [] };
  const client = {
    placeOrder: async (p: Record<string, unknown>) => {
      calls.placed.push({ ...p });
      return opts.place(p);
    },
    ...(opts.lookup
      ? {
          getOrderByClientId: async (id: string) => {
            calls.lookups.push(id);
            return opts.lookup!(id);
          },
        }
      : {}),
  } as unknown as BrokerClient;
  return { client, calls };
}

const BUY = { symbol: "NVDA", side: "buy" as const, qty: "10", type: "limit" as const, timeInForce: "day" as const, limitPrice: "100.10" };

beforeEach(() => {
  state.inserts = [];
});

describe("placeEngineOrder: ambiguous outcome", () => {
  it("sends a client_order_id and, on a 504, returns the order the lookup finds under it", async () => {
    const engine = runningEngine();
    const { client, calls } = fakeClient({
      place: async () => { throw timeoutError(); },
      lookup: async () => brokerOrder("ord-live"),
    });

    const order = await placeEngineOrder(client, BUY, engine);

    expect(order.id).toBe("ord-live");
    const sent = calls.placed[0]?.clientOrderId;
    expect(typeof sent).toBe("string");
    expect(calls.lookups).toEqual([sent]);
    expect(calls.placed[0]?.positionIntent).toBe("buy_to_open");
  });

  it("rethrows the original error, carrying the client_order_id, when the lookup finds nothing", async () => {
    const engine = runningEngine();
    const original = timeoutError();
    const { client, calls } = fakeClient({
      place: async () => { throw original; },
      lookup: async () => null,
    });

    const err = await placeEngineOrder(client, BUY, engine).catch((e: unknown) => e);

    expect(err).toBe(original);
    expect((err as BrokerError).clientOrderId).toBe(calls.placed[0]?.clientOrderId);
  });

  it("does not look up a definite refusal", async () => {
    const engine = runningEngine();
    const refusal = new BrokerError("Alpaca order 403: insufficient buying power", 400, "Insufficient buying power for this order");
    const { client, calls } = fakeClient({
      place: async () => { throw refusal; },
      lookup: async () => brokerOrder("should-not-be-used"),
    });

    await expect(placeEngineOrder(client, BUY, engine)).rejects.toBe(refusal);
    expect(calls.lookups).toHaveLength(0);
  });

  it("bounds a hung lookup at ORDER_LOOKUP_TIMEOUT_MS instead of a second full fetch timeout", async () => {
    vi.useFakeTimers();
    try {
      const engine = runningEngine();
      const original = timeoutError();
      const { client, calls } = fakeClient({
        place: async () => { throw original; },
        lookup: () => new Promise<BrokerOrder | null>(() => {}), // never answers
      });

      let settled: unknown = "pending";
      const p = placeEngineOrder(client, BUY, engine).then(
        () => { settled = "resolved"; },
        (e: unknown) => { settled = e; }
      );
      await vi.advanceTimersByTimeAsync(ORDER_LOOKUP_TIMEOUT_MS - 1);
      expect(settled).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      await p;

      expect(ORDER_LOOKUP_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
      expect(calls.lookups).toHaveLength(1);
      expect(settled).toBe(original);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the lookup when the caller's deadline has already passed", async () => {
    const original = timeoutError();
    const { client, calls } = fakeClient({
      place: async () => { throw original; },
      lookup: async () => brokerOrder("should-not-be-used"),
    });
    const ac = new AbortController();
    ac.abort(new Error("drain deadline"));

    const sell = { symbol: "NVDA", side: "sell" as const, qty: "10", type: "stop" as const, timeInForce: "gtc" as const, stopPrice: "90.00" };
    await expect(placeEngineOrder(client, sell, undefined, { lookupSignal: ac.signal })).rejects.toBe(original);
    expect(calls.lookups).toHaveLength(0);
  });

  it("stops waiting for the lookup when the caller's deadline fires", async () => {
    const original = timeoutError();
    const { client, calls } = fakeClient({
      place: async () => { throw original; },
      lookup: () => new Promise<BrokerOrder | null>(() => {}),
    });
    const ac = new AbortController();
    const sell = { symbol: "NVDA", side: "sell" as const, qty: "10", type: "stop" as const, timeInForce: "gtc" as const, stopPrice: "90.00" };

    const p = placeEngineOrder(client, sell, undefined, { lookupSignal: ac.signal });
    await new Promise((r) => setTimeout(r, 10));
    ac.abort(new Error("drain deadline"));

    await expect(p).rejects.toBe(original);
    expect(calls.lookups).toHaveLength(1);
  });

  it("still refuses a BUY on a halted engine before anything is sent", async () => {
    const engine = runningEngine();
    engine.halted = true;
    const { client, calls } = fakeClient({ place: async () => brokerOrder("x"), lookup: async () => null });

    await expect(placeEngineOrder(client, BUY, engine)).rejects.toThrow(/halted or stopped/);
    expect(calls.placed).toHaveLength(0);
  });
});

describe("recordFailedEngineBuy", () => {
  it("an unresolved ambiguous BUY is logged, pushed, written FAILED with its client id, and counted against the caps", async () => {
    const engine = runningEngine();
    const err = timeoutError();
    err.clientOrderId = "cid-123";
    const before = { orders: engine.recentOrderTimestamps.length, notional: engine.dailyNotional };

    const res = await recordFailedEngineBuy(engine, {
      symbol: "NVDA", signal: "tactical_entry", qty: 10, buyNotional: 1001, err, source: "engine_tactical",
    });

    expect(res.unconfirmed).toBe(true);
    expect(engine.recentOrderTimestamps.length).toBe(before.orders + 1);
    expect(engine.dailyNotional).toBeCloseTo(before.notional + 1001);
    expect(engine.errors.at(-1)).toMatch(/status unknown for NVDA.*cid-123/);
    const row = state.inserts.find((r) => r.symbol === "NVDA");
    expect(row).toMatchObject({ action: "BUY", status: "FAILED", quantity: 10, brokerOrderId: null });
    expect(String(row?.notes)).toContain("cid-123");
  });

  it("a definite refusal is logged, pushed and written FAILED, and not counted", async () => {
    const engine = runningEngine();
    const before = { orders: engine.recentOrderTimestamps.length, notional: engine.dailyNotional };

    const res = await recordFailedEngineBuy(engine, {
      symbol: "AMD", signal: "tactical_entry", qty: 5, buyNotional: 500,
      err: new BrokerError("Alpaca order 403: insufficient buying power", 400, "Insufficient buying power for this order"),
      source: "engine_tactical",
    });

    expect(res.unconfirmed).toBe(false);
    expect(engine.recentOrderTimestamps.length).toBe(before.orders);
    expect(engine.dailyNotional).toBe(before.notional);
    expect(engine.errors.at(-1)).toMatch(/Buy order failed for AMD/);
    expect(state.inserts.find((r) => r.symbol === "AMD")).toMatchObject({ status: "FAILED" });
  });
});
