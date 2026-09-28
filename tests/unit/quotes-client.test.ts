/**
 * fetchQuotes and GET /api/bars/[symbol] (WP11, finding #34).
 *
 * The ticket and watchlists now read prices from the read-only /api/quotes.
 * Every requested symbol gets an entry, and a failed read is an explicit null
 * so the card and the ticket say "Price unavailable" rather than showing a
 * loading state forever. Replay reads daily bars from /api/bars/[symbol],
 * which writes nothing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchQuotes, quoteFor, QUOTES_BATCH_MAX } from "@/lib/quotes-client";

const state = vi.hoisted(() => ({
  fetchBarsCalls: [] as Array<{ symbol: string; days: number; resolution: string }>,
  fail: false,
}));

vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));
vi.mock("@/lib/logger", () => ({
  createRouteLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));
vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({
    fetchBars: async (symbol: string, days: number, resolution: string) => {
      state.fetchBarsCalls.push({ symbol, days, resolution });
      if (state.fail) throw new Error("provider down");
      return [{ date: "2026-09-22T00:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];
    },
  }),
}));

import { GET as getBars } from "@/app/api/bars/[symbol]/route";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("quoteFor", () => {
  it("reads a quote and rejects unusable prices", () => {
    const body = { quotes: { AAPL: { price: 101.5, change: 1.2 }, ZERO: { price: 0, change: 0 }, BAD: { price: "x" } } };
    expect(quoteFor(body, "AAPL")).toEqual({ price: 101.5, change: 1.2 });
    expect(quoteFor(body, "ZERO")).toBeNull();
    expect(quoteFor(body, "BAD")).toBeNull();
    expect(quoteFor(body, "MISSING")).toBeNull();
    expect(quoteFor(null, "AAPL")).toBeNull();
    expect(quoteFor({ error: "Unauthorized" }, "AAPL")).toBeNull();
  });
});

describe("fetchQuotes", () => {
  it("returns a quote or an explicit null for every symbol", async () => {
    const f = vi.fn(async () => jsonResponse({ quotes: { AAPL: { price: 100, change: 2 } } }));
    const out = await fetchQuotes(["AAPL", "MSFT"], f as unknown as typeof fetch);
    expect(out).toEqual({ AAPL: { price: 100, change: 2 }, MSFT: null });
    expect(Object.prototype.hasOwnProperty.call(out, "MSFT")).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/quotes?symbols=AAPL,MSFT");
  });

  it("marks every symbol unavailable on a non-ok response or a network error", async () => {
    const notOk = vi.fn(async () => jsonResponse({ error: "boom" }, 500));
    expect(await fetchQuotes(["AAPL", "MSFT"], notOk as unknown as typeof fetch)).toEqual({ AAPL: null, MSFT: null });

    const thrown = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchQuotes(["AAPL"], thrown as unknown as typeof fetch)).toEqual({ AAPL: null });
  });

  it("batches past the route's per-request cap and keys by the symbols as given", async () => {
    const syms = Array.from({ length: QUOTES_BATCH_MAX + 5 }, (_, i) => `s${i}`);
    const f = vi.fn(async (url: string) => {
      const list = new URL(url, "http://x").searchParams.get("symbols")!.split(",");
      return jsonResponse({ quotes: Object.fromEntries(list.map((s) => [s, { price: 10, change: 0 }])) });
    });
    const out = await fetchQuotes(syms, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(2);
    expect(Object.keys(out)).toHaveLength(syms.length);
    expect(out.s0).toEqual({ price: 10, change: 0 });
  });
});

describe("GET /api/bars/[symbol]", () => {
  beforeEach(() => {
    state.fetchBarsCalls = [];
    state.fail = false;
    (globalThis as typeof globalThis & { __rateLimitStore?: Map<string, unknown> }).__rateLimitStore?.clear();
  });

  const get = (symbol: string, query = "") =>
    getBars(new Request(`http://localhost/api/bars/${symbol}${query}`), { params: Promise.resolve({ symbol }) });

  it("returns daily bars for the requested window", async () => {
    const res = await get("aapl", "?days=180");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.symbol).toBe("AAPL");
    expect(body.bars).toHaveLength(1);
    expect(state.fetchBarsCalls).toEqual([{ symbol: "AAPL", days: 180, resolution: "1d" }]);
  });

  it("rejects an invalid symbol and clamps an out-of-range window", async () => {
    expect((await get("A1!")).status).toBe(400);
    await get("AAPL", "?days=9999");
    expect(state.fetchBarsCalls[0].days).toBe(180);
  });

  it("answers a generic 500 when the provider fails", async () => {
    state.fail = true;
    const res = await get("AAPL");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load bars" });
  });

  it("answers 429 with Retry-After once the per-user limit is spent", async () => {
    let limited: Response | null = null;
    for (let i = 0; i < 100 && !limited; i++) {
      const res = await get("AAPL");
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    expect(Number(limited!.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});
