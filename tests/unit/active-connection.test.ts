/**
 * One active broker connection per user, and a server-checked expected
 * connection on manual orders (WP05, findings #50 and #29).
 *
 *   - resolveActiveConnection returns the single active row, and with several
 *     (before migration 0049) picks the one the engine always preferred:
 *     paper, then the oldest;
 *   - POST /api/broker/connections creates a second connection inactive, so
 *     adding live keys never changes the account the engine, the kill switch
 *     and manual orders act on;
 *   - PATCH cannot set isActive, and cannot change the environment of the
 *     active connection (fenced in the UPDATE);
 *   - POST /api/broker/orders refuses with 409 CONNECTION_CHANGED, before the
 *     broker is contacted, when the ticket's expectedConnectionId (or
 *     expectedEnvironment) is not the active connection.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  selectRows: [] as Row[],
  inserts: [] as Row[],
  insertImpl: null as null | ((v: Row) => Promise<Row[]>),
  updates: [] as Array<{ set: Row; where: unknown }>,
  updateResult: [] as Row[],
  placed: [] as Row[],
  createdEnvironments: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ userId: "user-1" }),
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/shutdown-state", () => ({
  isShuttingDown: () => false,
  shuttingDownResponseInit: () => ({ body: {}, init: { status: 503 } }),
}));

vi.mock("@/lib/trading-engine", () => ({ peekEngineStatus: () => null }));

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

// Minimal drizzle stand-in: select resolves state.selectRows (awaited
// directly or through limit()), insert and update record what they were given.
vi.mock("@/lib/db", () => {
  const selectResult = () => {
    const p = Promise.resolve(state.selectRows);
    return Object.assign(p, { limit: async () => state.selectRows });
  };
  const db = {
    select: () => ({ from: () => ({ where: () => selectResult() }) }),
    insert: () => ({
      values: (v: Row) => ({
        returning: async () => {
          state.inserts.push(v);
          return state.insertImpl ? state.insertImpl(v) : [{ id: "new-conn", ...v }];
        },
      }),
    }),
    update: () => ({
      set: (set: Row) => ({
        where: (where: unknown) => ({
          returning: async () => {
            state.updates.push({ set, where });
            return state.updateResult;
          },
        }),
      }),
    }),
  };
  return {
    db,
    withTimeout: async (_ms: number, fn: (tx: unknown) => Promise<unknown>) => fn(db),
    isStatementTimeout: () => false,
  };
});

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: (_b: string, _k: string, _s: string, environment: string) => {
      state.createdEnvironments.push(environment);
      return {
        placeOrder: async (p: Row) => {
          state.placed.push(p);
          return {
            id: "ord-1", symbol: "AAPL", side: "buy", qty: 1, filledQty: 0, type: "market",
            status: "accepted", filledPrice: null, timeInForce: "day", limitPrice: null,
            stopPrice: null, submittedAt: "2026-09-23T14:30:00Z", filledAt: null, canceledAt: null,
          };
        },
      };
    },
  };
});

import { resolveActiveConnection, pickActiveConnection, type BrokerConnectionRow } from "@/lib/broker-connection";
import { POST as createConnection, PATCH as updateConnection } from "@/app/api/broker/connections/route";
import { POST as placeOrderRoute } from "@/app/api/broker/orders/route";

const PAPER_ID = "5d0c7a3e-2b4f-4c1d-9e8a-7f6b5a4c3d2e";
const LIVE_ID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function conn(id: string, environment: "paper" | "live", createdAt: string, extra: Row = {}): BrokerConnectionRow {
  return {
    id, userId: "user-1", broker: "alpaca", label: "Default", apiKey: "k", apiSecret: "s",
    environment, isActive: true, lastConnectedAt: null,
    createdAt: new Date(createdAt), updatedAt: new Date(createdAt), ...extra,
  } as BrokerConnectionRow;
}

function jsonRequest(url: string, method: string, body: Row): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function whereSql(where: unknown): string {
  return new PgDialect().sqlToQuery(where as SQL).sql;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { __rateLimitStore?: Map<string, unknown> }).__rateLimitStore?.clear();
  state.selectRows = [];
  state.inserts = [];
  state.insertImpl = null;
  state.updates = [];
  state.updateResult = [];
  state.placed = [];
  state.createdEnvironments = [];
});

describe("resolveActiveConnection", () => {
  it("returns the single active row", async () => {
    const only = conn(LIVE_ID, "live", "2026-01-01");
    state.selectRows = [only];
    expect(await resolveActiveConnection("user-1")).toBe(only);
  });

  it("returns null when the user has no active connection", async () => {
    state.selectRows = [];
    expect(await resolveActiveConnection("user-1")).toBeNull();
  });

  it("with two active rows picks paper over an older live one, whatever order the DB returns", async () => {
    const live = conn(LIVE_ID, "live", "2026-01-01");
    const paper = conn(PAPER_ID, "paper", "2026-02-01");
    state.selectRows = [live, paper];
    expect((await resolveActiveConnection("user-1"))?.id).toBe(PAPER_ID);
    state.selectRows = [paper, live];
    expect((await resolveActiveConnection("user-1"))?.id).toBe(PAPER_ID);
  });

  it("among the same environment picks the oldest, then the lowest id", () => {
    const newer = conn("b0000000-0000-4000-8000-000000000000", "live", "2026-03-01");
    const older = conn("c0000000-0000-4000-8000-000000000000", "live", "2026-01-01");
    expect(pickActiveConnection([newer, older])?.id).toBe(older.id);
    const tieA = conn("a0000000-0000-4000-8000-000000000000", "live", "2026-01-01");
    expect(pickActiveConnection([older, tieA])?.id).toBe(tieA.id);
  });
});

describe("POST /api/broker/connections", () => {
  const body = { broker: "alpaca", apiKey: "k", apiSecret: "s", environment: "live" };

  it("creates the connection inactive when the user already has an active one", async () => {
    state.selectRows = [{ id: PAPER_ID }];
    const res = await createConnection(jsonRequest("http://localhost/api/broker/connections", "POST", body));
    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].isActive).toBe(false);
    expect((await res.json()).connection.isActive).toBe(false);
  });

  it("creates a user's first connection active", async () => {
    state.selectRows = [];
    const res = await createConnection(jsonRequest("http://localhost/api/broker/connections", "POST", body));
    expect(res.status).toBe(201);
    expect(state.inserts[0].isActive).toBe(true);
  });

  it("falls back to inactive when a concurrent add took the one active slot", async () => {
    state.selectRows = [];
    state.insertImpl = async (v) => {
      if (v.isActive) {
        throw new Error("Failed query: insert into broker_connections", {
          cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
            constraint_name: "broker_connections_one_active_per_user_idx",
          }),
        });
      }
      return [{ id: "new-conn", ...v }];
    };
    const res = await createConnection(jsonRequest("http://localhost/api/broker/connections", "POST", body));
    expect(res.status).toBe(201);
    expect(state.inserts.map((v) => v.isActive)).toEqual([true, false]);
  });
});

describe("PATCH /api/broker/connections", () => {
  it("refuses isActive and writes nothing: activation goes through /activate", async () => {
    const res = await updateConnection(
      jsonRequest("http://localhost/api/broker/connections", "PATCH", { id: LIVE_ID, isActive: true })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("USE_ACTIVATE");
    expect(state.updates).toHaveLength(0);
  });

  it("refuses an environment change on the active connection, fenced in the UPDATE", async () => {
    state.updateResult = []; // the is_active = false fence matched nothing
    state.selectRows = [{ id: PAPER_ID }]; // but the row exists and is the user's
    const res = await updateConnection(
      jsonRequest("http://localhost/api/broker/connections", "PATCH", { id: PAPER_ID, environment: "live" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONNECTION_ACTIVE");
    expect(state.updates).toHaveLength(1);
    expect(whereSql(state.updates[0].where)).toMatch(/"is_active" = \$\d/);
  });

  it("still updates a label without the active fence", async () => {
    state.updateResult = [conn(PAPER_ID, "paper", "2026-01-01", { label: "Main" })];
    const res = await updateConnection(
      jsonRequest("http://localhost/api/broker/connections", "PATCH", { id: PAPER_ID, label: "Main" })
    );
    expect(res.status).toBe(200);
    expect(whereSql(state.updates[0].where)).not.toMatch(/is_active/);
  });
});

describe("POST /api/broker/orders: expected connection", () => {
  const order = { symbol: "AAPL", side: "buy", qty: "1" };

  it("a stale expectedConnectionId gets 409 CONNECTION_CHANGED and the broker is never called", async () => {
    // The ticket loaded on paper; the live connection is active now.
    state.selectRows = [conn(LIVE_ID, "live", "2026-01-01")];
    const res = await placeOrderRoute(
      jsonRequest("http://localhost/api/broker/orders", "POST", {
        ...order, expectedConnectionId: PAPER_ID, expectedEnvironment: "paper",
      })
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("CONNECTION_CHANGED");
    expect(data.retryable).toBe(false);
    expect(data.activeConnection.environment).toBe("live");
    expect(state.placed).toHaveLength(0);
    expect(state.createdEnvironments).toHaveLength(0);
  });

  it("a matching id but a different expectedEnvironment is refused too", async () => {
    state.selectRows = [conn(LIVE_ID, "live", "2026-01-01")];
    const res = await placeOrderRoute(
      jsonRequest("http://localhost/api/broker/orders", "POST", {
        ...order, expectedConnectionId: LIVE_ID, expectedEnvironment: "paper",
      })
    );
    expect(res.status).toBe(409);
    expect(state.placed).toHaveLength(0);
  });

  it("an order without expectedConnectionId is rejected before the broker", async () => {
    state.selectRows = [conn(PAPER_ID, "paper", "2026-01-01")];
    const res = await placeOrderRoute(jsonRequest("http://localhost/api/broker/orders", "POST", order));
    expect(res.status).toBe(400);
    expect(state.placed).toHaveLength(0);
  });

  it("the matching connection places the order on it", async () => {
    state.selectRows = [conn(LIVE_ID, "live", "2026-01-01")];
    const res = await placeOrderRoute(
      jsonRequest("http://localhost/api/broker/orders", "POST", {
        ...order, expectedConnectionId: LIVE_ID, expectedEnvironment: "live",
      })
    );
    expect(res.status).toBe(201);
    expect(state.placed).toHaveLength(1);
    expect(state.createdEnvironments).toEqual(["live"]);
  });

  it("with two active rows the order goes to the paper one the engine uses, not an arbitrary one", async () => {
    state.selectRows = [conn(LIVE_ID, "live", "2026-01-01"), conn(PAPER_ID, "paper", "2026-02-01")];
    const res = await placeOrderRoute(
      jsonRequest("http://localhost/api/broker/orders", "POST", { ...order, expectedConnectionId: PAPER_ID })
    );
    expect(res.status).toBe(201);
    expect(state.createdEnvironments).toEqual(["paper"]);
  });
});
