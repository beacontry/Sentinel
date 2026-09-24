/**
 * The manual ticket's client_order_id per order intent (WP04 follow-up).
 *
 *   - one id is reused across resubmits of the same order and replaced when
 *     the order changes;
 *   - a success retires it, an unknown outcome and a refusal keep it;
 *   - the id is minted without crypto.randomUUID, which a non-secure context
 *     (plain HTTP on a LAN address) does not have.
 */

import { describe, it, expect } from "vitest";
import { webcrypto } from "crypto";
import { newClientOrderId, orderIntentFor, orderIntentAfterResponse } from "@/lib/order-intent";
import { placeBrokerOrderSchema } from "@/lib/validators";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let seq = 0;
const mint = () => `id-${++seq}`;
const order = {
  symbol: "AAPL",
  side: "buy",
  type: "market",
  timeInForce: "day",
  qty: "10",
  expectedConnectionId: "5d0c7a3e-2b4f-4c1d-9e8a-7f6b5a4c3d2e",
};

describe("orderIntentFor", () => {
  it("reuses the id on a resubmit of the same order", () => {
    const first = orderIntentFor(null, order, mint);
    const again = orderIntentFor(first, { ...order }, mint);
    expect(again.clientOrderId).toBe(first.clientOrderId);
  });

  it("mints a new id when the order changes", () => {
    const first = orderIntentFor(null, order, mint);
    const changed = orderIntentFor(first, { ...order, qty: "11" }, mint);
    expect(changed.clientOrderId).not.toBe(first.clientOrderId);
  });
});

describe("orderIntentAfterResponse", () => {
  const intent = { key: "k", clientOrderId: "cid" };

  it("retires the id after a success, so the next order is a new one", () => {
    expect(orderIntentAfterResponse(intent, { ok: true })).toBeNull();
  });

  it("keeps the id when the outcome is unknown (a 202, so res.ok is true)", () => {
    expect(orderIntentAfterResponse(intent, { ok: true, code: "ORDER_STATUS_UNKNOWN" })).toBe(intent);
  });

  it("keeps the id after a definite refusal", () => {
    expect(orderIntentAfterResponse(intent, { ok: false })).toBe(intent);
  });

  it("retires the id when the broker holds a dead order under it", () => {
    expect(orderIntentAfterResponse(intent, { ok: false, code: "ORDER_NOT_WORKING" })).toBeNull();
  });

  it("an unknown outcome followed by a resubmit of the same order sends the same id", () => {
    const first = orderIntentFor(null, order, mint);
    const kept = orderIntentAfterResponse(first, { ok: true, code: "ORDER_STATUS_UNKNOWN" });
    expect(orderIntentFor(kept, { ...order }, mint).clientOrderId).toBe(first.clientOrderId);
  });
});

describe("newClientOrderId", () => {
  it("uses randomUUID when it exists", () => {
    expect(newClientOrderId({ randomUUID: () => "from-randomUUID" })).toBe("from-randomUUID");
  });

  it("falls back to getRandomValues without a secure context, and the route accepts the result", () => {
    const insecure = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) as never };
    const ids = new Set(Array.from({ length: 50 }, () => newClientOrderId(insecure)));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
      const parsed = placeBrokerOrderSchema.safeParse({ ...order, clientOrderId: id });
      expect(parsed.success).toBe(true);
    }
  });

  it("throws rather than invent an id when there is no random source", () => {
    expect(() => newClientOrderId({})).toThrow(/random source/);
  });
});
