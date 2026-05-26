/**
 * Tests for the exit-rejection suppression logic added to trading-engine.ts.
 *
 * Context: APP on the admin tactical-smart account triggered stop_loss every
 * 60 sec for 60+ minutes on 2026-05-26; each market sell rejected by Alpaca
 * with 40310100 (pattern day trading). The engine logged + retried each
 * minute with no escalation. This logic stops the retry loop after N
 * rejections, writes a CRITICAL audit, and pushes a notification to the user.
 *
 * The helpers (`isExitSuppressed`, `recordExitRejection`, `clearExitRejection`)
 * aren't exported. Following tests/unit/engine-safeguards.test.ts: mirror
 * the relevant fields + helper bodies so the contract is pinned independently.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mirror of engine fields used by the suppression helpers
interface MinimalEngine {
  userId: string | null;
  exitRejectionCount: Map<string, number>;
  exitSuppressedUntil: Map<string, number>;
  audits: Array<{ symbol: string; attempts: number; reason: string }>;
  pushes: Array<{ symbol: string; body: string }>;
}

const EXIT_REJECTION_THRESHOLD = 5;
const EXIT_SUPPRESSION_MS = 30 * 60 * 1000;

function newEngine(): MinimalEngine {
  return {
    userId: "test-user",
    exitRejectionCount: new Map(),
    exitSuppressedUntil: new Map(),
    audits: [],
    pushes: [],
  };
}

function isExitSuppressed(engine: MinimalEngine, symbol: string): boolean {
  const until = engine.exitSuppressedUntil.get(symbol);
  if (until == null) return false;
  if (Date.now() >= until) {
    engine.exitSuppressedUntil.delete(symbol);
    engine.exitRejectionCount.delete(symbol);
    return false;
  }
  return true;
}

function recordExitRejection(
  engine: MinimalEngine,
  symbol: string,
  isPdt: boolean,
  context: { reason: string; currentPrice: number; entryPrice: number; qty: number }
): void {
  if (!isPdt) return;
  const next = (engine.exitRejectionCount.get(symbol) ?? 0) + 1;
  engine.exitRejectionCount.set(symbol, next);
  if (next < EXIT_REJECTION_THRESHOLD) return;
  const until = Date.now() + EXIT_SUPPRESSION_MS;
  engine.exitSuppressedUntil.set(symbol, until);
  engine.audits.push({ symbol, attempts: next, reason: context.reason });
  engine.pushes.push({
    symbol,
    body: `${symbol} stop_loss triggered but broker keeps rejecting (PDT). Manual exit required.`,
  });
}

function clearExitRejection(engine: MinimalEngine, symbol: string): void {
  engine.exitRejectionCount.delete(symbol);
  engine.exitSuppressedUntil.delete(symbol);
}

describe("exit suppression on PDT rejections", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("non-PDT rejections do NOT count toward suppression", () => {
    const e = newEngine();
    for (let i = 0; i < 10; i++) {
      recordExitRejection(e, "AAPL", false, {
        reason: "stop_loss", currentPrice: 200, entryPrice: 210, qty: 5,
      });
    }
    expect(e.exitRejectionCount.has("AAPL")).toBe(false);
    expect(e.exitSuppressedUntil.has("AAPL")).toBe(false);
    expect(e.audits).toHaveLength(0);
    expect(e.pushes).toHaveLength(0);
  });

  it("PDT rejections below threshold accumulate but don't suppress", () => {
    const e = newEngine();
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD - 1; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(e.exitRejectionCount.get("APP")).toBe(EXIT_REJECTION_THRESHOLD - 1);
    expect(isExitSuppressed(e, "APP")).toBe(false);
    expect(e.audits).toHaveLength(0);
    expect(e.pushes).toHaveLength(0);
  });

  it("the threshold-th rejection triggers suppression + audit + push", () => {
    const e = newEngine();
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(e.exitRejectionCount.get("APP")).toBe(EXIT_REJECTION_THRESHOLD);
    expect(isExitSuppressed(e, "APP")).toBe(true);
    expect(e.audits).toHaveLength(1);
    expect(e.audits[0]).toMatchObject({ symbol: "APP", attempts: 5, reason: "stop_loss" });
    expect(e.pushes).toHaveLength(1);
    expect(e.pushes[0].symbol).toBe("APP");
  });

  it("isExitSuppressed returns false (and clears state) once the window expires", () => {
    const e = newEngine();
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(isExitSuppressed(e, "APP")).toBe(true);

    // Advance past the 30-min window
    vi.advanceTimersByTime(EXIT_SUPPRESSION_MS + 1);

    expect(isExitSuppressed(e, "APP")).toBe(false);
    // Re-call is no-op; both maps cleared
    expect(e.exitSuppressedUntil.has("APP")).toBe(false);
    expect(e.exitRejectionCount.has("APP")).toBe(false);
  });

  it("clearExitRejection on successful exit resets the counters", () => {
    const e = newEngine();
    for (let i = 0; i < 3; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(e.exitRejectionCount.get("APP")).toBe(3);

    clearExitRejection(e, "APP");

    expect(e.exitRejectionCount.has("APP")).toBe(false);
    expect(e.exitSuppressedUntil.has("APP")).toBe(false);
  });

  it("suppression is per-symbol — one symbol's window doesn't block another", () => {
    const e = newEngine();
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(isExitSuppressed(e, "APP")).toBe(true);
    expect(isExitSuppressed(e, "AON")).toBe(false);
    expect(isExitSuppressed(e, "AEE")).toBe(false);
  });

  it("post-expiry, one more cycle of N rejections re-fires a fresh audit", () => {
    const e = newEngine();
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 500, entryPrice: 523, qty: 4,
      });
    }
    expect(e.audits).toHaveLength(1);

    vi.advanceTimersByTime(EXIT_SUPPRESSION_MS + 1);
    // Suppression check clears state
    expect(isExitSuppressed(e, "APP")).toBe(false);

    // Next round of 5 PDT rejections after the window expires —
    // user is notified again, not silently re-suppressed forever.
    for (let i = 0; i < EXIT_REJECTION_THRESHOLD; i++) {
      recordExitRejection(e, "APP", true, {
        reason: "stop_loss", currentPrice: 490, entryPrice: 523, qty: 4,
      });
    }
    expect(e.audits).toHaveLength(2);
    expect(e.pushes).toHaveLength(2);
  });
});
