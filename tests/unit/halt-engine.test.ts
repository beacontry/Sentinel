/**
 * Kill switch (WP02, findings #41, #42, #43).
 *
 * Drives the real haltEngine with a mocked db and a stateful fake broker that
 * behaves like Alpaca where it matters:
 *   - a cancelled order sits in pending_cancel for a few polls before it is
 *     canceled, and a market sell for a symbol whose shares are still held
 *     by an open or pending_cancel order is rejected for insufficient qty;
 *   - cancel-all answers 207 Multi-Status with per-order statuses.
 *
 * Covers: the in-flight scan is cancelled synchronously on halt; BUYs are
 * refused after a halt while SELLs are not; sells go out only after the
 * symbol's stops are released; a rejected sell is re-protected and reported;
 * a 207 partial cancel is surfaced; and outside market hours nothing is
 * cancelled or sold and the result says MARKET_CLOSED.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mock state ─────────────────────────────────────────────────────────────

type FakeOrder = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  status: string;
  qty: number;
  pollsLeft?: number;
};

const state = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
  positions: [] as Array<Record<string, unknown>>,
  orders: [] as FakeOrder[],
  /** getOrders polls a cancelled order spends in pending_cancel. */
  releaseAfterPolls: 0,
  placed: [] as Array<Record<string, unknown>>,
  sellAttempts: [] as string[],
  cancelAllCalls: 0,
  cancelOrderCalls: [] as string[],
  /** Symbols whose market sell is rejected with a non-qty error. */
  rejectSellSymbols: [] as string[],
  /** Symbols whose first market sell is rejected for insufficient qty. */
  insufficientOnceSymbols: [] as string[],
  marketOpen: true,
  inserts: [] as Array<Record<string, unknown>>,
  /** When set, cancelAllOrders throws this. */
  cancelAllError: null as Error | null,
  /** Order ids whose cancel the broker refuses. */
  failCancelIds: [] as string[],
  /**
   * After a cancel, a market sell for that symbol is rejected for held qty
   * for this long even once the order list shows the stop canceled (Alpaca
   * can report canceled a beat before held_for_orders is released).
   */
  holdAfterCancelMs: 0,
  heldUntil: {} as Record<string, number>,
  /** Called on each accepted market sell, to inject broker events mid-halt. */
  onSell: null as ((symbol: string) => void) | null,
}));

const HOLDING = ["new", "accepted", "pending_new", "partially_filled", "held", "pending_cancel"];

vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  function chain(): unknown {
    let table: unknown = null;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => {
              if (table === schema.brokerConnections) return resolve(state.connections);
              return resolve([]);
            };
          }
          return (...args: unknown[]) => {
            if (prop === "from") table = args[0];
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
  return { ...actual, isMarketOpen: () => state.marketOpen };
});

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchQuote: async () => ({ price: 0 }) }),
}));

function makeFakeClient(environment: string) {
  return {
    broker: "alpaca",
    environment,
    getPositions: async () => state.positions,
    getOrders: async (_limit?: number, status?: string) => {
      // Each poll moves pending_cancel orders one step toward canceled.
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
      if (state.failCancelIds.includes(id)) throw new Error(`Alpaca cancel 422: order ${id} is not cancelable`);
      const o = state.orders.find((x) => x.id === id);
      if (o && state.holdAfterCancelMs > 0) state.heldUntil[o.symbol] = Date.now() + state.holdAfterCancelMs;
      if (o) {
        o.status = "pending_cancel";
        o.pollsLeft = state.releaseAfterPolls;
      }
    },
    cancelAllOrders: async () => {
      state.cancelAllCalls++;
      if (state.cancelAllError) throw state.cancelAllError;
    },
    placeOrder: async (params: Record<string, unknown>) => {
      const symbol = params.symbol as string;
      if (params.side === "sell" && params.type === "market") {
        state.sellAttempts.push(symbol);
        if (state.rejectSellSymbols.includes(symbol)) {
          throw new Error(`Alpaca order 422: symbol ${symbol} is not tradable`);
        }
        const once = state.insufficientOnceSymbols.indexOf(symbol);
        const held =
          state.orders.some((o) => o.symbol === symbol && o.side === "sell" && HOLDING.includes(o.status)) ||
          Date.now() < (state.heldUntil[symbol] ?? 0);
        if (held || once >= 0) {
          if (once >= 0) state.insufficientOnceSymbols.splice(once, 1);
          throw new Error(`Alpaca order 403: {"message":"insufficient qty available for order"}`);
        }
      }
      state.placed.push({ ...params });
      if (params.side === "sell" && params.type === "market") state.onSell?.(symbol);
      return { id: `ord-${state.placed.length}`, status: "accepted" };
    },
  };
}

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: (_b: string, _k: string, _s: string, environment: string) => makeFakeClient(environment),
  };
});

import {
  haltEngine,
  placeEngineOrder,
  canPlaceBuyOrder,
  cancelAllAndWait,
  cancelSymbolOrdersAndWait,
  EngineClosedForEntriesError,
  HALT_LIQUIDATION_FAILED,
  HALT_MARKET_CLOSED,
  type EngineState,
} from "@/lib/trading-engine";
import { AlpacaClient, CancelAllPartialError, type BrokerClient } from "@/lib/brokers";

// ─── Fixtures ───────────────────────────────────────────────────────────────

let seq = 0;
function freshUser(): string {
  seq++;
  return `00000000-0000-4000-9000-${String(seq).padStart(12, "0")}`;
}

function paperConnection(userId: string) {
  return {
    id: `conn-paper-${userId}`,
    userId,
    broker: "alpaca",
    environment: "paper",
    isActive: true,
    apiKey: "k",
    apiSecret: "s",
  };
}

function engines(): Map<string, EngineState> {
  const g = globalThis as typeof globalThis & { __tradingEngines?: Map<string, EngineState> };
  g.__tradingEngines ??= new Map();
  return g.__tradingEngines;
}

const AAPL = { symbol: "AAPL", qty: 10, avgEntryPrice: 200, currentPrice: 190 };
const MSFT = { symbol: "MSFT", qty: 5, avgEntryPrice: 400, currentPrice: 410 };

function stop(id: string, symbol: string, qty: number): FakeOrder {
  return { id, symbol, side: "sell", type: "stop", status: "new", qty };
}

function buy(id: string, symbol: string, qty: number): FakeOrder {
  return { id, symbol, side: "buy", type: "limit", status: "new", qty };
}

beforeEach(() => {
  state.connections = [];
  state.positions = [];
  state.orders = [];
  state.releaseAfterPolls = 0;
  state.placed = [];
  state.sellAttempts = [];
  state.cancelAllCalls = 0;
  state.cancelOrderCalls = [];
  state.rejectSellSymbols = [];
  state.insufficientOnceSymbols = [];
  state.marketOpen = true;
  state.inserts = [];
  state.cancelAllError = null;
  state.failCancelIds = [];
  state.holdAfterCancelMs = 0;
  state.heldUntil = {};
  state.onSell = null;
});

// ─── #43 in-flight scan and BUY gates ───────────────────────────────────────

describe("halt stops in-flight entries (finding #43)", () => {
  it("bumps scanGeneration before its first await", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    const pending = haltEngine(userId); // not awaited yet
    const engine = engines().get(userId)!;
    // The synchronous prefix has run: an in-flight scan holding generation 0
    // is already cancelled before any broker call resolves.
    expect(engine.scanGeneration).toBe(1);
    expect(engine.halted).toBe(true);
    expect(engine.running).toBe(false);
    await pending;
  });

  it("refuses a BUY after halt through placeEngineOrder and canPlaceBuyOrder, but allows a SELL", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    await haltEngine(userId);
    const engine = engines().get(userId)!;
    const client = makeFakeClient("paper") as unknown as BrokerClient;

    await expect(
      placeEngineOrder(client, { symbol: "NVDA", side: "buy", qty: "1", type: "limit", timeInForce: "day", limitPrice: "100" }, engine)
    ).rejects.toBeInstanceOf(EngineClosedForEntriesError);

    const gate = await canPlaceBuyOrder(engine, "NVDA", 100, {} as never, 10_000);
    expect(gate).toMatchObject({ ok: false, reason: "engine_halted" });

    await expect(
      placeEngineOrder(client, { symbol: "NVDA", side: "sell", qty: "1", type: "market", timeInForce: "day" }, engine)
    ).resolves.toMatchObject({ status: "accepted" });
    expect(state.placed).toEqual([expect.objectContaining({ symbol: "NVDA", side: "sell" })]);
  });

  it("refuses a BUY when no engine is passed (fail closed) and allows one on a running engine", async () => {
    const client = makeFakeClient("paper") as unknown as BrokerClient;
    const buy = { symbol: "NVDA", side: "buy" as const, qty: "1", type: "limit" as const, timeInForce: "day" as const, limitPrice: "100" };
    await expect(placeEngineOrder(client, buy)).rejects.toBeInstanceOf(EngineClosedForEntriesError);
    const live = { halted: false, running: true } as EngineState;
    await expect(placeEngineOrder(client, buy, live)).resolves.toMatchObject({ status: "accepted" });
  });
});

describe("halt sweeps entries again after liquidation (finding #43 residual)", () => {
  it("cancels a BUY the broker accepted after the first entry sweep", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    // A BUY that was already inside placeOrder when the halt began lands at
    // the broker while the halt is liquidating.
    state.onSell = () => {
      if (!state.orders.some((o) => o.id === "late-buy")) state.orders.push(buy("late-buy", "NVDA", 3));
    };

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(state.cancelOrderCalls).toContain("late-buy");
    expect(state.orders.find((o) => o.id === "late-buy")?.status).not.toBe("new");
  });

  it("with no positions, falls back to cancelling BUYs one by one when cancel-all is partial", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [];
    state.orders = [buy("buy-1", "NVDA", 2), stop("manual-stop", "XYZ", 1)];
    state.cancelAllError = new CancelAllPartialError(["buy-1"], "1 of 2 orders not cancelled");

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(state.cancelAllCalls).toBe(1);
    expect(state.cancelOrderCalls).toContain("buy-1");
    expect(state.cancelOrderCalls).not.toContain("manual-stop");
  });

  it("with no positions, falls back to cancelling BUYs one by one when cancel-all fails outright", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [];
    state.orders = [buy("buy-2", "AMD", 4)];
    state.cancelAllError = new Error("Alpaca cancel-all 500");

    await haltEngine(userId);
    expect(state.cancelOrderCalls).toContain("buy-2");
  });
});

// ─── #42 cancel-and-wait per symbol ─────────────────────────────────────────

describe("halt waits for each symbol's orders to release before selling (finding #42)", () => {
  it("sells only after the stop goes from pending_cancel to canceled", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    state.orders = [stop("stop-aapl", "AAPL", 10)];
    state.releaseAfterPolls = 2;

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(res.closedSymbols).toEqual(["AAPL"]);
    expect(state.sellAttempts).toEqual(["AAPL"]); // first attempt succeeded
    expect(state.orders[0].status).toBe("canceled");
    expect(state.cancelAllCalls).toBe(0);
    expect(state.placed).toEqual([expect.objectContaining({ symbol: "AAPL", type: "market" })]);
  });

  it("retries once after an insufficient-qty rejection", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    state.insufficientOnceSymbols = ["AAPL"];

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(state.sellAttempts).toEqual(["AAPL", "AAPL"]);
    expect(res.closedSymbols).toEqual(["AAPL"]);
  });

  it("waits on a stop another path already put in pending_cancel before selling", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    // Cancelled before the halt began: no longer cancellable, but its shares
    // stay held for three more polls. The old helper found nothing to cancel
    // and returned without waiting.
    state.orders = [{ ...stop("stop-aapl", "AAPL", 10), status: "pending_cancel", pollsLeft: 3 }];

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(state.sellAttempts).toEqual(["AAPL"]); // no rejected first attempt
    expect(state.cancelOrderCalls).toEqual([]);
    expect(res.closedSymbols).toEqual(["AAPL"]);
  });

  it("waits a poll interval before the retry when the stop reads canceled but its shares are still held", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    state.orders = [stop("stop-aapl", "AAPL", 10)];
    // Canceled on the first poll (about 250ms after the cancel), shares held
    // until 400ms. The first sell is rejected; the old retry found nothing to
    // wait on, resent at once and was rejected again.
    state.holdAfterCancelMs = 400;

    const res = await haltEngine(userId);
    expect(state.orders[0].status).toBe("canceled");
    expect(state.sellAttempts).toEqual(["AAPL", "AAPL"]);
    expect(res.ok).toBe(true);
    expect(res.closedSymbols).toEqual(["AAPL"]);
    expect(res.unprotectedSymbols).toEqual([]);
  });

  it("a second call re-polls a stop still pending_cancel after the first call's deadline", async () => {
    state.orders = [stop("stop-aapl", "AAPL", 10)];
    state.releaseAfterPolls = 6;
    const client = makeFakeClient("paper") as unknown as BrokerClient;

    const first = await cancelSymbolOrdersAndWait(client, "AAPL", { maxMs: 300 });
    expect(first.released).toBe(false);
    expect(state.orders[0].status).toBe("pending_cancel");

    // Nothing left to cancel: the second call must still wait on the
    // pending_cancel stop instead of returning at once.
    const second = await cancelSymbolOrdersAndWait(client, "AAPL", { minWait: true });
    expect(second.released).toBe(true);
    expect(state.orders[0].status).toBe("canceled");
    expect(state.cancelOrderCalls).toEqual(["stop-aapl"]);
  });

  it("names the orders it could not cancel as the reason a symbol's sell failed", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];
    state.orders = [stop("stop-aapl", "AAPL", 10)];
    state.failCancelIds = ["stop-aapl"]; // the stop keeps holding the shares

    const res = await haltEngine(userId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe(HALT_LIQUIDATION_FAILED);
    expect(res.failedSymbols).toEqual(["AAPL"]);
    const engine = engines().get(userId)!;
    expect(engine.errors.some((e) => e.includes("could not be cancelled: stop-aapl"))).toBe(true);
  });

  it("re-places a stop for the symbol whose sell failed and reports it, while the other closes", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL, MSFT];
    state.orders = [stop("stop-aapl", "AAPL", 10), stop("stop-msft", "MSFT", 5)];
    state.rejectSellSymbols = ["AAPL"];

    const res = await haltEngine(userId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe(HALT_LIQUIDATION_FAILED);
    expect(res.failedSymbols).toEqual(["AAPL"]);
    expect(res.closedSymbols).toEqual(["MSFT"]);
    expect(res.unprotectedSymbols).toEqual([]);
    expect(res.error).toMatch(/Liquidation orders were submitted for: MSFT/);
    expect(res.error).toMatch(/safety stop was placed for: AAPL/i);
    expect(state.placed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "AAPL", side: "sell", type: "stop", timeInForce: "gtc" }),
        expect.objectContaining({ symbol: "MSFT", side: "sell", type: "market" }),
      ])
    );
  });

  it("logs the halt trade at a positive price when the quote comes back 0", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL];

    await haltEngine(userId);
    const trade = state.inserts.find((v) => v.signal === "HALT");
    expect(trade?.fillPrice).toBe(190);
    expect(trade?.pnl).toBe(-100);
  });
});

describe("207 partial cancel is surfaced (finding #42)", () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  function mock207(body: string) {
    globalThis.fetch = (vi.fn(async () => new Response(body, { status: 207 })) as unknown) as typeof fetch;
  }

  it("throws CancelAllPartialError naming the orders that did not cancel", async () => {
    mock207(JSON.stringify([{ id: "a", status: 200 }, { id: "b", status: 500 }]));
    const client = new AlpacaClient("k", "s", "paper");
    const err = await client.cancelAllOrders().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CancelAllPartialError);
    expect((err as CancelAllPartialError).failedOrderIds).toEqual(["b"]);
  });

  it("resolves when every entry in the 207 body is 2xx", async () => {
    mock207(JSON.stringify([{ id: "a", status: 200 }, { id: "b", status: 204 }]));
    await expect(new AlpacaClient("k", "s", "paper").cancelAllOrders()).resolves.toBeUndefined();
  });

  it("treats an unreadable 207 body as partial with unknown ids", async () => {
    mock207("not json");
    const err = await new AlpacaClient("k", "s", "paper").cancelAllOrders().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CancelAllPartialError);
    expect((err as CancelAllPartialError).failedOrderIds).toEqual([]);
  });

  it("cancelAllAndWait hands the partial to the caller and does not call a still-open order released", async () => {
    const client = {
      ...makeFakeClient("paper"),
      cancelAllOrders: async () => {
        throw new CancelAllPartialError(["stop-x"], "1 of 2 orders not cancelled");
      },
    } as unknown as BrokerClient;
    state.orders = [stop("stop-x", "X", 1)]; // still open: the one that failed
    const res = await cancelAllAndWait(client, 600);
    expect(res.failedOrderIds).toEqual(["stop-x"]);
    expect(res.released).toBe(false);
  });

  it("cancelAllAndWait still waits when a misread 207 names every order as failed", async () => {
    // Every order did cancel and sits in pending_cancel, but the partial
    // names all of them. Skipping "failed" orders would skip the wait.
    state.orders = [
      { ...stop("stop-a", "A", 1), status: "pending_cancel", pollsLeft: 2 },
      { ...stop("stop-b", "B", 1), status: "pending_cancel", pollsLeft: 2 },
    ];
    const client = {
      ...makeFakeClient("paper"),
      cancelAllOrders: async () => {
        throw new CancelAllPartialError(["stop-a", "stop-b"], "2 of 2 orders not cancelled");
      },
    } as unknown as BrokerClient;
    const res = await cancelAllAndWait(client, 5000);
    expect(res.released).toBe(true);
    expect(state.orders.every((o) => o.status === "canceled")).toBe(true);
  });
});

// ─── #41 market closed ──────────────────────────────────────────────────────

describe("halt outside market hours (finding #41)", () => {
  it("cancels no stop, places no market order, returns MARKET_CLOSED and persists the halt", async () => {
    const userId = freshUser();
    state.connections = [paperConnection(userId)];
    state.positions = [AAPL, MSFT];
    state.orders = [stop("stop-aapl", "AAPL", 10), stop("stop-msft", "MSFT", 5)];
    state.marketOpen = false;

    const res = await haltEngine(userId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe(HALT_MARKET_CLOSED);
    expect(res.failedSymbols).toEqual(["AAPL", "MSFT"]);
    expect(res.closedSymbols).toEqual([]);
    expect(res.error).toMatch(/market is closed/i);
    expect(res.error).not.toMatch(/submitted for/i);

    expect(state.cancelAllCalls).toBe(0);
    expect(state.cancelOrderCalls).toEqual([]);
    expect(state.orders.every((o) => o.status === "new")).toBe(true);
    expect(state.sellAttempts).toEqual([]);
    expect(state.placed).toEqual([]);

    const engine = engines().get(userId)!;
    expect(engine.halted).toBe(true);
    await new Promise((r) => setTimeout(r, 0)); // the daily-P&L write is fire-and-forget
    expect(state.inserts).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId, halted: true, haltReason: "user_emergency_halt" })])
    );
  });
});
