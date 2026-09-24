/**
 * Tests for decidePromotion — the margin-gated promote/keep rule the
 * auto-optimizer cron (/api/cron/auto-optimize) uses to decide whether a
 * freshly-completed GA run replaces the global active preset.
 *
 * Both scores are the candidate-vs-incumbent OUT-OF-SAMPLE excess return
 * computed on the SAME held-out PortfolioData. The margin is a hysteresis band
 * (excess-return percentage points) so noise-level wins don't churn the single
 * global active slot every run.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Bar } from "@/types";

// Route-level harness for /api/cron/auto-optimize. The DB is a scripted fake:
// selects resolve from a queue in call order, and every UPDATE is recorded as
// committed (outside a transaction, or inside one that returned) or discarded
// (inside one that threw), so a test can assert what reached the DB.
const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
  returning: [] as unknown[][],
  committed: [] as Array<{ set: Record<string, unknown>; inTx: boolean }>,
  audits: [] as Array<{ action: string; metadata: Record<string, unknown> }>,
  fetchBars: (async () => []) as (sym: string) => Promise<Bar[]>,
  scores: { candidate: 0, incumbent: 0 },
  backtestCalls: 0,
}));

vi.mock("@/lib/db", () => {
  function selectChain() {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "for"]) chain[m] = () => chain;
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(state.selects.shift() ?? []).then(res, rej);
    return chain;
  }
  type Sink = () => Array<{ set: Record<string, unknown>; inTx: boolean }>;
  function updater(sink: Sink, inTx: boolean) {
    return () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          sink().push({ set: v, inTx });
          const done = Promise.resolve([] as unknown[]);
          return {
            then: done.then.bind(done),
            returning: async () => state.returning.shift() ?? [{ id: "row" }],
          };
        },
      }),
    });
  }
  const db = {
    select: selectChain,
    update: updater(() => state.committed, false),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const staged: Array<{ set: Record<string, unknown>; inTx: boolean }> = [];
      const tx = { select: selectChain, update: updater(() => staged, true) };
      const out = await cb(tx);
      state.committed.push(...staged);
      return out;
    },
  };
  return {
    db,
    withTimeout: async (_ms: number, fn: (tx: unknown) => Promise<unknown>) => fn({ select: selectChain }),
  };
});

vi.mock("@/lib/market-data", () => ({
  getMarketDataProvider: () => ({ fetchBars: (sym: string) => state.fetchBars(sym) }),
}));

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    OPTIMIZER_AUTO_RUN_STARTED: "optimizer.auto_run_started",
    OPTIMIZER_AUTO_PROMOTED: "optimizer.auto_promoted",
    OPTIMIZER_AUTO_REJECTED: "optimizer.auto_rejected",
  },
  writeAudit: async (e: { action: string; metadata: Record<string, unknown> }) => {
    state.audits.push({ action: e.action, metadata: e.metadata });
  },
}));

vi.mock("@/lib/optimizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/optimizer")>();
  return {
    ...actual,
    // First call scores the candidate, the second the incumbent.
    portfolioBacktest: () => {
      const n = state.backtestCalls++;
      return { excessReturn: n === 0 ? state.scores.candidate : state.scores.incumbent };
    },
    startOptimization: async () => "new-run",
  };
});

import { decidePromotion, assessHoldoutCoverage, TOP_50 } from "@/lib/optimizer";
import { GET } from "@/app/api/cron/auto-optimize/route";

describe("decidePromotion", () => {
  it("promotes a positive candidate when there is no incumbent (first-ever preset)", () => {
    expect(decidePromotion({ candidateOOS: 12, incumbentOOS: null, margin: 2, testDates: 250 })).toEqual({
      promote: true,
      reason: "no_incumbent",
    });
  });

  it("promotes when the candidate beats the incumbent by more than the margin", () => {
    // 20 > 15 + 2
    expect(decidePromotion({ candidateOOS: 20, incumbentOOS: 15, margin: 2, testDates: 250 })).toEqual({
      promote: true,
      reason: "beat_margin",
    });
  });

  it("keeps the incumbent when the candidate wins but not by the full margin", () => {
    // 16 is better than 15, but not by 2pp
    expect(decidePromotion({ candidateOOS: 16, incumbentOOS: 15, margin: 2, testDates: 250 })).toEqual({
      promote: false,
      reason: "below_margin",
    });
  });

  it("treats exactly-at-margin as NOT promoted (strict >, hysteresis)", () => {
    // 17 == 15 + 2 → must strictly exceed
    expect(decidePromotion({ candidateOOS: 17, incumbentOOS: 15, margin: 2, testDates: 250 })).toEqual({
      promote: false,
      reason: "below_margin",
    });
  });

  it("keeps the incumbent when the candidate is worse", () => {
    expect(decidePromotion({ candidateOOS: 10, incumbentOOS: 15, margin: 2, testDates: 250 }).promote).toBe(false);
  });

  it("never promotes a non-finite candidate score (bad backtest)", () => {
    expect(decidePromotion({ candidateOOS: NaN, incumbentOOS: 15, margin: 2, testDates: 250 })).toEqual({
      promote: false,
      reason: "invalid_candidate",
    });
    expect(decidePromotion({ candidateOOS: Infinity, incumbentOOS: 15, margin: 2, testDates: 250 }).promote).toBe(false);
  });

  it("treats a non-finite incumbent score as no-incumbent (promote)", () => {
    expect(decidePromotion({ candidateOOS: 5, incumbentOOS: NaN, margin: 2, testDates: 250 })).toEqual({
      promote: true,
      reason: "no_incumbent",
    });
  });

  it("handles negative-regime scores (both OOS negative) monotonically", () => {
    // candidate loses less: -5 > -10 + 2 = -8 → promote
    expect(decidePromotion({ candidateOOS: -5, incumbentOOS: -10, margin: 2, testDates: 250 }).promote).toBe(true);
    // candidate loses more → keep
    expect(decidePromotion({ candidateOOS: -12, incumbentOOS: -10, margin: 2, testDates: 250 }).promote).toBe(false);
  });

  it("clamps a negative margin to 0 (a positive edge still promotes)", () => {
    expect(decidePromotion({ candidateOOS: 15.1, incumbentOOS: 15, margin: -5, testDates: 250 }).promote).toBe(true);
    expect(decidePromotion({ candidateOOS: 15, incumbentOOS: 15, margin: -5, testDates: 250 }).promote).toBe(false);
  });
});

describe("decidePromotion holdout floor (WP08)", () => {
  it("never promotes on an empty holdout, even with no incumbent", () => {
    expect(decidePromotion({ candidateOOS: 0, incumbentOOS: null, margin: 2, testDates: 0 })).toEqual({
      promote: false,
      reason: "empty_holdout",
    });
    expect(decidePromotion({ candidateOOS: 12, incumbentOOS: null, margin: 2, testDates: 0 }).promote).toBe(false);
    expect(decidePromotion({ candidateOOS: 20, incumbentOOS: 1, margin: 2, testDates: 0 }).promote).toBe(false);
  });

  it("requires a strictly positive candidate score to promote with no incumbent", () => {
    expect(decidePromotion({ candidateOOS: 0, incumbentOOS: null, margin: 2, testDates: 250 })).toEqual({
      promote: false,
      reason: "no_incumbent_not_positive",
    });
    expect(decidePromotion({ candidateOOS: -3, incumbentOOS: NaN, margin: 2, testDates: 250 }).promote).toBe(false);
  });
});

describe("assessHoldoutCoverage", () => {
  it("passes at or above the 80% floor with enough test dates", () => {
    expect(assessHoldoutCoverage({ expected: 50, fetched: 40, testDates: 120 }).ok).toBe(true);
  });
  it("defers below the coverage floor", () => {
    expect(assessHoldoutCoverage({ expected: 50, fetched: 39, testDates: 500 })).toMatchObject({
      ok: false,
      reason: "low_coverage",
    });
    expect(assessHoldoutCoverage({ expected: 50, fetched: 0, testDates: 0 }).reason).toBe("low_coverage");
    expect(assessHoldoutCoverage({ expected: 0, fetched: 0, testDates: 0 }).ok).toBe(false);
  });
  it("defers on a short test segment", () => {
    expect(assessHoldoutCoverage({ expected: 50, fetched: 50, testDates: 10 })).toMatchObject({
      ok: false,
      reason: "short_holdout",
    });
  });
});

// Route: /api/cron/auto-optimize evaluate tick

const GA_PARAMS = {
  stopLossPct: 0.05, takeProfitAtrMult: 6, trailingStopPct: 0.05, holdPeriod: 20,
  rsiOversold: 30, rsiOverbought: 70, emaFast: 9, emaSlow: 21, rsThreshold: 0,
};

function bars(n: number): Bar[] {
  const out: Bar[] = [];
  const start = Date.UTC(2021, 0, 4);
  for (let i = 0; i < n; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const p = 100 + i * 0.1;
    out.push({ date, open: p, high: p + 1, low: p - 1, close: p, volume: 1_000_000 } as Bar);
  }
  return out;
}

function cronRequest(): Request {
  return new Request("http://localhost/api/cron/auto-optimize", {
    headers: { "x-cron-secret": "cron-test-secret" },
  });
}

/** Queue the three reads the evaluate tick makes before scoring. */
function queueEvaluate(incumbent: { id: string; bestParams: unknown } | null) {
  state.selects.push(
    [{ id: "cand", status: "complete", createdAt: new Date() }], // step 1: latest run
    [{ id: "cand", bestParams: GA_PARAMS, universe: "top50", trainPct: 60, totalSymbols: 50 }], // step 2
    incumbent ? [incumbent] : [] // the incumbent read
  );
}

const decidedWrites = () => state.committed.filter((w) => "autoPromotionDecidedAt" in w.set);
const activeWrites = () => state.committed.filter((w) => "isActive" in w.set);

describe("auto-optimize evaluate tick (WP08)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("OPTIMIZER_CRON_USER_ID", "svc-user");
    vi.stubEnv("OPTIMIZER_PROMOTE_MARGIN", "2");
    state.selects = [];
    state.returning = [];
    state.committed = [];
    state.audits = [];
    state.backtestCalls = 0;
    state.scores = { candidate: 10, incumbent: 1 };
    state.fetchBars = async () => bars(300);
  });

  it("defers an empty holdout without marking the run decided", async () => {
    state.fetchBars = async () => {
      throw new Error("429 Too Many Requests");
    };
    queueEvaluate({ id: "inc", bestParams: GA_PARAMS });
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ phase: "deferred", decision: "deferred", reason: "low_coverage" });
    expect(decidedWrites()).toHaveLength(0);
    expect(activeWrites()).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
    expect(state.backtestCalls).toBe(0);
  }, 30_000);

  it("defers a partial holdout below the coverage floor", async () => {
    const ok = new Set(TOP_50.slice(0, 30)); // 60% of the 50 the GA trained on
    state.fetchBars = async (sym) => {
      if (!ok.has(sym)) throw new Error("timeout");
      return bars(300);
    };
    queueEvaluate(null); // no incumbent: the old rule would have promoted outright
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ phase: "deferred", reason: "low_coverage" });
    expect(decidedWrites()).toHaveLength(0);
    expect(activeWrites()).toHaveLength(0);
  }, 30_000);

  it("decides on a full holdout and records the coverage in the audit row", async () => {
    state.scores = { candidate: 2, incumbent: 1 }; // below the 2pp margin
    queueEvaluate({ id: "inc", bestParams: GA_PARAMS });
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ phase: "evaluated", decision: "rejected", reason: "below_margin" });
    expect(decidedWrites()).toHaveLength(1);
    expect(state.audits[0].metadata.coverage).toMatchObject({ attempted: 50, fetched: 50, failed: 0 });
  }, 30_000);
});

describe("auto-optimize fenced promotion (WP08)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
    vi.stubEnv("OPTIMIZER_CRON_USER_ID", "svc-user");
    vi.stubEnv("OPTIMIZER_PROMOTE_MARGIN", "2");
    state.selects = [];
    state.returning = [];
    state.committed = [];
    state.audits = [];
    state.backtestCalls = 0;
    state.scores = { candidate: 10, incumbent: 1 }; // clears the margin
    state.fetchBars = async () => bars(300);
  });

  it("promotes when the active row is still the scored incumbent", async () => {
    queueEvaluate({ id: "inc", bestParams: GA_PARAMS });
    state.selects.push([{ id: "inc" }]); // FOR UPDATE re-read inside the flip
    state.returning.push([{ id: "inc" }], [{ id: "cand" }]);
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ phase: "evaluated", decision: "promoted" });
    expect(activeWrites().map((w) => w.set.isActive)).toEqual([false, true]);
    expect(activeWrites().every((w) => w.inTx)).toBe(true);
    expect(state.audits[0].metadata.demotedRunId).toBe("inc");
  }, 30_000);

  it("aborts with incumbent_changed and writes nothing when the active row moved", async () => {
    queueEvaluate({ id: "inc", bestParams: GA_PARAMS });
    state.selects.push([{ id: "saved-meanwhile" }]); // a save-preset landed during scoring
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ phase: "deferred", decision: "incumbent_changed" });
    expect(state.committed).toHaveLength(0); // no demote, no promote, no decided marker
    expect(state.audits).toHaveLength(0);
  }, 30_000);

  it("aborts when a preset was activated where there was no incumbent", async () => {
    queueEvaluate(null);
    state.selects.push([{ id: "saved-meanwhile" }]);
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ decision: "incumbent_changed" });
    expect(state.committed).toHaveLength(0);
  }, 30_000);

  it("rolls back when the fenced demote matches no row", async () => {
    queueEvaluate({ id: "inc", bestParams: GA_PARAMS });
    state.selects.push([{ id: "inc" }]);
    state.returning.push([]); // demote WHERE is_active AND id = inc hit nothing
    const body = await (await GET(cronRequest() as never)).json();
    expect(body).toMatchObject({ decision: "incumbent_changed" });
    expect(state.committed).toHaveLength(0);
  }, 30_000);
});
