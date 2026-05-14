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
import { runBacktest, type BacktestResult } from "@/lib/backtester";
import type { EngineMode } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("backtest/mode-compare");

const SYMBOL_RE = /^[A-Z]{1,10}$/;

/**
 * Modes we compare. `tactical-smart` and `intraday` are excluded:
 *  - `intraday` needs 5m bars (we only have daily for backtests)
 *  - `tactical-smart` is already adaptive; comparing it side-by-side with
 *    `adaptive` is confusing and produces near-identical curves.
 */
const COMPARE_MODES: EngineMode[] = [
  "conservative",
  "moderate",
  "optimized",
  "aggressive",
  "tactical",
  "adaptive",
];

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

  // Backtest sizing — match the single-symbol backtest's logic so curves are
  // comparable across pages.
  const holdPeriod = 20;
  const maxWindow = Math.floor((bars.length - holdPeriod) * 0.7);
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
        return {
          mode,
          result: runBacktest(
            symbol,
            bars,
            windowSize,
            holdPeriod,
            stepSize,
            {},
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
      results,
    },
    {
      headers: { "Cache-Control": "private, max-age=300" },
    }
  );
}
