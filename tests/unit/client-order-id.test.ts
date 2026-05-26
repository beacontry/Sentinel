/**
 * Tests for the client_order_id idempotency added to Alpaca placeOrder.
 *
 * Context: without an idempotency key, a network hiccup that loses the
 * Alpaca response triggers a retry (at any layer — TCP, HTTP client,
 * caller's retry logic). Alpaca will happily accept the second request
 * as a separate order, producing duplicate fills. With client_order_id,
 * Alpaca rejects the second request as a duplicate (422 "client_order_id
 * must be unique"). The caller still got the original order placed.
 *
 * The Alpaca client adds the field via `randomUUID()` when callers don't
 * provide one — so every placement gets idempotency by default. Callers
 * CAN provide their own for deterministic-retry-of-the-same-intent flows
 * (not yet used; this PR adds the mechanism, not the policy).
 *
 * We intercept the broker HTTP call by mocking global fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AlpacaClient } from "@/lib/brokers";

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureRequestBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = fetchMock.mock.calls[0];
  const init = call[1] as RequestInit;
  const body = init.body as string;
  return JSON.parse(body) as Record<string, unknown>;
}

describe("Alpaca placeOrder — client_order_id idempotency", () => {
  it("auto-generates a UUID v4 client_order_id when caller doesn't provide one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "broker-id-1",
        symbol: "AAPL",
        side: "buy",
        qty: "10",
        filled_qty: "0",
        type: "market",
        status: "new",
        time_in_force: "day",
        submitted_at: new Date().toISOString(),
      })
    );

    const client = new AlpacaClient("KEY", "SECRET", "paper");
    await client.placeOrder({
      symbol: "AAPL",
      side: "buy",
      qty: "10",
      type: "market",
      timeInForce: "day",
    });

    const body = captureRequestBody();
    expect(body.client_order_id).toBeTypeOf("string");
    // UUID v4: 8-4-4-4-12 hex digits with version 4 marker
    expect(body.client_order_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("passes through a caller-provided clientOrderId verbatim (deterministic-retry use case)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "broker-id-2",
        symbol: "MSFT",
        side: "sell",
        qty: "5",
        filled_qty: "0",
        type: "limit",
        status: "new",
        time_in_force: "gtc",
        submitted_at: new Date().toISOString(),
      })
    );

    const client = new AlpacaClient("KEY", "SECRET", "paper");
    await client.placeOrder({
      symbol: "MSFT",
      side: "sell",
      qty: "5",
      type: "limit",
      timeInForce: "gtc",
      limitPrice: "350.00",
      clientOrderId: "engine-msft-sell-1234567890",
    });

    const body = captureRequestBody();
    expect(body.client_order_id).toBe("engine-msft-sell-1234567890");
  });

  it("generates a DIFFERENT client_order_id on each call (no accidental collisions)", async () => {
    // mockResolvedValue with a single Response reuses the body stream —
    // res.json() succeeds the first call then throws on the second. Use
    // an implementation that builds a fresh Response per call.
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        id: "x", symbol: "X", side: "buy", qty: "1", filled_qty: "0",
        type: "market", status: "new", time_in_force: "day",
        submitted_at: new Date().toISOString(),
      })
    );

    const client = new AlpacaClient("KEY", "SECRET", "paper");
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      await client.placeOrder({
        symbol: "X",
        side: "buy",
        qty: "1",
        type: "market",
        timeInForce: "day",
      });
    }
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      ids.add(body.client_order_id);
    }
    expect(ids.size).toBe(20);
  });

  it("preserves all other PlaceOrderParams fields alongside client_order_id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "x", symbol: "NVDA", side: "buy", qty: "3", filled_qty: "0",
        type: "limit", status: "new", time_in_force: "day",
        submitted_at: new Date().toISOString(),
      })
    );

    const client = new AlpacaClient("KEY", "SECRET", "paper");
    await client.placeOrder({
      symbol: "NVDA",
      side: "buy",
      qty: "3",
      type: "limit",
      timeInForce: "day",
      limitPrice: "500.50",
      positionIntent: "buy_to_open",
    });

    const body = captureRequestBody();
    expect(body.symbol).toBe("NVDA");
    expect(body.side).toBe("buy");
    expect(body.qty).toBe("3");
    expect(body.type).toBe("limit");
    expect(body.time_in_force).toBe("day");
    expect(body.limit_price).toBe("500.50");
    expect(body.position_intent).toBe("buy_to_open");
    expect(body.client_order_id).toBeTypeOf("string");
  });

  it("includes client_order_id in the error log payload (grep-able for duplicate-on-retry incidents)", async () => {
    // Simulate Alpaca rejecting a duplicate. We can't directly assert the
    // log line content without coupling to the logger implementation, but
    // we CAN verify that the rejected request still included client_order_id
    // in its outbound payload — that's what gets logged.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "client_order_id must be unique" }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      )
    );

    const client = new AlpacaClient("KEY", "SECRET", "paper");
    await expect(
      client.placeOrder({
        symbol: "AAPL",
        side: "buy",
        qty: "10",
        type: "market",
        timeInForce: "day",
        clientOrderId: "intentional-duplicate-key",
      })
    ).rejects.toThrow(/client_order_id must be unique/);

    const body = captureRequestBody();
    expect(body.client_order_id).toBe("intentional-duplicate-key");
  });
});
