/**
 * GET /api/backtest/mode-compare?symbol=AAPL&days=1825
 *
 * Runs all 8 engine modes (7 base + adaptive) against the same symbol +
 * date-range and returns side-by-side stats + equity curves. Powers the
 * /dashboard/backtest/mode-compare page.
 *
 * Distinct from /api/backtest/compare which fetches cached per-strategy
 * results from saved_strategies — mode-compare is fresh-run on each request.
 *
 * Performance: fetches target symbol + SPY + ^VIX bars once, then runs
 * 8 backtests in parallel via Promise.allSettled (a failing mode doesn't
 * tank the whole comparison). For a 5-year window the full request typically
 * completes in 3-6 seconds; we set a 15s statement timeout.
 *
 * Cache: 5-minute private cache — same symbol+days hit returns the cached
 * payload (acceptable since the underlying bars don't change intraday for
 * daily-resolution backtests).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { runBacktest, type BacktestResult, type BacktestConfig } from "@/lib/backtester";
import type { EngineMode } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";
import { db, withTimeout } from "@/lib/db";
import { symbolStrategies, optimizationRuns } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

const log = createRouteLogger("backtest/mode-compare");

const SYMBOL_RE = /^[A-Z]{1,10}$/;

/**
 * Modes we compare. Aligned with the user-facing mode picker on the
 * Trader page — conservative / moderate / aggressive are reachable
 * only via adaptive's regime classifier so showing them in this
 * comparison would surface choices the user can't actually make.
 *
 * `tactical-smart` is excluded because it's already adaptive in its
 * own way (re-ranks weekly); comparing it side-by-side with `adaptive`
 * produces near-identical curves and confuses the read.
 */
const COMPARE_MODES: EngineMode[] = [
  "optimized",
  "tactical",
  "adaptive",
];

/**
 * Mirrors the live engine's resolveStrategy() lookup order for the optimized
 * mode: per-symbol GA-tuned row → global latest optimizer run → null.
 *
 * Pre-PR-22 mode-compare passed `{}` for backtester config, so "Optimized
 * (GA)" actually ran with backtester defaults (~moderate-preset stops). The
 * surface badly misrepresented what the live engine would do.
 */
async function loadOptimizedParamsForSymbol(
  userId: string,
  symbol: string
): Promise<{ config: Partial<BacktestConfig>; holdPeriod?: number; source: string } | null> {
  // 1. Per-symbol GA row
  try {
    const rows = await withTimeout(3000, (tx) =>
      tx
        .select()
        .from(symbolStrategies)
        .where(and(eq(symbolStrategies.userId, userId), eq(symbolStrategies.symbol, symbol)))
        .limit(1)
    );
    if (rows.length > 0) {
      const r = rows[0];
      return {
        config: {
          stopLossPct: r.stopLossPct,
          takeProfitPct: r.takeProfitPct,
          trailingStopPct: r.trailingStopPct,
        },
        holdPeriod: r.holdPeriod,
        source: "symbol_strategy",
      };
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown", symbol }, "symbolStrategies lookup failed");
  }

  // 2. Latest completed optimizer run (global fallback — same as engine's
  // getLatestOptimizedParams())
  try {
    const [activeRun] = await withTimeout(3000, (tx) =>
      tx
        .select({ bestParams: optimizationRuns.bestParams })
        .from(optimizationRuns)
        .where(and(eq(optimizationRuns.status, "complete"), eq(optimizationRuns.isActive, true)))
        .limit(1)
    );
    const [run] = activeRun
      ? [activeRun]
      : await withTimeout(3000, (tx) =>
          tx
            .select({ bestParams: optimizationRuns.bestParams })
            .from(optimizationRuns)
            .where(eq(optimizationRuns.status, "complete"))
            .orderBy(desc(optimizationRuns.completedAt))
            .limit(1)
        );
    if (run?.bestParams) {
      const p = run.bestParams as Record<string, number>;
      // GA runs write takeProfitAtrMult, not takeProfitPct — hard-requiring
      // takeProfitPct silently dropped every modern run's Optimized config and
      // fell back to defaults (audit #32). Mirror trading-engine's
      // _loadOptimizedParams fallback (takeProfitPct ?? 5.0) and require only
      // the keys the GA actually writes.
      if (typeof p.stopLossPct === "number" && typeof p.trailingStopPct === "number") {
        return {
          config: {
            stopLossPct: p.stopLossPct,
            takeProfitPct: typeof p.takeProfitPct === "number" ? p.takeProfitPct : 5.0,
            trailingStopPct: p.trailingStopPct,
          },
          holdPeriod: typeof p.holdPeriod === "number" ? p.holdPeriod : undefined,
          source: "latest_optimizer_run",
        };
      }
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "optimizationRuns lookup failed");
  }

  return null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const url = request.nextUrl;
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Date range: prefer explicit start/end; else days-back.
  const startDateRaw = url.searchParams.get("startDate");
  const endDateRaw = url.searchParams.get("endDate");
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  let days = Math.min(Math.max(Number(url.searchParams.get("days")) || 1825, 90), 25 * 365);
  let endDate: Date | undefined;
  let startDate: Date | undefined;

  if (startDateRaw && endDateRaw) {
    if (!ISO_DATE.test(startDateRaw) || !ISO_DATE.test(endDateRaw)) {
      return NextResponse.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }
    startDate = new Date(`${startDateRaw}T00:00:00Z`);
    endDate = new Date(`${endDateRaw}T23:59:59Z`);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    const spanMs = endDate.getTime() - startDate.getTime();
    // Pad with 250 days warmup so adaptive's SMA200 has history.
    days = Math.min(Math.ceil(spanMs / 86400000) + 250, 25 * 365);
  }

  const provider = getMarketDataProvider();

  // Fetch target + SPY + VIX bars in parallel. allSettled so a missing
  // VIX feed degrades adaptive to "throws" without tanking the other 5 modes.
  const [targetRes, spyRes, vixRes] = await Promise.allSettled([
    provider.fetchBars(symbol, days, "1d", endDate),
    provider.fetchBars("SPY", days, "1d", endDate),
    provider.fetchBars("^VIX", days, "1d", endDate),
  ]);

  if (targetRes.status !== "fulfilled" || !targetRes.value.length) {
    return NextResponse.json(
      { error: `No historical bars for ${symbol}` },
      { status: 422 }
    );
  }
  let bars = targetRes.value;

  if (startDate && endDate) {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    bars = bars.filter((b) => {
      const t = new Date(b.date).getTime();
      return t >= startMs && t <= endMs;
    });
  }

  if (bars.length < 100) {
    return NextResponse.json(
      { error: "Not enough historical data for an 8-mode comparison (need ≥100 bars)" },
      { status: 422 }
    );
  }

  const marketContext =
    spyRes.status === "fulfilled" && vixRes.status === "fulfilled" && spyRes.value.length && vixRes.value.length
      ? { spyBars: spyRes.value, vixBars: vixRes.value }
      : null;

  // Load the GA-tuned params for this symbol once (used only for the
  // optimized mode row). PR 22 fix — pre-PR-22 mode-compare passed `{}`
  // for backtester config on every mode, so "Optimized (GA)" actually ran
  // with backtester defaults instead of the user's tuned params. The
  // surface badly misrepresented what the live engine would do.
  const optimizedParams = await loadOptimizedParamsForSymbol(session.userId, symbol);

  // Backtest sizing — match the single-symbol backtest's logic so curves are
  // comparable across pages. Optimized mode uses its tuned holdPeriod when
  // available so the curve reflects the live engine's exit timing.
  const defaultHoldPeriod = 20;
  const maxWindow = Math.floor((bars.length - defaultHoldPeriod) * 0.7);
  const windowSize = Math.max(30, Math.min(50, maxWindow));
  const stepSize = Math.max(1, Math.floor(windowSize / 10));

  // Run all modes in parallel. Promise.allSettled so one failure doesn't tank
  // the whole comparison (e.g. adaptive throws if marketContext is absent).
  const settled = await Promise.allSettled(
    COMPARE_MODES.map((mode) =>
      Promise.resolve().then(() => {
        if (mode === "adaptive" && !marketContext) {
          throw new Error("Adaptive mode requires SPY + VIX bars (not available for this date range)");
        }
        // Optimized mode: layer the GA-tuned config + holdPeriod on top so
        // this row actually reflects the live engine's optimized behavior.
        // All other modes use defaults (the in-backtester preset map handles
        // the per-mode stops/TP for tactical and adaptive).
        const config: Partial<BacktestConfig> = mode === "optimized" && optimizedParams ? optimizedParams.config : {};
        const holdPeriod = mode === "optimized" && optimizedParams?.holdPeriod !== undefined
          ? optimizedParams.holdPeriod
          : defaultHoldPeriod;
        return {
          mode,
          result: runBacktest(
            symbol,
            bars,
            windowSize,
            holdPeriod,
            stepSize,
            config,
            mode,
            mode === "adaptive" && marketContext ? marketContext : undefined
          ),
        };
      })
    )
  );

  const results: Array<{
    mode: EngineMode;
    ok: boolean;
    error?: string;
    result?: BacktestResult;
  }> = settled.map((s, idx) => {
    const mode = COMPARE_MODES[idx];
    if (s.status === "fulfilled") {
      return { mode, ok: true, result: s.value.result };
    }
    const errMsg = s.reason instanceof Error ? s.reason.message : String(s.reason);
    log.warn({ mode, err: errMsg, symbol }, "Mode backtest failed");
    return { mode, ok: false, error: errMsg };
  });

  return NextResponse.json(
    {
      symbol,
      days,
      barCount: bars.length,
      marketContextAvailable: !!marketContext,
      // PR 22 — surface what the "Optimized (GA)" row actually used so the
      // page can render the source ("Your per-symbol tuned strategy" vs
      // "Latest global optimizer run" vs "No GA params — backtester defaults").
      optimizedParamsSource: optimizedParams?.source ?? "defaults",
      optimizedParams: optimizedParams
        ? {
            stopLossPct: optimizedParams.config.stopLossPct,
            takeProfitPct: optimizedParams.config.takeProfitPct,
            trailingStopPct: optimizedParams.config.trailingStopPct,
            holdPeriod: optimizedParams.holdPeriod,
          }
        : null,
      results,
    },
    {
      headers: { "Cache-Control": "private, max-age=300" },
    }
  );
}
