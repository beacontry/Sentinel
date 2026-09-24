// Manual order ticket: one client_order_id per order intent.
//
// The ticket sends a client_order_id with every submit and reuses it on a
// resubmit of the same order, so a resubmit after a lost response is refused
// by the broker as a duplicate instead of becoming a second order. Pure and
// browser-safe (no Node imports) so the reuse rules can be unit tested.

export interface OrderIntent {
  /** The order body the id was minted for, serialized. */
  key: string;
  clientOrderId: string;
}

type RandomSource = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

/**
 * A v4 UUID for a client_order_id. crypto.randomUUID exists only in a secure
 * context (HTTPS or localhost); over plain HTTP on a LAN address it is
 * missing, so fall back to crypto.getRandomValues, which is not restricted.
 * Throws only when neither exists, and the caller must then not send.
 */
export function newClientOrderId(source: RandomSource | undefined = globalThis.crypto): string {
  if (source && typeof source.randomUUID === "function") {
    return source.randomUUID();
  }
  if (!source || typeof source.getRandomValues !== "function") {
    throw new Error("No secure random source for a client order id");
  }
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The intent for this submit: the current one when the order is unchanged
 * (a resubmit), else a new one with a fresh id.
 */
export function orderIntentFor(
  current: OrderIntent | null,
  body: Record<string, unknown>,
  mint: () => string = newClientOrderId
): OrderIntent {
  const key = JSON.stringify(body);
  return current?.key === key ? current : { key, clientOrderId: mint() };
}

/**
 * The intent to keep after the route answered. A success retires it, so the
 * next order gets a new id. An unknown outcome keeps it: the order may be
 * live, and a resubmit must be refused as a duplicate rather than double it.
 * A definite refusal keeps it too; the broker created no order under it, so
 * reusing it on a corrected resubmit of the same order is harmless.
 */
export function orderIntentAfterResponse(
  current: OrderIntent | null,
  response: { ok: boolean; code?: unknown }
): OrderIntent | null {
  if (response.code === "ORDER_STATUS_UNKNOWN") return current;
  if (response.ok) return null;
  return current;
}
