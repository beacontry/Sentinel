/**
 * The shutdown drain as a whole (WP03 follow-up).
 *
 *   - shutdownAllEngines hands ONE deadline signal to every engine's
 *     placeSafetyStops, and a hung broker call cannot hold the drain past it;
 *   - an engine start already inside its boot when the signal lands is waited
 *     for and then stopped, so the drain does not return while that boot sits
 *     between placeDisasterStops' cancel and its re-place;
 *   - startEngine refuses once shutdown has begun, both at the top and just
 *     before placeDisasterStops' cancel-all.
 *
 * DRAIN_BUDGET_MS is shrunk to 300 ms so the deadline is observable quickly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/shutdown-config", () => ({
  DRAIN_BUDGET_MS: 300,
  FORCE_EXIT_MS: 5_300,
  CONTAINER_STOP_GRACE_S: 30,
}));

type FakeOrder = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  status: string;
  qty: number;
  stopPrice?: string;
};

const state = vi.hoisted(() => ({
  positions: [] as Array<{ symbol: string; qty: number; avgEntryPrice: number; currentPrice: number }>,
  orders: [] as FakeOrder[],
  calls: [] as string[],
  hangReplace: new Set<string>(),
  onGetAccount: null as null | (() => void),
  seq: 0,
}));

vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  function chain(): unknown {
    let table: unknown = null;
    const proxy: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => {
            if (table === schema.brokerConnections) {
              return resolve([
                { id: "conn", userId: "u", broker: "alpaca", environment: "paper", isActive: true, apiKey: "k", apiSecret: "s" },
              ]);
            }
            return resolve([]);
          };
        }
        return (...args: unknown[]) => {
          if (prop === "from") table = args[0];
          return proxy;
        };
      },
    });
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

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchQuote: async () => null }),
}));

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: () => ({
      getAccount: async () => {
        state.onGetAccount?.();
        return { equity: 100_000, cash: 100_000, buyingPower: 100_000, portfolioValue: 100_000, accountNumber: "PA1" };
      },
      getPositions: async () => state.positions,
      getOrders: async () => state.orders.map((o) => ({ ...o })),
      cancelOrder: async (id: string) => {
        const o = state.orders.find((x) => x.id === id);
        state.calls.push(`cancel:${o?.symbol ?? id}`);
        if (o) o.status = "canceled";
      },
      cancelAllOrders: async () => {
        state.calls.push("cancelAll");
        for (const o of state.orders) o.status = "canceled";
      },
      placeOrder: async (params: { symbol: string; side: "buy" | "sell"; type: string; qty: string; stopPrice?: string }) => {
        state.calls.push(`place:${params.symbol}`);
        const o: FakeOrder = {
          id: `new-${++state.seq}`, symbol: params.symbol, side: params.side, type: params.type,
          status: "accepted", qty: Number(params.qty), stopPrice: params.stopPrice,
        };
        state.orders.push(o);
        return { ...o };
      },
      replaceOrder: (id: string, updates: { stopPrice?: string; qty?: string }) => {
        const o = state.orders.find((x) => x.id === id)!;
        state.calls.push(`replace:${o.symbol}:${updates.stopPrice ?? "-"}`);
        if (state.hangReplace.has(o.symbol)) return new Promise(() => {});
        if (updates.stopPrice) o.stopPrice = updates.stopPrice;
        return Promise.resolve({ ...o });
      },
    }),
  };
});

import { shutdownAllEngines, startEngine, getEngineStatus } from "@/lib/trading-engine";
import { runShutdownOnce, resetShutdownStateForTests, SHUTTING_DOWN_CODE } from "@/lib/shutdown-state";

type EngineLike = { running: boolean; starting: boolean; userId: string | null };
const g = globalThis as typeof globalThis & { __tradingEngines?: Map<string, EngineLike> };

let userSeq = 0;
function engineFor(): { userId: string; engine: EngineLike } {
  userSeq++;
  const userId = `00000000-0000-4000-8000-${String(userSeq).padStart(12, "0")}`;
  getEngineStatus(userId); // creates the engine state
  const engine = g.__tradingEngines!.get(userId)!;
  engine.userId = userId; // startEngine sets this on a real start
  return { userId, engine };
}

function stopOf(id: string, symbol: string, stopPrice: number): FakeOrder {
  return { id, symbol, side: "sell", type: "stop", status: "new", qty: 10, stopPrice: stopPrice.toFixed(2) };
}

const pos = (symbol: string) => ({ symbol, qty: 10, avgEntryPrice: 100, currentPrice: 120 });

beforeEach(() => {
  // Start every test with no engines, so shutdownAllEngines sees only its own.
  g.__tradingEngines?.clear();
  state.positions = [];
  state.orders = [];
  state.calls = [];
  state.hangReplace = new Set();
  state.onGetAccount = null;
  resetShutdownStateForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetShutdownStateForTests();
});

describe("shutdownAllEngines", () => {
  it("passes one shared deadline to every engine's safety stops", async () => {
    const a = engineFor();
    const b = engineFor();
    a.engine.running = true;
    b.engine.running = true;
    state.positions = [pos("AAPL")];

    const anySpy = vi.spyOn(AbortSignal, "any");
    await shutdownAllEngines();

    // placeSafetyStops combines the caller's signal with its own budget. Both
    // engines must have been handed the same caller signal.
    const callerSignals = anySpy.mock.calls.map((c) => (c[0] as AbortSignal[])[0]);
    expect(callerSignals).toHaveLength(2);
    expect(callerSignals[0]).toBeInstanceOf(AbortSignal);
    expect(callerSignals[1]).toBe(callerSignals[0]);
    expect(a.engine.running).toBe(false);
    expect(b.engine.running).toBe(false);
  });

  it("returns at the deadline despite a hung broker call, leaving the old stop in place", async () => {
    const a = engineFor();
    a.engine.running = true;
    state.positions = [pos("AAPL")];
    state.orders = [stopOf("s-aapl", "AAPL", 50)];
    state.hangReplace = new Set(["AAPL"]);
    const g2 = globalThis as typeof globalThis & {
      __enginePositionMaps?: Map<string, Map<string, Record<string, unknown>>>;
    };
    g2.__enginePositionMaps ??= new Map();
    g2.__enginePositionMaps.set(a.userId, new Map([["AAPL", {
      symbol: "AAPL", qty: 10, entryPrice: 100, peakPrice: 120, stopLoss: 105,
      takeProfit: 200, trailingStopPct: 0.1, entryDate: new Date(), holdPeriod: 20,
    }]]));

    const t0 = Date.now();
    await shutdownAllEngines();
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(state.calls).toEqual(["replace:AAPL:105.00"]);
    expect(state.orders.find((o) => o.id === "s-aapl")?.status).toBe("new");
  });

  it("waits for an engine start in flight, then stops it and places its stops", async () => {
    const a = engineFor();
    a.engine.starting = true; // inside startEngine's boot, not yet running
    state.positions = [pos("AAPL")];
    setTimeout(() => {
      a.engine.starting = false;
      a.engine.running = true;
    }, 100);

    await shutdownAllEngines();
    expect(a.engine.running).toBe(false);
    expect(state.calls).toEqual(["place:AAPL"]);
  });
});

describe("startEngine during shutdown", () => {
  it("refuses once shutdown has begun, before touching the broker", async () => {
    const a = engineFor();
    runShutdownOnce(() => new Promise(() => {}));

    const result = await startEngine(a.userId, "optimized");
    expect(result).toMatchObject({ ok: false, code: SHUTTING_DOWN_CODE });
    expect(a.engine.starting).toBe(false);
    expect(a.engine.running).toBe(false);
    expect(state.calls).toEqual([]);
  });

  it("abandons a boot before the cancel-all when shutdown begins mid-boot", async () => {
    const a = engineFor();
    state.positions = [pos("AAPL")];
    state.orders = [stopOf("s-aapl", "AAPL", 110)];
    // The signal lands while startEngine awaits the broker account check.
    state.onGetAccount = () => {
      runShutdownOnce(() => new Promise(() => {}));
    };

    const result = await startEngine(a.userId, "optimized");
    expect(result).toMatchObject({ ok: false, code: SHUTTING_DOWN_CODE });
    expect(a.engine.starting).toBe(false);
    expect(a.engine.running).toBe(false);
    // placeDisasterStops never ran: the existing stop was not cancelled.
    expect(state.calls).toEqual([]);
    expect(state.orders[0].status).toBe("new");
  });
});
