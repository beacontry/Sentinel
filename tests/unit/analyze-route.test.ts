/**
 * GET /api/analyze/[symbol] stores one signal per bar and is rate limited
 * (WP11, finding #2).
 *
 * The route is a GET that the preview sheet, the screener modal and the
 * analysis page call just to show a result, but every call inserted a signals
 * row and an accuracy placeholder and fired the caller's Discord webhooks and
 * the trader push. Repeat views of the same bar now insert nothing (unique
 * index on symbol, timeframe and bar_time, migration 0052, with ON CONFLICT
 * DO NOTHING), and the notifications fire only for the call whose row was
 * inserted. The response itself is unchanged.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { signalBarTime } from "@/lib/signal-bucket";
import type { Bar } from "@/types";

const state = vi.hoisted(() => ({
  signalRows: [] as Array<Record<string, unknown>>,
  accuracyRows: [] as Array<Record<string, unknown>>,
  discordSends: [] as string[],
  traderPushes: [] as string[],
  lastBarDate: "2026-09-23T14:30:00.000Z",
  signal: "STRONG_BUY",
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ userId: "user-1" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/logger", () => ({
  createRouteLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({
    fetchBars: async () => {
      const bars: Bar[] = [];
      for (let i = 0; i < 40; i++) {
        bars.push({ date: `2026-09-23T11:${String(i).padStart(2, "0")}:00.000Z`, open: 100, high: 101, low: 99, close: 100, volume: 1000 });
      }
      bars[bars.length - 1] = { ...bars[bars.length - 1], date: state.lastBarDate };
      return bars;
    },
  }),
}));

vi.mock("@/lib/hybrid", () => ({
  analyzeHybrid: async (symbol: string) => ({
    symbol,
    signal: state.signal,
    confidence: 0.9,
    price: 100,
    volume: 1000,
    indicators: {},
    plainEnglish: "test",
  }),
}));

vi.mock("@/lib/discord", () => ({
  signalStrengthValue: () => 5,
  sendDiscordWebhook: async (url: string) => {
    state.discordSends.push(url);
  },
}));

vi.mock("@/lib/trader-push", () => ({
  pushSignalToTrader: (symbol: string) => {
    state.traderPushes.push(symbol);
  },
}));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");

  // Postgres semantics for the partial unique index from migration 0052:
  // two rows with the same symbol, timeframe and non-null bar_time conflict.
  function conflicts(v: Record<string, unknown>): boolean {
    if (v.barTime == null) return false;
    return state.signalRows.some(
      (r) =>
        r.symbol === v.symbol &&
        r.timeframe === v.timeframe &&
        (r.barTime as Date).getTime() === (v.barTime as Date).getTime()
    );
  }

  function insertInto(table: unknown) {
    return {
      values: (v: Record<string, unknown>) => {
        const store = table === schema.signals ? state.signalRows : state.accuracyRows;
        const write = (onConflictDoNothing: boolean) => {
          if (table === schema.signals && conflicts(v)) {
            if (onConflictDoNothing) return [];
            throw new Error("duplicate key value violates unique constraint");
          }
          const row = { id: `id-${store.length + 1}`, ...v };
          store.push(row);
          return [{ id: row.id }];
        };
        return {
          returning: async () => write(false),
          onConflictDoNothing: () => ({
            returning: async () => write(true),
            then: (res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve().then(() => write(true)).then(res, rej),
          }),
        };
      },
    };
  }

  const db = {
    select: () => ({
      from: () => ({
        where: async () => [
          { webhookUrl: "https://discord.example/hook", enabled: true, minSignalStrength: 1, symbols: [] },
        ],
      }),
    }),
  };

  return {
    db,
    withTimeout: async (_ms: number, fn: (tx: unknown) => Promise<unknown>) => fn({ insert: insertInto }),
    isStatementTimeout: () => false,
  };
});

import { GET } from "@/app/api/analyze/[symbol]/route";

function get(symbol: string) {
  return GET(new Request(`http://localhost/api/analyze/${symbol}`), {
    params: Promise.resolve({ symbol }),
  });
}

// Discord and the trader push are fire-and-forget; let their promises settle.
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("GET /api/analyze/[symbol] writes once per bar (WP11 #2)", () => {
  beforeEach(() => {
    state.signalRows = [];
    state.accuracyRows = [];
    state.discordSends = [];
    state.traderPushes = [];
    state.lastBarDate = "2026-09-23T14:30:00.000Z";
    state.signal = "STRONG_BUY";
    (globalThis as typeof globalThis & { __rateLimitStore?: Map<string, unknown> }).__rateLimitStore?.clear();
  });

  it("stores one signal and one accuracy row for two views of the same bar, and notifies once", async () => {
    const first = await get("AAPL");
    const second = await get("AAPL");
    await settle();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.signalRows).toHaveLength(1);
    expect(state.accuracyRows).toHaveLength(1);
    expect(state.discordSends).toHaveLength(1);
    expect(state.traderPushes).toEqual(["AAPL"]);
  });

  it("keys the row on symbol, resolution and the last bar's timestamp", async () => {
    await get("AAPL");
    expect(state.signalRows[0]).toMatchObject({
      symbol: "AAPL",
      timeframe: "5m",
      barTime: new Date("2026-09-23T14:30:00.000Z"),
    });
  });

  it("returns the same analysis to the deduped caller", async () => {
    const a = await (await get("AAPL")).json();
    const b = await (await get("AAPL")).json();
    expect(b).toEqual(a);
    expect(b.signal).toBe("STRONG_BUY");
  });

  it("stores and notifies again once a new bar arrives", async () => {
    await get("AAPL");
    state.lastBarDate = "2026-09-23T14:35:00.000Z";
    await get("AAPL");
    await settle();

    expect(state.signalRows).toHaveLength(2);
    expect(state.accuracyRows).toHaveLength(2);
    expect(state.discordSends).toHaveLength(2);
    expect(state.traderPushes).toHaveLength(2);
  });

  it("inserts once when two views of the same bar run concurrently", async () => {
    const [a, b] = await Promise.all([get("MSFT"), get("MSFT")]);
    await settle();
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(state.signalRows).toHaveLength(1);
    expect(state.discordSends).toHaveLength(1);
    expect(state.traderPushes).toHaveLength(1);
  });

  it("answers 429 with Retry-After once the per-user limit is spent", async () => {
    let limited: Response | null = null;
    for (let i = 0; i < 200 && !limited; i++) {
      const res = await get("AAPL");
      if (res.status === 429) limited = res;
    }
    expect(limited).not.toBeNull();
    const retryAfter = Number(limited!.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});

describe("signalBarTime", () => {
  const bar = (date: string): Bar => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 });

  it("uses the last bar's timestamp", () => {
    expect(signalBarTime([bar("2026-09-22T20:00:00Z"), bar("2026-09-23T14:30:00Z")], "5m")).toEqual(
      new Date("2026-09-23T14:30:00Z")
    );
  });

  it("falls back to now floored to the resolution when the date does not parse", () => {
    const now = new Date("2026-09-23T14:33:17Z");
    expect(signalBarTime([bar("not a date")], "5m", now)).toEqual(new Date("2026-09-23T14:30:00Z"));
    expect(signalBarTime([], "1d", now)).toEqual(new Date("2026-09-23T00:00:00Z"));
  });
});
