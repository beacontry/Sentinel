/**
 * POST /api/broker/orders with an ambiguous broker outcome (WP04, findings
 * #8 and #46). A timeout, dropped connection or 5xx after the POST was sent
 * does not prove Alpaca refused the order, so the route looks the order up
 * by its client_order_id before answering:
 *
 *   - found      -> 201 with the order, audited ORDER_PLACED;
 *   - not found  -> 202 ORDER_STATUS_UNKNOWN (retryable: false), audited
 *                   ORDER_UNCONFIRMED, never ORDER_REJECTED;
 *   - a duplicate client_order_id (a resubmit of the same intent) answers
 *     with the original order instead of a failure.
 *
 * The ticket's clientOrderId is forwarded to placeOrder so the broker can
 * refuse a second order for the same intent.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BrokerOrder, PlaceOrderParams } from "@/lib/brokers";

const state = vi.hoisted(() => ({
  audits: [] as Array<Record<string, unknown>>,
  placed: [] as Array<Record<string, unknown>>,
  lookups: [] as string[],
  placeImpl: null as null | ((p: Record<string, unknown>) => Promise<unknown>),
  lookupImpl: null as null | ((id: string) => Promise<unknown>),
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => null,
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/shutdown-state", () => ({
  isShuttingDown: () => false,
  shuttingDownResponseInit: () => ({ body: {}, init: { status: 503 } }),
}));

vi.mock("@/lib/trading-engine", () => ({ peekEngineStatus: () => null }));

vi.mock("@/lib/crypto", () => ({ decrypt: (v: string) => v, encrypt: (v: string) => v }));

vi.mock("@/lib/db", () => {
  const conn = { id: "conn", userId: "user-1", broker: "alpaca", environment: "paper", isActive: true, apiKey: "k", apiSecret: "s" };
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [conn] }) }) }) };
  return { db, withTimeout: async () => [conn], isStatementTimeout: () => false };
});

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    writeAudit: vi.fn(async (entry: Record<string, unknown>) => {
      state.audits.push(entry);
    }),
  };
});

vi.mock("@/lib/brokers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brokers")>();
  return {
    ...actual,
    createBrokerClient: () => ({
      placeOrder: async (p: PlaceOrderParams) => {
        state.placed.push({ ...p });
        return state.placeImpl!(p as unknown as Record<string, unknown>);
      },
      getOrderByClientId: async (id: string) => {
        state.lookups.push(id);
        return state.lookupImpl!(id);
      },
    }),
  };
});

import { POST } from "@/app/api/broker/orders/route";
import { BrokerError } from "@/lib/brokers";
import { AuditAction } from "@/lib/audit";

const INTENT_ID = "3f6c1a52-8b1e-4c7a-9d2e-5b7f0a1c2d3e";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function order(id: string): BrokerOrder {
  return {
    id, symbol: "AAPL", side: "buy", qty: 100, filledQty: 0, type: "market",
    status: "accepted", filledPrice: null, timeInForce: "day", limitPrice: null,
    stopPrice: null, submittedAt: "2026-09-23T14:30:00Z", filledAt: null, canceledAt: null,
  };
}

function timeoutError(): BrokerError {
  return new BrokerError("Connection timed out", 504, "Connection timed out", true, null, "unknown");
}

function orderRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/broker/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "AAPL", side: "buy", qty: "100", ...body }),
  });
}

function actions(): unknown[] {
  return state.audits.map((a) => a.action);
}

beforeEach(() => {
  (globalThis as typeof globalThis & { __rateLimitStore?: Map<string, unknown> }).__rateLimitStore?.clear();
  state.audits = [];
  state.placed = [];
  state.lookups = [];
  state.placeImpl = async () => order("ord-1");
  state.lookupImpl = async () => null;
});

describe("POST /api/broker/orders: client order id", () => {
  it("forwards the ticket's clientOrderId to the broker", async () => {
    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(201);
    expect(state.placed[0]?.clientOrderId).toBe(INTENT_ID);
    expect((await res.json()).clientOrderId).toBe(INTENT_ID);
    expect(actions()).toEqual([AuditAction.ORDER_PLACED]);
  });

  it("mints a UUID when the caller sends none", async () => {
    await POST(orderRequest({}));
    expect(state.placed[0]?.clientOrderId).toMatch(UUID_RE);
  });

  it("rejects a clientOrderId that is not a UUID without contacting the broker", async () => {
    const res = await POST(orderRequest({ clientOrderId: "retry-1" }));
    expect(res.status).toBe(400);
    expect(state.placed).toHaveLength(0);
  });
});

describe("POST /api/broker/orders: ambiguous outcome", () => {
  it("timeout, lookup finds the order: success and ORDER_PLACED", async () => {
    state.placeImpl = async () => { throw timeoutError(); };
    state.lookupImpl = async () => order("ord-live");

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order.id).toBe("ord-live");
    expect(body.deduplicated).toBe(false);
    expect(state.lookups).toEqual([INTENT_ID]);
    expect(actions()).toEqual([AuditAction.ORDER_PLACED]);
    expect(state.audits[0]).toMatchObject({
      resourceId: "ord-live",
      metadata: { clientOrderId: INTENT_ID, resolvedAfter: "unknown" },
    });
  });

  it("timeout, lookup finds nothing: ORDER_STATUS_UNKNOWN and ORDER_UNCONFIRMED, never ORDER_REJECTED", async () => {
    state.placeImpl = async () => { throw timeoutError(); };
    state.lookupImpl = async () => null;

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.code).toBe("ORDER_STATUS_UNKNOWN");
    expect(body.retryable).toBe(false);
    expect(body.clientOrderId).toBe(INTENT_ID);
    expect(body.error).toMatch(/check your open orders/i);
    expect(actions()).toEqual([AuditAction.ORDER_UNCONFIRMED]);
    expect(actions()).not.toContain(AuditAction.ORDER_REJECTED);
    expect(state.audits[0]).toMatchObject({ resourceId: INTENT_ID, metadata: { outcome: "unknown" } });
  });

  it("a failing lookup also leaves the outcome unknown", async () => {
    state.placeImpl = async () => { throw timeoutError(); };
    state.lookupImpl = async () => { throw new BrokerError("Alpaca order by client id 500", 502, "Failed to fetch order"); };

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(202);
    expect((await res.json()).code).toBe("ORDER_STATUS_UNKNOWN");
    expect(actions()).toEqual([AuditAction.ORDER_UNCONFIRMED]);
  });

  it("a dropped connection (502 fetch failed) is looked up the same way", async () => {
    state.placeImpl = async () => {
      throw new BrokerError("Fetch failed: socket hang up", 502, "Failed to connect to broker", true, null, "unknown");
    };
    state.lookupImpl = async () => order("ord-live");

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(201);
    expect(actions()).toEqual([AuditAction.ORDER_PLACED]);
  });

  it("a resubmit refused as a duplicate answers with the original order", async () => {
    state.placeImpl = async () => {
      throw new BrokerError(
        "Alpaca order 422: client_order_id must be unique", 400,
        "Duplicate order — this trade was already submitted", false, null, "duplicate"
      );
    };
    state.lookupImpl = async () => order("ord-first");

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order.id).toBe("ord-first");
    expect(body.deduplicated).toBe(true);
    expect(actions()).toEqual([AuditAction.ORDER_PLACED]);
  });

  it("a definite refusal is still ORDER_REJECTED, carries the intent id, and is not looked up", async () => {
    state.placeImpl = async () => {
      throw new BrokerError("Alpaca order 403: insufficient buying power", 400, "Insufficient buying power for this order");
    };

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(400);
    expect(state.lookups).toHaveLength(0);
    expect(actions()).toEqual([AuditAction.ORDER_REJECTED]);
    expect((state.audits[0].metadata as Record<string, unknown>).clientOrderId).toBe(INTENT_ID);
  });

  for (const status of ["rejected", "canceled", "expired"]) {
    it(`timeout, lookup finds the order ${status} with nothing filled: a refusal, not a placement`, async () => {
      state.placeImpl = async () => { throw timeoutError(); };
      state.lookupImpl = async () => ({ ...order("ord-dead"), status });

      const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("ORDER_NOT_WORKING");
      expect(body.retryable).toBe(false);
      expect(actions()).toEqual([AuditAction.ORDER_REJECTED]);
      expect(state.audits[0].metadata).toMatchObject({
        clientOrderId: INTENT_ID, brokerStatus: status, reason: "found_not_working",
      });
    });
  }

  it("a found order canceled after a partial fill did trade, so it is placed", async () => {
    state.placeImpl = async () => { throw timeoutError(); };
    state.lookupImpl = async () => ({ ...order("ord-part"), status: "canceled", filledQty: 40 });

    const res = await POST(orderRequest({ clientOrderId: INTENT_ID }));
    expect(res.status).toBe(201);
    expect(actions()).toEqual([AuditAction.ORDER_PLACED]);
  });
});

describe("POST /api/broker/orders: per-user rate limit", () => {
  it("refuses the 11th order in a minute with 429 and Retry-After, before the broker", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(orderRequest({}))).status).toBe(201);
    }
    const res = await POST(orderRequest({}));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryable).toBe(true);
    expect(state.placed).toHaveLength(10);
  });
});
