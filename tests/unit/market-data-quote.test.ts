/**
 * WP07 (findings #49, #11): a missing price is no quote, never a $0 quote.
 *
 * YahooProvider.fetchQuote used to return `{ price: regularMarketPrice ?? 0 }`
 * when Yahoo sent a chart meta without regularMarketPrice. That non-null $0
 * quote stopped FallbackProvider from trying Finnhub, and every consumer that
 * read `quote?.price ?? x` took 0 as a real price (a $0 paper BUY, a -100%
 * accuracy score, a fabricated full loss to harvest).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type FetchCall = string;

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

function yahooMeta(meta: Record<string, unknown>) {
  return { chart: { result: [{ meta }] } };
}

let calls: FetchCall[] = [];

function installFetch(yahooBody: unknown, finnhubBody: unknown) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("finance.yahoo.com")) return jsonResponse(yahooBody);
      if (url.includes("finnhub.io")) return jsonResponse(finnhubBody);
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

async function loadProvider(finnhubKey: string) {
  vi.resetModules();
  vi.stubEnv("FINNHUB_API_KEY", finnhubKey);
  const mod = await import("@/lib/market-data");
  return mod.getMarketDataProvider();
}

const finnhubCalled = () => calls.some((u) => u.includes("finnhub.io"));

describe("quote validity (WP07)", () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("Yahoo only (no Finnhub key)", () => {
    it("returns null when the meta has no regularMarketPrice", async () => {
      installFetch(yahooMeta({ regularMarketVolume: 1000 }), null);
      const provider = await loadProvider("");
      expect(await provider.fetchQuote("AAPL")).toBeNull();
    });

    it("returns null for a price of 0", async () => {
      installFetch(yahooMeta({ regularMarketPrice: 0 }), null);
      const provider = await loadProvider("");
      expect(await provider.fetchQuote("AAPL")).toBeNull();
    });

    it("returns null for a non-numeric price", async () => {
      installFetch(yahooMeta({ regularMarketPrice: "n/a" }), null);
      const provider = await loadProvider("");
      expect(await provider.fetchQuote("AAPL")).toBeNull();
    });

    it("returns a positive price unchanged", async () => {
      installFetch(yahooMeta({ regularMarketPrice: 187.5, regularMarketVolume: 42 }), null);
      const provider = await loadProvider("");
      expect(await provider.fetchQuote("AAPL")).toEqual({ price: 187.5, volume: 42 });
    });
  });

  describe("Yahoo primary, Finnhub fallback", () => {
    it("falls back to Finnhub when Yahoo's meta has no regularMarketPrice", async () => {
      installFetch(yahooMeta({ regularMarketVolume: 1000 }), { c: 101.25, v: 7 });
      const provider = await loadProvider("test-key");
      const quote = await provider.fetchQuote("AAPL");
      expect(finnhubCalled()).toBe(true);
      expect(quote).toEqual({ price: 101.25, volume: 7 });
    });

    it("falls back to Finnhub when Yahoo's price is 0", async () => {
      installFetch(yahooMeta({ regularMarketPrice: 0 }), { c: 55, v: 1 });
      const provider = await loadProvider("test-key");
      const quote = await provider.fetchQuote("AAPL");
      expect(finnhubCalled()).toBe(true);
      expect(quote?.price).toBe(55);
    });

    it("does not call Finnhub when Yahoo has a real price", async () => {
      installFetch(yahooMeta({ regularMarketPrice: 20 }), { c: 55 });
      const provider = await loadProvider("test-key");
      expect((await provider.fetchQuote("AAPL"))?.price).toBe(20);
      expect(finnhubCalled()).toBe(false);
    });

    it("returns null when neither provider has a positive price", async () => {
      installFetch(yahooMeta({ regularMarketPrice: 0 }), { c: 0 });
      const provider = await loadProvider("test-key");
      expect(await provider.fetchQuote("AAPL")).toBeNull();
    });
  });
});
