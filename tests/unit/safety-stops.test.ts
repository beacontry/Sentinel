/**
 * placeSafetyStops never lowers protection (WP03, findings #1, #45).
 *
 * The engine-stop and SIGTERM drain used to cancel EVERY open order, wait,
 * then place a fixed-% stop per position in sequence. A drain killed after
 * the cancel left positions with no broker stop at all, and even a complete
 * drain replaced a ratcheted (breakeven or trailing) stop with a looser one.
 *
 * These drive the real engine module with a mocked db and a fake broker:
 *   - cancelAllOrders is never called;
 *   - an existing stop at or above target is kept, a lower one is raised in
 *     place to max(broker stop, in-memory stop, fixed stop) under market;
 *   - a position with no stop gets one;
 *   - an abort mid-drain leaves every position with a stop;
 *   - a broker without replaceOrder is handled one symbol at a time, cancel
 *     then place, and a sent cancel is always followed by its replacement.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Fake broker state ──────────────────────────────────────────────────────

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
  withReplace: true,
  calls: [] as string[],
  cancelAllCalls: 0,
  /** Symbols whose replaceOrder never settles (a hung broker call). */
  hangReplace: new Set<string>(),
  /** Called when a cancelOrder lands, so a test can abort at that moment. */
  onCancel: null as null | ((id: string) => void),
  /** Delay before a placed order shows up at the broker (a slow POST). */
  placeDelayMs: 0,
  /** A replaceOrder that changes qty is rejected (shares held by another sell). */
  rejectQtyReplace: false,
  /** placeOrder reaches the broker but its response is lost (a 504). */
  ambiguousPlace: false,
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
    createBrokerClient: () => {
      const client: Record<string, unknown> = {
        getPositions: async () => state.positions,
        // Returns the whole book, dead orders included, as Tradier does
        // regardless of the status argument. A pending_cancel order settles
        // to canceled once it has been listed.
        getOrders: async () => {
          const listed = state.orders.map((o) => ({ ...o }));
          for (const o of state.orders) if (o.status === "pending_cancel") o.status = "canceled";
          return listed;
        },
        cancelOrder: async (id: string) => {
          const o = state.orders.find((x) => x.id === id);
          state.calls.push(`cancel:${o?.symbol ?? id}`);
          if (o) o.status = "canceled";
          state.onCancel?.(id);
        },
        cancelAllOrders: async () => {
          state.cancelAllCalls++;
          for (const o of state.orders) o.status = "canceled";
        },
        placeOrder: async (params: { symbol: string; side: "buy" | "sell"; type: string; qty: string; stopPrice?: string }) => {
          state.calls.push(`place:${params.symbol}`);
          if (state.placeDelayMs > 0) await new Promise((r) => setTimeout(r, state.placeDelayMs));
          const o: FakeOrder = {
            id: `new-${++state.seq}`,
            symbol: params.symbol,
            side: params.side,
            type: params.type,
            status: "accepted",
            qty: Number(params.qty),
            stopPrice: params.stopPrice,
          };
          state.orders.push(o);
          if (state.ambiguousPlace) {
            throw new actual.BrokerError("Connection timed out", 504, "Connection timed out", true, null, "unknown");
          }
          return { ...o };
        },
        // Answers only after a hung broker would: a lookup that is started
        // is visible in the call log and holds the drain until it gives up.
        getOrderByClientId: (id: string) => {
          state.calls.push(`lookup:${id.length > 0 ? "id" : "none"}`);
          return new Promise(() => {});
        },
      };
      if (state.withReplace) {
        client.replaceOrder = (id: string, updates: { stopPrice?: string; qty?: string }) => {
          const o = state.orders.find((x) => x.id === id)!;
          state.calls.push(`replace:${o.symbol}:${updates.stopPrice ?? "-"}:${updates.qty ?? "-"}`);
          if (state.hangReplace.has(o.symbol)) return new Promise(() => {});
          if (updates.qty && state.rejectQtyReplace) {
            return Promise.reject(new Error("order 403: insufficient qty available (held_for_orders)"));
          }
          if (updates.stopPrice) o.stopPrice = updates.stopPrice;
          if (updates.qty) o.qty = Number(updates.qty);
          return Promise.resolve({ ...o });
        };
      }
      return client;
    },
  };
});

import { placeSafetyStops } from "@/lib/trading-engine";

// ─── Fixtures ───────────────────────────────────────────────────────────────

let userSeq = 0;
function freshUser(): string {
  userSeq++;
  return `00000000-0000-4000-9000-${String(userSeq).padStart(12, "0")}`;
}

function stop(id: string, symbol: string, stopPrice: number, qty = 10): FakeOrder {
  return { id, symbol, side: "sell", type: "stop", status: "new", qty, stopPrice: stopPrice.toFixed(2) };
}

/** Seed the engine's in-memory stop for a symbol (breakeven / trail ratchet). */
function setMemoryStop(userId: string, symbol: string, stopLoss: number) {
  const g = globalThis as typeof globalThis & {
    __enginePositionMaps?: Map<string, Map<string, Record<string, unknown>>>;
  };
  g.__enginePositionMaps ??= new Map();
  if (!g.__enginePositionMaps.has(userId)) g.__enginePositionMaps.set(userId, new Map());
  g.__enginePositionMaps.get(userId)!.set(symbol, {
    symbol, qty: 10, entryPrice: 100, peakPrice: 120, stopLoss,
    takeProfit: 200, trailingStopPct: 0.1, entryDate: new Date(), holdPeriod: 20,
  });
}

const NOT_WORKING = new Set(["canceled", "rejected", "filled", "expired", "pending_cancel"]);

/** Working stop sell orders for a symbol. */
function liveStops(symbol: string): FakeOrder[] {
  return state.orders.filter(
    (o) => o.symbol === symbol && o.side === "sell" && o.type === "stop" && !NOT_WORKING.has(o.status)
  );
}

// Entry 100, market 120. Any preset's fixed stop is below entry, so every
// target in these tests is decided by the broker or in-memory stop.
const pos = (symbol: string) => ({ symbol, qty: 10, avgEntryPrice: 100, currentPrice: 120 });

beforeEach(() => {
  state.positions = [];
  state.orders = [];
  state.withReplace = true;
  state.calls = [];
  state.cancelAllCalls = 0;
  state.hangReplace = new Set();
  state.onCancel = null;
  state.placeDelayMs = 0;
  state.rejectQtyReplace = false;
  state.ambiguousPlace = false;
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("placeSafetyStops", () => {
  it("never calls cancelAllOrders", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL"), pos("MSFT")];
    state.orders = [stop("s-aapl", "AAPL", 110), { id: "b-nvda", symbol: "NVDA", side: "buy", type: "limit", status: "new", qty: 5 }];

    await placeSafetyStops(userId);
    expect(state.cancelAllCalls).toBe(0);
    // The resting entry is cancelled on its own, so it cannot fill after stop.
    expect(state.calls).toContain("cancel:NVDA");
  });

  it("keeps an existing ratcheted stop that is above the fixed stop", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL")];
    state.orders = [stop("s-aapl", "AAPL", 110)];

    await placeSafetyStops(userId);
    expect(state.calls.filter((c) => c.startsWith("replace:") || c.startsWith("cancel:") || c.startsWith("place:"))).toEqual([]);
    expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["110.00"]);
  });

  it("raises a lower existing stop in place to the in-memory stop", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL")];
    state.orders = [stop("s-aapl", "AAPL", 50)];
    setMemoryStop(userId, "AAPL", 105);

    await placeSafetyStops(userId);
    expect(state.calls).toEqual(["replace:AAPL:105.00:-"]);
    expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["105.00"]);
  });

  it("never moves an existing stop down to a lower in-memory stop", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL")];
    state.orders = [stop("s-aapl", "AAPL", 112)];
    setMemoryStop(userId, "AAPL", 101);

    await placeSafetyStops(userId);
    expect(state.calls.some((c) => c.startsWith("replace:") || c.startsWith("cancel:"))).toBe(false);
    expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["112.00"]);
  });

  it("clamps the target just below market", async () => {
    const userId = freshUser();
    state.positions = [{ symbol: "AAPL", qty: 10, avgEntryPrice: 100, currentPrice: 104 }];
    state.orders = [stop("s-aapl", "AAPL", 90)];
    setMemoryStop(userId, "AAPL", 110); // above market after a gap down

    await placeSafetyStops(userId);
    const [o] = liveStops("AAPL");
    expect(parseFloat(o.stopPrice!)).toBeLessThan(104);
    expect(parseFloat(o.stopPrice!)).toBeGreaterThan(90);
  });

  it("places a stop for a position that has none", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL")];

    await placeSafetyStops(userId);
    const stops = liveStops("AAPL");
    expect(stops).toHaveLength(1);
    expect(parseFloat(stops[0].stopPrice!)).toBeLessThan(120);
  });

  it("leaves every position with a stop when the drain is aborted mid-way", async () => {
    const userId = freshUser();
    state.positions = [pos("AAPL"), pos("MSFT"), pos("TSLA")];
    state.orders = [stop("s-aapl", "AAPL", 50), stop("s-msft", "MSFT", 50)];
    setMemoryStop(userId, "AAPL", 105);
    setMemoryStop(userId, "MSFT", 106);
    state.hangReplace = new Set(["AAPL"]); // AAPL's replace never returns

    const ac = new AbortController();
    const done = placeSafetyStops(userId, ac.signal);
    await new Promise((r) => setTimeout(r, 50));
    ac.abort(new Error("shutdown deadline"));
    await done; // returns despite the hung broker call

    expect(state.cancelAllCalls).toBe(0);
    for (const s of ["AAPL", "MSFT", "TSLA"]) {
      expect(liveStops(s).length, `${s} has no stop`).toBeGreaterThan(0);
    }
    // The hung replace left the old stop, never removed it.
    expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["50.00"]);
    expect(liveStops("MSFT").map((o) => o.stopPrice)).toEqual(["106.00"]);
  });

  describe("stop qty differs from the position", () => {
    it("raises the price even when the qty change is rejected", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      // Stop covers 6 of 10 shares; a take-profit limit holds the other 4.
      state.orders = [
        stop("s-aapl", "AAPL", 50, 6),
        { id: "tp-aapl", symbol: "AAPL", side: "sell", type: "limit", status: "new", qty: 4 },
      ];
      setMemoryStop(userId, "AAPL", 105);
      state.rejectQtyReplace = true;

      await placeSafetyStops(userId);
      expect(state.calls).toEqual(["replace:AAPL:105.00:-", "replace:AAPL:-:10"]);
      expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["105.00"]);
    });

    it("matches the qty on its own when the price is already high enough", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      state.orders = [stop("s-aapl", "AAPL", 110, 6)];

      await placeSafetyStops(userId);
      expect(state.calls).toEqual(["replace:AAPL:-:10"]);
      expect(liveStops("AAPL").map((o) => [o.stopPrice, o.qty])).toEqual([["110.00", 10]]);
    });
  });

  describe("a position with no stop but another open sell", () => {
    it("cancels the sell, then places the stop", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      state.orders = [{ id: "lx-aapl", symbol: "AAPL", side: "sell", type: "limit", status: "new", qty: 10 }];

      await placeSafetyStops(userId);
      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL"]);
      expect(liveStops("AAPL")).toHaveLength(1);
    });

    it("does not return before the stop lands when the deadline fires after the cancel", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      state.orders = [{ id: "lx-aapl", symbol: "AAPL", side: "sell", type: "limit", status: "new", qty: 10 }];
      state.placeDelayMs = 50; // a slow stop POST

      const ac = new AbortController();
      state.onCancel = () => ac.abort(new Error("shutdown deadline"));
      await placeSafetyStops(userId, ac.signal);

      // handleShutdown exits as soon as the drain returns, so the stop must
      // already be at the broker by then.
      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL"]);
      expect(liveStops("AAPL")).toHaveLength(1);
    });
  });

  describe("orders that are no longer working", () => {
    // getOrders(..., "open") is not honoured by every broker (Tradier returns
    // the whole day). A dead stop must not stand in for protection.
    for (const status of ["rejected", "filled", "canceled", "expired"]) {
      it(`places a stop when the only listed stop is ${status}`, async () => {
        const userId = freshUser();
        state.withReplace = false; // Tradier: no replaceOrder, no cancel path taken
        state.positions = [pos("AAPL")];
        state.orders = [{ ...stop("s-aapl", "AAPL", 110), status }];

        await placeSafetyStops(userId);
        expect(state.calls).toEqual(["place:AAPL"]);
        expect(liveStops("AAPL")).toHaveLength(1);
        expect(liveStops("AAPL")[0].id).not.toBe("s-aapl");
      });
    }

    it("treats a pending_cancel stop as no protection and places a new one", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      state.orders = [{ ...stop("s-aapl", "AAPL", 110), status: "pending_cancel" }];

      await placeSafetyStops(userId);
      expect(state.calls.some((c) => c.startsWith("replace:"))).toBe(false);
      expect(state.calls).toContain("place:AAPL");
      expect(liveStops("AAPL").filter((o) => o.id !== "s-aapl")).toHaveLength(1);
    });

    it("does not try to cancel a buy that already filled", async () => {
      const userId = freshUser();
      state.positions = [pos("AAPL")];
      state.orders = [
        stop("s-aapl", "AAPL", 110),
        { id: "b-old", symbol: "NVDA", side: "buy", type: "market", status: "filled", qty: 5 },
      ];

      await placeSafetyStops(userId);
      expect(state.calls).toEqual([]);
    });
  });

  describe("broker without replaceOrder", () => {
    it("cancels then places one symbol at a time", async () => {
      const userId = freshUser();
      state.withReplace = false;
      state.positions = [pos("AAPL"), pos("MSFT")];
      state.orders = [stop("s-aapl", "AAPL", 50), stop("s-msft", "MSFT", 50)];
      setMemoryStop(userId, "AAPL", 105);
      setMemoryStop(userId, "MSFT", 106);

      await placeSafetyStops(userId);
      expect(state.cancelAllCalls).toBe(0);
      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL", "cancel:MSFT", "place:MSFT"]);
      expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["105.00"]);
      expect(liveStops("MSFT").map((o) => o.stopPrice)).toEqual(["106.00"]);
    });

    it("places the replacement for a sent cancel even when aborted, and touches no other symbol", async () => {
      const userId = freshUser();
      state.withReplace = false;
      state.positions = [pos("AAPL"), pos("MSFT")];
      state.orders = [stop("s-aapl", "AAPL", 50), stop("s-msft", "MSFT", 50)];
      setMemoryStop(userId, "AAPL", 105);
      setMemoryStop(userId, "MSFT", 106);

      const ac = new AbortController();
      state.onCancel = () => ac.abort(new Error("shutdown deadline"));
      await placeSafetyStops(userId, ac.signal);

      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL"]);
      expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["105.00"]);
      expect(liveStops("MSFT").map((o) => o.stopPrice)).toEqual(["50.00"]);
    });

    it("does not look up an ambiguous replacement once the drain deadline has passed", async () => {
      const userId = freshUser();
      state.withReplace = false;
      state.positions = [pos("AAPL")];
      state.orders = [stop("s-aapl", "AAPL", 50)];
      setMemoryStop(userId, "AAPL", 105);
      state.ambiguousPlace = true;

      const ac = new AbortController();
      state.onCancel = () => ac.abort(new Error("shutdown deadline"));
      const started = Date.now();
      await placeSafetyStops(userId, ac.signal);

      // The stop POST is still sent after the cancel, but its lost response
      // is not chased with a second broker call past the deadline: the
      // lookup is what would push the pair past FORCE_EXIT_MS.
      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL"]);
      expect(Date.now() - started).toBeLessThan(1_000);
    });

    it("starts no new cancel late in the drain, so a replacement cannot outlive the force exit", async () => {
      const userId = freshUser();
      state.withReplace = false;
      state.positions = [pos("AAPL"), pos("MSFT")];
      state.orders = [stop("s-aapl", "AAPL", 50), stop("s-msft", "MSFT", 50)];
      setMemoryStop(userId, "AAPL", 105);
      setMemoryStop(userId, "MSFT", 106);

      // Once AAPL's cancel lands, the clock jumps 10 s: past the cutoff but
      // still inside the 15 s budget, so only the cutoff can stop MSFT.
      const realNow = Date.now.bind(Date);
      let skew = 0;
      vi.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
      state.onCancel = () => {
        skew = 10_000;
      };

      await placeSafetyStops(userId);
      expect(state.calls).toEqual(["cancel:AAPL", "place:AAPL"]);
      expect(liveStops("AAPL").map((o) => o.stopPrice)).toEqual(["105.00"]);
      expect(liveStops("MSFT").map((o) => o.stopPrice)).toEqual(["50.00"]);
    });
  });
});
