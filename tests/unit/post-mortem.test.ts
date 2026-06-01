import { describe, it, expect } from "vitest";
import {
  formatDuration,
  computeRMultiple,
  buildPostMortemContext,
  buildPostMortemPrompt,
  type PostMortemTradeRow,
  type PostMortemSignalRow,
} from "@/lib/post-mortem";

// ── Helpers ────────────────────────────────────────────────────────

function buyTrade(overrides: Partial<PostMortemTradeRow> = {}): PostMortemTradeRow {
  return {
    id: "buy-1",
    symbol: "AAPL",
    action: "BUY",
    quantity: 100,
    fillPrice: 150,
    fillTime: new Date("2026-05-01T14:30:00Z"),
    stopPrice: 145,
    status: "FILLED",
    signal: "BUY",
    notes: null,
    traderTimestamp: new Date("2026-05-01T14:30:00Z"),
    ...overrides,
  };
}

function sellTrade(overrides: Partial<PostMortemTradeRow> = {}): PostMortemTradeRow {
  return {
    id: "sell-1",
    symbol: "AAPL",
    action: "SELL",
    quantity: 100,
    fillPrice: 160,
    fillTime: new Date("2026-05-03T14:30:00Z"),
    stopPrice: null,
    status: "FILLED",
    signal: "STRONG_SELL",
    notes: null,
    traderTimestamp: new Date("2026-05-03T14:30:00Z"),
    ...overrides,
  };
}

// ── formatDuration ─────────────────────────────────────────────────

describe("formatDuration", () => {
  it("handles minutes", () => {
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(45 * 60_000)).toBe("45m");
  });

  it("handles hours", () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe("2h");
    expect(formatDuration((2 * 60 + 15) * 60_000)).toBe("2h 15m");
  });

  it("handles days", () => {
    expect(formatDuration(24 * 60 * 60_000)).toBe("1d");
    expect(formatDuration((24 + 4) * 60 * 60_000)).toBe("1d 4h");
    expect(formatDuration(3 * 24 * 60 * 60_000)).toBe("3d");
  });

  it("clamps negative durations", () => {
    expect(formatDuration(-1000)).toBe("0m");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

// ── computeRMultiple ──────────────────────────────────────────────

describe("computeRMultiple", () => {
  it("computes a 2R winner", () => {
    // Entry 100, stop 95 (risk $5), exit 110 → reward $10 = 2R
    const r = computeRMultiple(100, 95, 110, 50);
    expect(r.rMultiple).toBeCloseTo(2, 5);
    expect(r.riskPerShare).toBe(5);
  });

  it("computes a -1R loser (stopped out)", () => {
    const r = computeRMultiple(100, 95, 95, 50);
    expect(r.rMultiple).toBeCloseTo(-1, 5);
    expect(r.riskPerShare).toBe(5);
  });

  it("returns null when no stop captured", () => {
    expect(computeRMultiple(100, null, 110, 50)).toEqual({
      rMultiple: null,
      riskPerShare: null,
    });
  });

  it("returns null on malformed stop (stop above entry on long)", () => {
    // Negative riskPerShare is malformed for a long entry.
    expect(computeRMultiple(100, 105, 110, 50)).toEqual({
      rMultiple: null,
      riskPerShare: null,
    });
  });

  it("returns null on zero stop", () => {
    expect(computeRMultiple(100, 0, 110, 50)).toEqual({
      rMultiple: null,
      riskPerShare: null,
    });
  });
});

// ── buildPostMortemContext ─────────────────────────────────────────

describe("buildPostMortemContext", () => {
  it("builds a winner context", () => {
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), null);
    expect(ctx.symbol).toBe("AAPL");
    expect(ctx.direction).toBe("long");
    expect(ctx.entryFillPrice).toBe(150);
    expect(ctx.exitFillPrice).toBe(160);
    expect(ctx.quantity).toBe(100);
    expect(ctx.realizedPnl).toBeCloseTo(1000, 5); // (160-150)*100
    expect(ctx.returnPct).toBeCloseTo(10 / 150, 5);
    expect(ctx.rMultiple).toBeCloseTo((10 * 100) / (5 * 100), 5); // = 2
    expect(ctx.riskPerShare).toBe(5);
    expect(ctx.holdDurationMs).toBe(2 * 24 * 60 * 60_000);
    expect(ctx.holdDurationDisplay).toBe("2d");
  });

  it("builds a loser context", () => {
    const ctx = buildPostMortemContext(
      buyTrade({ fillPrice: 150, stopPrice: 145 }),
      sellTrade({ fillPrice: 145 }),
      null
    );
    expect(ctx.realizedPnl).toBeCloseTo(-500, 5);
    expect(ctx.returnPct).toBeLessThan(0);
    expect(ctx.rMultiple).toBeCloseTo(-1, 5);
  });

  it("handles missing stop price", () => {
    const ctx = buildPostMortemContext(
      buyTrade({ stopPrice: null }),
      sellTrade(),
      null
    );
    expect(ctx.rMultiple).toBeNull();
    expect(ctx.riskPerShare).toBeNull();
  });

  it("attaches entry signal details when provided", () => {
    const signal: PostMortemSignalRow = {
      signal: "STRONG_BUY",
      indicators: { rsi_14: 62.5, ema_9: 150.2 },
    };
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), signal);
    expect(ctx.entrySignalDetails).toEqual(signal);
  });

  it("throws on symbol mismatch", () => {
    expect(() =>
      buildPostMortemContext(
        buyTrade({ symbol: "AAPL" }),
        sellTrade({ symbol: "MSFT" }),
        null
      )
    ).toThrow(/symbol mismatch/i);
  });

  it("throws on missing fill price", () => {
    expect(() =>
      buildPostMortemContext(
        buyTrade({ fillPrice: null }),
        sellTrade(),
        null
      )
    ).toThrow(/fill price/i);
    expect(() =>
      buildPostMortemContext(
        buyTrade(),
        sellTrade({ fillPrice: null }),
        null
      )
    ).toThrow(/fill price/i);
  });

  it("falls back to traderTimestamp when fillTime missing", () => {
    const buy = buyTrade({ fillTime: null });
    const sell = sellTrade({ fillTime: null });
    const ctx = buildPostMortemContext(buy, sell, null);
    expect(ctx.entryTime).toBe(buy.traderTimestamp);
    expect(ctx.exitTime).toBe(sell.traderTimestamp);
  });
});

// ── buildPostMortemPrompt ──────────────────────────────────────────

describe("buildPostMortemPrompt", () => {
  it("returns system + user message strings", () => {
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), null);
    const p = buildPostMortemPrompt(ctx);
    expect(typeof p.system).toBe("string");
    expect(typeof p.user).toBe("string");
    expect(p.system.length).toBeGreaterThan(0);
    expect(p.user.length).toBeGreaterThan(0);
  });

  it("system prompt declares the four expected sections", () => {
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), null);
    const p = buildPostMortemPrompt(ctx);
    expect(p.system).toContain("## Setup");
    expect(p.system).toContain("## What worked");
    expect(p.system).toContain("## Stop and exit");
    expect(p.system).toContain("## Lesson");
  });

  it("user message includes symbol, prices, P&L, and R-multiple", () => {
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), null);
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toContain("AAPL");
    expect(p.user).toMatch(/\$150\.00/);
    expect(p.user).toMatch(/\$160\.00/);
    expect(p.user).toMatch(/\+\$1000\.00/);
    expect(p.user).toMatch(/2\.00R/);
  });

  it("flags missing stop in the prompt", () => {
    const ctx = buildPostMortemContext(
      buyTrade({ stopPrice: null }),
      sellTrade(),
      null
    );
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toMatch(/not computable/i);
    expect(p.user).toMatch(/no stop captured/i);
  });

  it("includes indicator snapshot when signal provided", () => {
    const signal: PostMortemSignalRow = {
      signal: "STRONG_BUY",
      indicators: { rsi_14: 62.5, ema_9: 150.2, vwap: 149.8 },
    };
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), signal);
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toMatch(/rsi_14=62\.50/);
    expect(p.user).toMatch(/ema_9=150\.20/);
    expect(p.user).toMatch(/vwap=149\.80/);
  });

  it("handles missing signal gracefully", () => {
    const ctx = buildPostMortemContext(buyTrade(), sellTrade(), null);
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toMatch(/no indicator snapshot/i);
  });

  it("formats loser correctly", () => {
    const ctx = buildPostMortemContext(
      buyTrade(),
      sellTrade({ fillPrice: 145 }),
      null
    );
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toContain("loser");
    expect(p.user).toContain("-$500.00");
  });

  it("includes closing notes when present", () => {
    const ctx = buildPostMortemContext(
      buyTrade(),
      sellTrade({ notes: "stopped out on the wick, tape was weak" }),
      null
    );
    const p = buildPostMortemPrompt(ctx);
    expect(p.user).toMatch(/stopped out on the wick/);
  });
});
