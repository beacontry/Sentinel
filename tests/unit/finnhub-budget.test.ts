/**
 * Finnhub budget handling (2026-11-01).
 *
 * - 429: pause every queued request until the window Finnhub names in its
 *   headers resets, instead of each caller spending a token on a certain 429.
 * - remaining=0 on a 200: same pause, proactively.
 * - 401: open a circuit for FINNHUB_AUTH_BREAKER_MS; requests fail fast and
 *   the layers return null without logging per symbol.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/api-usage", () => ({ recordApiUsage: vi.fn(async () => {}) }));

type Finnhub = typeof import("@/lib/finnhub");
let mod: Finnhub;
const fetchMock = vi.fn();

function response(status: number, headers: Record<string, string> = {}, body: unknown = []) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : status === 429 ? "Too Many Requests" : "Unauthorized",
    headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T14:30:00Z"));
  vi.stubEnv("FINNHUB_API_KEY", "test-key-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.resetModules();
  // The singleton lives on globalThis; a fresh module must get a fresh client.
  delete (globalThis as { __finnhubClient?: unknown }).__finnhubClient;
  mod = await import("@/lib/finnhub");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("throttlePauseMs", () => {
  it("prefers retry-after seconds", () => {
    const h = new Headers({ "retry-after": "7", "x-ratelimit-reset": "9999999999" });
    expect(mod.throttlePauseMs(h, Date.now())).toBe(7_000);
  });

  it("falls back to x-ratelimit-reset (epoch seconds)", () => {
    const now = Date.now();
    const h = new Headers({ "x-ratelimit-reset": String(Math.floor(now / 1000) + 30) });
    const ms = mod.throttlePauseMs(h, now);
    expect(ms).toBeGreaterThanOrEqual(29_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it("defaults to the 60 s window with no headers, and clamps both ends", () => {
    expect(mod.throttlePauseMs(new Headers(), Date.now())).toBe(60_000);
    const past = new Headers({ "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) - 100) });
    expect(mod.throttlePauseMs(past, Date.now())).toBe(mod.FINNHUB_THROTTLE_PAUSE_MIN_MS);
    const far = new Headers({ "retry-after": "3600" });
    expect(mod.throttlePauseMs(far, Date.now())).toBe(mod.FINNHUB_THROTTLE_PAUSE_MAX_MS);
  });
});

describe("FinnhubClient throttling", () => {
  it("a 429 pauses the next request until the reset header", async () => {
    const client = mod.getFinnhubClient();
    const resetSec = Math.floor(Date.now() / 1000) + 30;
    fetchMock
      .mockResolvedValueOnce(response(429, { "x-ratelimit-reset": String(resetSec), "x-ratelimit-remaining": "0" }, { error: "limit" }))
      .mockResolvedValueOnce(response(200, { "x-ratelimit-remaining": "59" }, []));

    await expect(client.getCompanyNews("AAPL", 3)).rejects.toThrow("Finnhub API error: 429");
    expect(client.throttledUntil).toBeGreaterThan(Date.now());

    const second = client.getCompanyNews("MSFT", 3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still paused
    await vi.advanceTimersByTimeAsync(11_000);
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remaining=0 on a successful response pauses proactively", async () => {
    const client = mod.getFinnhubClient();
    const resetSec = Math.floor(Date.now() / 1000) + 10;
    fetchMock
      .mockResolvedValueOnce(response(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetSec) }, []))
      .mockResolvedValueOnce(response(200, { "x-ratelimit-remaining": "59" }, []));

    await client.getCompanyNews("AAPL", 3);
    const second = client.getCompanyNews("MSFT", 3);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    await second;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a pause only ever extends; a shorter later header does not cut it", async () => {
    const client = mod.getFinnhubClient();
    const now = Date.now();
    fetchMock
      .mockResolvedValueOnce(response(429, { "retry-after": "40" }, {}))
      .mockResolvedValueOnce(response(429, { "retry-after": "5" }, {}));
    await expect(client.getCompanyNews("A", 3)).rejects.toThrow();
    const until = client.throttledUntil;
    expect(until).toBe(now + 40_000);
    // Second caller waits the 40 s, then gets its own 429 with a shorter header.
    // Attach the rejection handler before advancing the clock, or the throw
    // lands as an unhandled rejection inside the timer flush.
    const p = expect(client.getCompanyNews("B", 3)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(40_000);
    await p;
    expect(client.throttledUntil).toBeGreaterThanOrEqual(until);
  });
});

describe("FinnhubClient auth breaker", () => {
  it("a 401 opens the circuit; requests fail fast without fetching until it closes", async () => {
    const client = mod.getFinnhubClient();
    fetchMock
      .mockResolvedValueOnce(response(401, {}, { error: "Invalid API key." }))
      .mockResolvedValueOnce(response(200, { "x-ratelimit-remaining": "59" }, []));

    await expect(client.getCompanyNews("AAPL", 3)).rejects.toThrow("Finnhub API error: 401");
    expect(client.isAvailable).toBe(false);

    await expect(client.getCompanyNews("MSFT", 3)).rejects.toThrow(/circuit open/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(mod.FINNHUB_AUTH_BREAKER_MS);
    expect(client.isAvailable).toBe(true);
    await client.getCompanyNews("MSFT", 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 403 does not open the circuit (plan-scoped per endpoint, not key-scoped)", async () => {
    const client = mod.getFinnhubClient();
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 403, statusText: "Forbidden", headers: { "content-type": "application/json" } })
    );
    await expect(client.getCompanyNews("AAPL", 3)).rejects.toThrow("Finnhub API error: 403");
    expect(client.isAvailable).toBe(true);
  });

  it("the sentiment and analyst layers return null while the breaker is open, without calling Finnhub", async () => {
    const client = mod.getFinnhubClient();
    fetchMock.mockResolvedValueOnce(response(401, {}, { error: "Invalid API key." }));
    await expect(client.getCompanyNews("AAPL", 3)).rejects.toThrow();

    const { applySentimentLayer } = await import("@/lib/hybrid/sentiment-layer");
    const { applyAnalystLayer } = await import("@/lib/hybrid/analyst-layer");
    expect(await applySentimentLayer("MSFT", "BUY" as never)).toBeNull();
    expect(await applyAnalystLayer("MSFT", "BUY" as never)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
