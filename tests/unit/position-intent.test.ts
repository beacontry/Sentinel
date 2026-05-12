/**
 * Phase 8 — broker-side naked-position prevention.
 *
 * Verifies that the AlpacaClient serializes the `positionIntent` field to
 * Alpaca's `position_intent` payload key. Mocks fetch to inspect the request
 * body without hitting Alpaca.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_FETCH = globalThis.fetch;

describe("AlpacaClient.placeOrder — positionIntent serialization (Phase 8)", () => {
  let capturedBody: Record<string, unknown> | null = null;

  beforeEach(() => {
    capturedBody = null;
    globalThis.fetch = (vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          id: "order-1",
          symbol: "AAPL",
          side: "buy",
          type: "limit",
          status: "accepted",
          qty: "10",
          filled_qty: "0",
          time_in_force: "day",
          submitted_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("includes position_intent='buy_to_open' on engine buy orders", async () => {
    const { createBrokerClient } = await import("@/lib/brokers");
    const client = createBrokerClient("alpaca", "key", "secret", "paper");
    await client.placeOrder({
      symbol: "AAPL",
      side: "buy",
      qty: "10",
      type: "limit",
      timeInForce: "day",
      limitPrice: "150.00",
      positionIntent: "buy_to_open",
    });
    expect(capturedBody?.position_intent).toBe("buy_to_open");
    expect(capturedBody?.side).toBe("buy");
  });

  it("includes position_intent='sell_to_close' on engine sell orders", async () => {
    const { createBrokerClient } = await import("@/lib/brokers");
    const client = createBrokerClient("alpaca", "key", "secret", "paper");
    await client.placeOrder({
      symbol: "AAPL",
      side: "sell",
      qty: "10",
      type: "market",
      timeInForce: "day",
      positionIntent: "sell_to_close",
    });
    expect(capturedBody?.position_intent).toBe("sell_to_close");
    expect(capturedBody?.side).toBe("sell");
  });

  it("omits position_intent when not specified (backward compatibility)", async () => {
    const { createBrokerClient } = await import("@/lib/brokers");
    const client = createBrokerClient("alpaca", "key", "secret", "paper");
    await client.placeOrder({
      symbol: "AAPL",
      side: "buy",
      qty: "10",
      type: "market",
      timeInForce: "day",
    });
    expect(capturedBody).not.toHaveProperty("position_intent");
  });

  it("works alongside bracket order class", async () => {
    const { createBrokerClient } = await import("@/lib/brokers");
    const client = createBrokerClient("alpaca", "key", "secret", "paper");
    await client.placeOrder({
      symbol: "AAPL",
      side: "buy",
      qty: "10",
      type: "limit",
      timeInForce: "day",
      limitPrice: "150.00",
      orderClass: "bracket",
      takeProfitPrice: "165.00",
      stopLossPrice: "142.00",
      positionIntent: "buy_to_open",
    });
    expect(capturedBody?.position_intent).toBe("buy_to_open");
    expect(capturedBody?.order_class).toBe("bracket");
  });
});
