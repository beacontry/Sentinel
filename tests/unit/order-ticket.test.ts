/**
 * The order ticket's pure rules (src/lib/order-ticket.ts): the estimate,
 * validation, the request body, and the position an order would leave.
 * The body and the validation messages are the order path, so they are
 * pinned here exactly.
 */

import { describe, it, expect } from "vitest";
import {
  INITIAL_TICKET,
  blockedReason,
  bracketOffered,
  describePosition,
  estimateBasis,
  estimateOrderValue,
  heldQtyFrom,
  notionalConflict,
  orderRequestBody,
  quoteAge,
  resetSizing,
  resultingPosition,
  submitLabel,
  validateTicket,
  type TicketFields,
} from "@/lib/order-ticket";

const t = (patch: Partial<TicketFields>): TicketFields => ({ ...INITIAL_TICKET, ...patch });
const free = { blocked: false, unknown: false };

describe("estimateOrderValue", () => {
  it("prices a market share order at the quote", () => {
    expect(estimateOrderValue(t({ qty: "10" }), 228.4)).toBeCloseTo(2284);
  });

  it("prices a limit order at the limit, not the quote", () => {
    expect(estimateOrderValue(t({ qty: "10", orderType: "limit", limitPrice: "200" }), 228.4)).toBe(2000);
  });

  it("is unknown without a price, never $0", () => {
    expect(estimateOrderValue(t({ qty: "10" }), null)).toBeNull();
    expect(estimateOrderValue(t({ qty: "10", orderType: "limit", limitPrice: "" }), 228.4)).toBeNull();
  });

  it("is the amount itself for a dollar order", () => {
    expect(estimateOrderValue(t({ sizingMode: "dollars", notional: "500" }), 228.4)).toBe(500);
  });
});

describe("validateTicket", () => {
  it("puts the engine first", () => {
    expect(validateTicket(t({ qty: "1" }), { blocked: true, unknown: false })).toBe(
      "Stop the engine before placing manual orders.",
    );
    expect(validateTicket(t({ qty: "1" }), { blocked: false, unknown: true })).toBe(
      "Engine status unknown. Retry before placing an order.",
    );
  });

  it("wants a size", () => {
    expect(validateTicket(t({}), free)).toBe("Enter a share quantity greater than 0.");
    expect(validateTicket(t({ sizingMode: "dollars" }), free)).toBe("Enter a dollar amount greater than 0.");
  });

  it("refuses a dollar order that is not market with day or ioc", () => {
    const f = t({ sizingMode: "dollars", notional: "100", tif: "gtc" });
    expect(notionalConflict(f)).toBe(true);
    expect(validateTicket(f, free)).toBe("Dollar-based orders must be market type with day or ioc TIF.");
    expect(notionalConflict(t({ sizingMode: "dollars", tif: "ioc" }))).toBe(false);
  });

  it("wants the prices its type needs", () => {
    expect(validateTicket(t({ qty: "1", orderType: "limit" }), free)).toBe("Limit price required.");
    expect(validateTicket(t({ qty: "1", orderType: "stop" }), free)).toBe("Stop price required.");
    expect(validateTicket(t({ qty: "1", orderType: "stop_limit", limitPrice: "5" }), free)).toBe("Stop price required.");
  });

  it("wants a leg on a bracket, and only on a buy", () => {
    expect(validateTicket(t({ qty: "1", useBracket: true }), free)).toBe(
      "Bracket needs at least a take-profit or stop-loss.",
    );
    expect(validateTicket(t({ qty: "1", useBracket: true, side: "sell" }), free)).toBe(
      "Bracket orders are for entries (buy side) only.",
    );
    expect(validateTicket(t({ qty: "1", useBracket: true, stopLossPrice: "90" }), free)).toBeNull();
  });
});

describe("orderRequestBody", () => {
  it("sends a share market order", () => {
    expect(orderRequestBody("AAPL", t({ qty: "3" }))).toEqual({
      symbol: "AAPL",
      side: "buy",
      type: "market",
      timeInForce: "day",
      qty: "3",
    });
  });

  it("sends a notional in place of a quantity", () => {
    const body = orderRequestBody("AAPL", t({ sizingMode: "dollars", notional: "100", qty: "9" }));
    expect(body.notional).toBe("100");
    expect(body.qty).toBeUndefined();
  });

  it("sends both prices for a stop-limit and the legs of a bracket", () => {
    expect(
      orderRequestBody(
        "MSFT",
        t({ qty: "1", orderType: "stop_limit", limitPrice: "10", stopPrice: "9", useBracket: true, takeProfitPrice: "12" }),
      ),
    ).toEqual({
      symbol: "MSFT",
      side: "buy",
      type: "stop_limit",
      timeInForce: "day",
      qty: "1",
      limitPrice: "10",
      stopPrice: "9",
      orderClass: "bracket",
      takeProfitPrice: "12",
    });
  });
});

describe("resetSizing", () => {
  it("clears sizes and prices and keeps side, type and TIF", () => {
    const f = t({ side: "sell", orderType: "limit", tif: "gtc", qty: "5", limitPrice: "1", useBracket: true });
    expect(resetSizing(f)).toEqual({ ...INITIAL_TICKET, side: "sell", orderType: "limit", tif: "gtc" });
  });
});

describe("bracketOffered", () => {
  it("is a share-count buy only", () => {
    expect(bracketOffered(t({}))).toBe(true);
    expect(bracketOffered(t({ side: "sell" }))).toBe(false);
    expect(bracketOffered(t({ sizingMode: "dollars" }))).toBe(false);
  });
});

describe("heldQtyFrom", () => {
  const body = (positions: unknown[], positionsAvailable = true) => ({ positionsAvailable, positions });

  it("reads the holding, signed for a short", () => {
    expect(heldQtyFrom(body([{ symbol: "AAPL", qty: 12, side: "long" }]), "aapl")).toBe(12);
    expect(heldQtyFrom(body([{ symbol: "AAPL", qty: 4, side: "short" }]), "AAPL")).toBe(-4);
  });

  it("is zero when the positions were read and none is held", () => {
    expect(heldQtyFrom(body([{ symbol: "MSFT", qty: 1, side: "long" }]), "AAPL")).toBe(0);
  });

  it("is unknown, not zero, when the positions were not read", () => {
    expect(heldQtyFrom(body([], false), "AAPL")).toBeNull();
    expect(heldQtyFrom({ positions: [] }, "AAPL")).toBeNull();
    expect(heldQtyFrom(null, "AAPL")).toBeNull();
  });
});

describe("resultingPosition", () => {
  it("adds a buy and subtracts a sell", () => {
    expect(resultingPosition(12, t({ qty: "10" }), 100)).toEqual({ qty: 22, approximate: false });
    expect(resultingPosition(12, t({ qty: "12", side: "sell" }), 100)).toEqual({ qty: 0, approximate: false });
  });

  it("estimates a dollar order's shares at the price", () => {
    expect(resultingPosition(0, t({ sizingMode: "dollars", notional: "500" }), 250)).toEqual({ qty: 2, approximate: true });
  });

  it("is unknown when the holding is, or there is no size or price", () => {
    expect(resultingPosition(null, t({ qty: "1" }), 100)).toBeNull();
    expect(resultingPosition(0, t({}), 100)).toBeNull();
    expect(resultingPosition(0, t({ sizingMode: "dollars", notional: "500" }), null)).toBeNull();
  });
});

describe("describePosition", () => {
  it("says long, short and none in words", () => {
    expect(describePosition(22)).toBe("22 shares");
    expect(describePosition(1)).toBe("1 share");
    expect(describePosition(-4)).toBe("4 shares short");
    expect(describePosition(0)).toBe("None");
    expect(describePosition(1234.5)).toBe("1,234.5 shares");
    expect(describePosition(2.0004, true)).toBe("≈ 2 shares");
  });
});

describe("submitLabel and blockedReason", () => {
  it("names the account and the side", () => {
    expect(submitLabel("buy", "paper")).toBe("Place paper buy");
    expect(submitLabel("sell", "live")).toBe("Place LIVE sell");
    expect(submitLabel("buy", "unknown")).toBe("Place buy");
  });

  it("says why Place is off, engine first", () => {
    expect(blockedReason("running", "unknown")).toBe("Engine is running, stop it first on the Trader page.");
    expect(blockedReason("unknown", "paper")).toBe("Engine status unknown. Retry below.");
    expect(blockedReason("stopped", "unknown")).toBe("Could not read which account is active. Retry above.");
    expect(blockedReason("stopped", "none")).toBe("No active broker connection.");
    expect(blockedReason("stopped", "live")).toBeUndefined();
    expect(blockedReason("loading", "loading")).toBeUndefined();
  });
});

describe("quoteAge", () => {
  it("rounds to the unit a trader reads", () => {
    expect(quoteAge(0, 12_000)).toBe("just now");
    expect(quoteAge(0, 180_000)).toBe("3m ago");
    expect(quoteAge(0, 2 * 3_600_000)).toBe("2h ago");
  });
});

describe("estimateBasis", () => {
  it("says what the estimate is taken on", () => {
    expect(estimateBasis(t({ qty: "25" }), 228.4)).toBe("25 shares at the last price, $228.40");
    expect(estimateBasis(t({ qty: "2", orderType: "limit", limitPrice: "200" }), 228.4)).toBe(
      "2 shares at your limit, $200.00",
    );
    expect(estimateBasis(t({ sizingMode: "dollars", notional: "500" }), 250)).toBe("≈ 2 shares at the last price, $250.00");
  });

  it("is absent with no size or no price", () => {
    expect(estimateBasis(t({}), 228.4)).toBeNull();
    expect(estimateBasis(t({ qty: "1" }), null)).toBeNull();
  });
});
