/**
 * Protective broker resolver (WP01, finding #44).
 *
 * The live-trading permission gates (ALLOW_LIVE_TRADING and the per-user
 * live_trading_enabled flag) exist to stop the engine OPENING live exposure.
 * Before this split they also sat in front of the kill switch and the safety
 * stops, so revoking live permission while positions were open turned
 * haltEngine into a silent no-op that still reported success.
 *
 * These tests drive the real engine module with a mocked db and broker:
 *   - the opening resolver and startEngine still refuse live when gated;
 *   - the protection resolver, haltEngine and placeSafetyStops still reach
 *     the live account when gated;
 *   - haltEngine with no connection at all reports BROKER_UNRESOLVED.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { brokerConnections, users } from "@/lib/db/schema";

// ─── Mock state ─────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
  userRow: { liveEnabled: true, email: "u@example.com" } as { liveEnabled: boolean; email: string } | null,
  userReadThrows: false,
  placedOrders: [] as Array<Record<string, unknown>>,
  cancelAllCalls: 0,
  createdEnvironments: [] as string[],
  positions: [] as Array<Record<string, unknown>>,
  marketOpen: true,
  audits: [] as Array<{ action: string; metadata?: Record<string, unknown> }>,
}));

// Chainable drizzle stand-in. Every builder method returns the chain; awaiting
// it resolves by the table named in from(). Inserts/updates resolve to [].
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  function chain(): unknown {
    let table: unknown = null;
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            try {
              if (table === schema.brokerConnections) return resolve(state.connections);
              if (table === schema.users) {
                if (state.userReadThrows) return reject(new Error("db down"));
                return resolve(state.userRow ? [state.userRow] : []);
              }
              return resolve([]);
            } catch (e) {
              reject(e);
            }
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
  return {
    db,
    withTimeout: <T,>(p: Promise<T>) => p,
    isStatementTimeout: () => false,
  };
});

vi.mock("@/lib/crypto", () => ({
  decrypt: (v: string) => v,
  encrypt: (v: string) => v,
}));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    writeAudit: vi.fn(async (entry: { action: string; metadata?: Record<string, unknown> }) => {
      state.audits.push({ action: entry.action, metadata: entry.metadata });
    }),
  };
});

vi.mock("@/lib/market-hours", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market-hours")>();
  return { ...actual, isMarketOpen: () => state.marketOpen };
});

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchQuote: async () => null }),
}));

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: (broker: string, _k: string, _s: string, environment: string) => {
      state.createdEnvironments.push(environment);
      return {
        broker,
        environment,
        getPositions: async () => state.positions,
        getOrders: async () => [],
        cancelAllOrders: async () => {
          state.cancelAllCalls++;
        },
        placeOrder: async (params: Record<string, unknown>) => {
          state.placedOrders.push({ ...params, environment });
          return { id: `ord-${state.placedOrders.length}`, status: "accepted" };
        },
      };
    },
  };
});

import {
  resolveBrokerClient,
  resolveBrokerClientForProtection,
  startEngine,
  haltEngine,
  placeSafetyStops,
  HALT_BROKER_UNRESOLVED,
} from "@/lib/trading-engine";
import { AuditAction } from "@/lib/audit";

// ─── Fixtures ───────────────────────────────────────────────────────────────

let seq = 0;
function freshUser(): string {
  seq++;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

function liveConnection(userId: string) {
  return {
    id: `conn-live-${userId}`,
    userId,
    broker: "alpaca",
    environment: "live",
    isActive: true,
    apiKey: "k",
    apiSecret: "s",
  };
}

const LIVE_POSITION = { symbol: "AAPL", qty: 10, avgEntryPrice: 200, currentPrice: 190 };

const savedEnv = process.env.ALLOW_LIVE_TRADING;

beforeEach(() => {
  state.connections = [];
  state.userRow = { liveEnabled: true, email: "u@example.com" };
  state.userReadThrows = false;
  state.placedOrders = [];
  state.cancelAllCalls = 0;
  state.createdEnvironments = [];
  state.positions = [];
  state.marketOpen = true;
  state.audits = [];
  delete process.env.ALLOW_LIVE_TRADING;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.ALLOW_LIVE_TRADING;
  else process.env.ALLOW_LIVE_TRADING = savedEnv;
});

// Sanity: the mock db dispatches on the real schema objects.
it("mock db dispatches on the real schema tables", () => {
  expect(brokerConnections).toBeTruthy();
  expect(users).toBeTruthy();
});

// ─── (1) + (2) ALLOW_LIVE_TRADING unset ─────────────────────────────────────

describe("ALLOW_LIVE_TRADING unset, live connection", () => {
  it("opening resolver returns null and writes ENGINE_LIVE_BLOCKED", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];

    expect(await resolveBrokerClient(userId)).toBeNull();
    expect(state.audits.some((a) => a.action === AuditAction.ENGINE_LIVE_BLOCKED)).toBe(true);
  });

  it("startEngine still refuses (entry gate unchanged)", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];

    const res = await startEngine(userId);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ALLOW_LIVE_TRADING/);
    expect(state.audits.some((a) => a.action === AuditAction.ENGINE_LIVE_BLOCKED)).toBe(true);
    expect(state.placedOrders).toHaveLength(0);
  });

  it("protection resolver returns the live client and audits the bypass", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];

    const resolved = await resolveBrokerClientForProtection(userId);
    expect(resolved).not.toBeNull();
    expect(resolved!.environment).toBe("live");
    const bypass = state.audits.find((a) => a.action === AuditAction.ENGINE_LIVE_PROTECTIVE_ACTION);
    expect(bypass?.metadata?.reason).toBe("ALLOW_LIVE_TRADING_not_set");
    expect(state.audits.some((a) => a.action === AuditAction.ENGINE_LIVE_BLOCKED)).toBe(false);
  });
});

// ─── (3) per-user permission revoked ────────────────────────────────────────

describe("ALLOW_LIVE_TRADING=1 but user.live_trading_enabled=false", () => {
  beforeEach(() => {
    process.env.ALLOW_LIVE_TRADING = "1";
    state.userRow = { liveEnabled: false, email: "u@example.com" };
  });

  it("opening resolver refuses", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    expect(await resolveBrokerClient(userId)).toBeNull();
  });

  it("protection resolver still returns the live client", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    const resolved = await resolveBrokerClientForProtection(userId);
    expect(resolved?.environment).toBe("live");
  });

  it("a failed permission read: opening fails closed, protection proceeds", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    state.userReadThrows = true;
    expect(await resolveBrokerClient(userId)).toBeNull();
    expect((await resolveBrokerClientForProtection(userId))?.environment).toBe("live");
  });
});

// ─── (4) + (5) haltEngine ───────────────────────────────────────────────────

describe("haltEngine", () => {
  it("liquidates through the live client with the gate closed, on an engine that never started", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    state.positions = [LIVE_POSITION];

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(res.failedSymbols).toEqual([]);
    expect(state.cancelAllCalls).toBe(1);
    expect(state.placedOrders).toEqual([
      expect.objectContaining({ symbol: "AAPL", side: "sell", qty: "10", type: "market", environment: "live" }),
    ]);
  });

  it("returns ok:false with BROKER_UNRESOLVED when there is no connection at all", async () => {
    const userId = freshUser();
    state.connections = [];

    const res = await haltEngine(userId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe(HALT_BROKER_UNRESOLVED);
    expect(res.error).toMatch(/no positions were closed/i);
    expect(state.placedOrders).toHaveLength(0);
  });

  it("reports the symbols it could not liquidate instead of claiming success for them", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    state.positions = [LIVE_POSITION];
    state.marketOpen = false; // market orders refused by the market-close guard

    const res = await haltEngine(userId);
    expect(res.ok).toBe(true);
    expect(res.failedSymbols).toEqual(["AAPL"]);
  });
});

// ─── (6) placeSafetyStops ───────────────────────────────────────────────────

describe("placeSafetyStops", () => {
  it("places the stop on the live account with the gate closed", async () => {
    const userId = freshUser();
    state.connections = [liveConnection(userId)];
    state.positions = [LIVE_POSITION];

    await placeSafetyStops(userId);
    expect(state.placedOrders).toEqual([
      expect.objectContaining({ symbol: "AAPL", side: "sell", type: "stop", environment: "live" }),
    ]);
  });
});
