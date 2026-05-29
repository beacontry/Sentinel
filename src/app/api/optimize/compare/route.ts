import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMarketDataProvider } from "@/lib/market-data";
import { analyzeBars, type SignalParams } from "@/lib/indicators/analyzer";
import { STRATEGY_PRESETS } from "@/lib/strategy-presets";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { optimizationRuns } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import {
  TOP_50,
  TOP_150,
  buildPortfolioData,
  portfolioBacktest,
  type OptimizableParams,
} from "@/lib/optimizer";
import { SP500_SYMBOLS, getSP500MembershipResolver } from "@/lib/sp500";
import type { Bar } from "@/types";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("mode-comparison");

interface ModeResult {
  mode: string;
  label: string;
  totalReturn: number;
  finalValue: number;
  // Nullable: the Optimized row reads the run's stored OOS metrics, and
  // per-segment trade count / time-in-market aren't stored → "—" in the UI.
  maxDrawdown: number | null;
  sharpe: number | null;
  trades: number | null;
  timeInMarket: number | null; // percentage
}

interface StrategyParams {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
}

interface OptimizerExtraParams {
  signalParams?: SignalParams;
  rsThreshold?: number;
  takeProfitAtrMult?: number;
}

/**
 * Simulate a signal-based strategy on the portfolio of stocks.
 * Uses analyzeBars() for all modes — same signal function as the live engine.
 */
function simulateSignalStrategy(
  allBars: Map<string, Bar[]>,
  params: StrategyParams,
  maxPositions: number,
  positionPct: number,
  extra?: OptimizerExtraParams,
): ModeResult & { mode: string; label: string } {
  // Build unified date index
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) {
      const dk = b.date.split("T")[0];
      dateSet.add(dk);
      lookup.set(dk, b);
    }
    barLookup.set(sym, lookup);
  }
  const dates = [...dateSet].sort();

  const signalParams = extra?.signalParams;

  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number; peakPrice: number; entryIdx: number; takeProfitPrice: number }>();
  const equityHistory: number[] = [INITIAL];
  let wins = 0, losses = 0;
  let daysInMarket = 0;
  const windows = new Map<string, Bar[]>();

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];

    // Update windows
    for (const sym of allBars.keys()) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      let w = windows.get(sym);
      if (!w) { w = []; windows.set(sym, w); }
      w.push(bar);
      if (w.length > 90) w.shift();
    }

    if (positions.size > 0) daysInMarket++;

    // Check exits
    for (const [sym, pos] of [...positions]) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      if (bar.high > pos.peakPrice) pos.peakPrice = bar.high;

      let exit = false;
      const pPct = (pos.peakPrice - pos.entryPrice) / pos.entryPrice;
      const dynT = pPct > 0 ? 0.02 + (params.trailingStopPct - 0.02) * Math.exp(-3 * pPct) : params.trailingStopPct;
      const fixedStop = pos.entryPrice * (1 - params.stopLossPct);
      const trailStop = pos.peakPrice * (1 - dynT);
      if (bar.low <= Math.max(fixedStop, trailStop)) exit = true;
      if (bar.high >= pos.takeProfitPrice) exit = true;
      if (di - pos.entryIdx >= params.holdPeriod) exit = true;

      // Sell signal check every 15 days — uses same analyzer as live engine
      if (!exit && di % 15 === 0) {
        const w = windows.get(sym);
        if (w && w.length >= 60) {
          const result = analyzeBars(sym, w, signalParams);
          if (result.signal === "SELL" || result.signal === "STRONG_SELL") exit = true;
        }
      }

      if (exit) {
        cash += pos.qty * bar.close;
        if (bar.close > pos.entryPrice) wins++; else losses++;
        positions.delete(sym);
      }
    }

    // Check entries every 15 days
    if (di % 15 === 0 && positions.size < maxPositions) {
      for (const sym of allBars.keys()) {
        if (positions.has(sym)) continue;
        const w = windows.get(sym);
        if (!w || w.length < 60) continue;
        const bar = barLookup.get(sym)?.get(date);
        if (!bar) continue;

        // RS threshold filter (when using optimizer params)
        if (extra?.rsThreshold != null && w.length >= 60) {
          const rs60 = (w[w.length - 1].close - w[w.length - 60].close) / w[w.length - 60].close;
          if (rs60 < extra.rsThreshold) continue;
        }

        const result = analyzeBars(sym, w, signalParams);
        if (result.signal !== "BUY" && result.signal !== "STRONG_BUY") continue;
        if (positions.size >= maxPositions) break;

        let equity = cash;
        for (const [s, p] of positions) {
          const b = barLookup.get(s)?.get(date);
          equity += p.qty * (b?.close ?? p.entryPrice);
        }

        const posValue = equity * positionPct;
        const qty = Math.floor(posValue / bar.close);
        if (qty <= 0 || qty * bar.close > cash) continue;

        // Compute take profit: ATR-based for optimized, fixed % for others
        const atr = result.indicators.atr_14;
        const tp = extra?.takeProfitAtrMult && atr
          ? bar.close + atr * extra.takeProfitAtrMult
          : bar.close * (1 + params.takeProfitPct);

        cash -= qty * bar.close;
        positions.set(sym, { qty, entryPrice: bar.close, peakPrice: bar.close, entryIdx: di, takeProfitPrice: tp });
      }
    }

    // Record equity
    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  // Close remaining
  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    const price = b?.close ?? pos.entryPrice;
    cash += pos.qty * price;
    if (price > pos.entryPrice) wins++; else losses++;
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;
  const tradeCount = wins + losses;

  // Max drawdown
  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe
  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "", label: "",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades: tradeCount,
    timeInMarket: Math.round((daysInMarket / dates.length) * 100),
  };
}

/**
 * Simulate tactical mode: always invested, exit on SPY weakness
 */
function simulateTactical(
  allBars: Map<string, Bar[]>,
  spyBars: Bar[],
  splitDate: string,
  eligibleOn?: (dateKey: string) => Set<string>,
): ModeResult {
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) { const dk = b.date.split("T")[0]; dateSet.add(dk); lookup.set(dk, b); }
    barLookup.set(sym, lookup);
  }
  const spyLookup = new Map<string, Bar>();
  for (const b of spyBars) spyLookup.set(b.date.split("T")[0], b);

  const dates = [...dateSet].sort();
  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number }>();
  const equityHistory: number[] = [INITIAL];
  let trades = 0, daysInMarket = 0;
  let isInvested = false;
  const spyCloses: number[] = [];

  // Warm rolling state over the full history, but only trade + record equity
  // from the test window onward — matches the GA's held-out segment (true OOS).
  let testStartIdx = dates.findIndex((d) => d >= splitDate);
  if (testStartIdx < 0) testStartIdx = 0;

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const spyBar = spyLookup.get(date);
    if (spyBar) spyCloses.push(spyBar.close);

    if (di < testStartIdx) continue; // warm-up only — no trading/equity

    if (isInvested) daysInMarket++;

    const sma20 = spyCloses.length >= 20 ? spyCloses.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const sma50 = spyCloses.length >= 50 ? spyCloses.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const spyPrice = spyCloses.length > 0 ? spyCloses[spyCloses.length - 1] : 0;

    // Check for exit: SPY below 20 SMA
    if (isInvested && sma20 && spyPrice < sma20) {
      // Count consecutive days below
      let belowCount = 0;
      for (let j = spyCloses.length - 3; j < spyCloses.length; j++) {
        if (j >= 0 && j < spyCloses.length) {
          const s = spyCloses.slice(Math.max(0, j - 19), j + 1);
          if (s.length >= 20) {
            const avg = s.reduce((a, b) => a + b, 0) / s.length;
            if (spyCloses[j] < avg) belowCount++;
          }
        }
      }

      if (belowCount >= 3) {
        // Sell everything
        for (const [sym, pos] of positions) {
          const b = barLookup.get(sym)?.get(date);
          cash += pos.qty * (b?.close ?? pos.entryPrice);
          trades++;
        }
        positions.clear();
        isInvested = false;
      }
    }

    // Check for entry: SPY above 50 SMA and not invested
    if (!isInvested && sma50 && spyPrice > sma50) {
      // Rank eligible names by 60-day momentum and take the top 16 — rather
      // than the first 16 in map order, which was just an alphabetical slice
      // of the universe (noise, not a strategy).
      const ranked: { sym: string; price: number; mom: number }[] = [];
      for (const sym of allBars.keys()) {
        if (eligibleOn && !eligibleOn(date).has(sym)) continue; // PIT membership
        const b = barLookup.get(sym)?.get(date);
        if (!b) continue;
        const past = di >= 60 ? barLookup.get(sym)?.get(dates[di - 60]) : undefined;
        if (!past || past.close <= 0) continue;
        ranked.push({ sym, price: b.close, mom: (b.close - past.close) / past.close });
      }
      ranked.sort((a, b) => b.mom - a.mom);
      const top = ranked.slice(0, 16);
      const perPosition = cash / Math.max(top.length, 1);
      for (const c of top) {
        const qty = Math.floor(perPosition / c.price);
        if (qty <= 0) continue;
        cash -= qty * c.price;
        positions.set(c.sym, { qty, entryPrice: c.price });
        trades++;
      }
      isInvested = positions.size > 0;
    }

    // Record equity
    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  // Close remaining
  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    cash += pos.qty * (b?.close ?? pos.entryPrice);
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;

  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "tactical", label: "Tactical",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades,
    timeInMarket: Math.round((daysInMarket / (equityHistory.length - 1)) * 100),
  };
}

/**
 * Tactical Smart: same SPY exit logic but scores stocks at each re-entry
 */
function simulateTacticalSmart(
  allBars: Map<string, Bar[]>,
  spyBars: Bar[],
  splitDate: string,
  eligibleOn?: (dateKey: string) => Set<string>,
): ModeResult {
  const dateSet = new Set<string>();
  const barLookup = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars) {
    const lookup = new Map<string, Bar>();
    for (const b of bars) { const dk = b.date.split("T")[0]; dateSet.add(dk); lookup.set(dk, b); }
    barLookup.set(sym, lookup);
  }
  const spyLookup = new Map<string, Bar>();
  for (const b of spyBars) spyLookup.set(b.date.split("T")[0], b);

  const dates = [...dateSet].sort();
  const INITIAL = 10000;
  let cash = INITIAL;
  const positions = new Map<string, { qty: number; entryPrice: number }>();
  const equityHistory: number[] = [INITIAL];
  let trades = 0, daysInMarket = 0;
  let isInvested = false;
  const spyCloses: number[] = [];
  const windows = new Map<string, Bar[]>();

  // Warm rolling state over the full history, but only trade + record equity
  // from the test window onward — matches the GA's held-out segment (true OOS).
  let testStartIdx = dates.findIndex((d) => d >= splitDate);
  if (testStartIdx < 0) testStartIdx = 0;

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di];
    const spyBar = spyLookup.get(date);
    if (spyBar) spyCloses.push(spyBar.close);

    // Update rolling windows for signal scoring
    for (const sym of allBars.keys()) {
      const bar = barLookup.get(sym)?.get(date);
      if (!bar) continue;
      let w = windows.get(sym);
      if (!w) { w = []; windows.set(sym, w); }
      w.push(bar);
      if (w.length > 90) w.shift();
    }

    if (di < testStartIdx) continue; // warm-up only — no trading/equity

    if (isInvested) daysInMarket++;

    const sma20 = spyCloses.length >= 20 ? spyCloses.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
    const sma50 = spyCloses.length >= 50 ? spyCloses.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
    const spyPrice = spyCloses.length > 0 ? spyCloses[spyCloses.length - 1] : 0;

    // EXIT: SPY below 20 SMA for 3 days
    if (isInvested && sma20 && spyPrice < sma20) {
      let belowCount = 0;
      for (let j = spyCloses.length - 3; j < spyCloses.length; j++) {
        if (j >= 0 && j < spyCloses.length) {
          const s = spyCloses.slice(Math.max(0, j - 19), j + 1);
          if (s.length >= 20 && spyCloses[j] < s.reduce((a, b) => a + b, 0) / s.length) belowCount++;
        }
      }
      if (belowCount >= 3) {
        for (const [sym, pos] of positions) {
          const b = barLookup.get(sym)?.get(date);
          cash += pos.qty * (b?.close ?? pos.entryPrice);
          trades++;
        }
        positions.clear();
        isInvested = false;
      }
    }

    // ENTRY: SPY above 50 SMA — score and rank stocks
    if (!isInvested && sma50 && spyPrice > sma50) {
      const scored: { symbol: string; score: number; price: number }[] = [];

      for (const sym of allBars.keys()) {
        if (eligibleOn && !eligibleOn(date).has(sym)) continue; // PIT membership
        const w = windows.get(sym);
        if (!w || w.length < 60) continue;
        const bar = barLookup.get(sym)?.get(date);
        if (!bar) continue;

        const analysis = analyzeBars(sym, [...w]);
        let score = 0;
        if (analysis.signal === "STRONG_BUY") score = 4;
        else if (analysis.signal === "BUY") score = 2;
        else if (analysis.signal === "HOLD") score = 0;
        else score = -2;

        score += analysis.confidence * 2;
        if (score > 0) scored.push({ symbol: sym, score, price: bar.close });
      }

      scored.sort((a, b) => b.score - a.score);
      const toBuy = scored.slice(0, 16);
      const perPosition = cash / Math.max(toBuy.length, 1);

      for (const { symbol, price } of toBuy) {
        const qty = Math.floor(perPosition / price);
        if (qty <= 0) continue;
        cash -= qty * price;
        positions.set(symbol, { qty, entryPrice: price });
        trades++;
      }
      isInvested = positions.size > 0;
    }

    let eq = cash;
    for (const [s, p] of positions) {
      const b = barLookup.get(s)?.get(date);
      eq += p.qty * (b?.close ?? p.entryPrice);
    }
    equityHistory.push(eq);
  }

  const lastDate = dates[dates.length - 1];
  for (const [sym, pos] of positions) {
    const b = barLookup.get(sym)?.get(lastDate);
    cash += pos.qty * (b?.close ?? pos.entryPrice);
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - INITIAL) / INITIAL) * 100;

  let peak = equityHistory[0], maxDD = 0;
  for (const v of equityHistory) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityHistory.length; i++) {
    returns.push((equityHistory[i] - equityHistory[i - 1]) / equityHistory[i - 1]);
  }
  const meanR = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  return {
    mode: "tactical-smart", label: "Tactical Smart",
    totalReturn: Math.round(totalReturn * 10) / 10,
    finalValue: Math.round(finalEquity),
    maxDrawdown: Math.round(maxDD * 10) / 10,
    sharpe: Math.round(sharpe * 100) / 100,
    trades,
    timeInMarket: Math.round((daysInMarket / (equityHistory.length - 1)) * 100),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tierFail = await checkTier(session.userId, "trader");
    if (tierFail) return tierFail;

  try {
    const provider = getMarketDataProvider();

    // Determine universe + train/test split from the active optimizer run (or
    // latest completed). All modes are then evaluated on the held-out TEST
    // window, so the comparison is genuinely out-of-sample and apples-to-apples
    // (no mode gets credit for in-sample tuning).
    let universe: string[] = TOP_50;
    let trainPct = 60;
    let eligibleOn: ((dateKey: string) => Set<string>) | undefined;
    try {
      const savedRun = await withTimeout(5000, async (tx) => {
        const [activeRun] = await tx
          .select({ universe: optimizationRuns.universe, trainPct: optimizationRuns.trainPct })
          .from(optimizationRuns)
          .where(and(eq(optimizationRuns.status, "complete"), eq(optimizationRuns.isActive, true)))
          .limit(1);
        if (activeRun) return activeRun;
        const [fallback] = await tx
          .select({ universe: optimizationRuns.universe, trainPct: optimizationRuns.trainPct })
          .from(optimizationRuns)
          .where(eq(optimizationRuns.status, "complete"))
          .orderBy(desc(optimizationRuns.completedAt))
          .limit(1);
        return fallback ?? null;
      });
      if (savedRun?.trainPct != null) trainPct = savedRun.trainPct;
      if (savedRun?.universe === "sp500") {
        // PIT membership: trade only then-index-members (union as the fetch
        // universe), removing the membership half of survivorship bias — same
        // basis the Top Runs card uses for the sp500 number.
        const membership = await getSP500MembershipResolver().catch(() => null);
        if (membership) { universe = membership.universe; eligibleOn = membership.eligibleOn; }
        else universe = SP500_SYMBOLS;
      } else if (savedRun?.universe === "top150") universe = TOP_150;
    } catch { /* use default top50 */ }

    // Fetch 5Y data for all stocks + SPY
    log.info({ universe: universe.length }, "Starting mode comparison backtest — fetching data");
    const allBars = new Map<string, Bar[]>();

    for (const sym of universe) {
      try {
        const bars = await Promise.race([
          provider.fetchBars(sym, 1825, "1d"),
          new Promise<Bar[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
        ]);
        if (bars.length > 200) allBars.set(sym, bars);
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 1)); // yield
    }

    const spyBars = await provider.fetchBars("SPY", 1825, "1d");

    // Build the unified train/test split once; every mode is scored on the
    // test window so the table is out-of-sample. splitDate is the first date
    // of the held-out segment (empty universe → "" degrades to full period).
    const portfolioData = buildPortfolioData(allBars, trainPct);
    const splitDate = portfolioData.dates[portfolioData.trainEnd]
      ?? portfolioData.dates[portfolioData.dates.length - 1]
      ?? "";

    // SPY buy-and-hold — over the test window only (apples-to-apples with the
    // other modes, which now trade only the held-out segment).
    const spyTest = spyBars.filter((b) => b.date.split("T")[0] >= splitDate);
    const spyBase = spyTest[0];
    const spyReturn = spyTest.length > 1 && spyBase
      ? ((spyTest[spyTest.length - 1].close - spyBase.close) / spyBase.close) * 100
      : 0;
    let spyPeak = 10000, spyMaxDD = 0;
    const spyEquity = spyBase ? spyTest.map((b) => 10000 * (b.close / spyBase.close)) : [];
    for (const v of spyEquity) {
      if (v > spyPeak) spyPeak = v;
      const dd = ((spyPeak - v) / spyPeak) * 100;
      if (dd > spyMaxDD) spyMaxDD = dd;
    }

    log.info({ symbols: allBars.size, spyBars: spyBars.length }, "Data fetched, running backtests");

    // Get active optimizer params (or latest completed). Used to drive
    // both the legacy simulateSignalStrategy fallback (tactical/tactical-
    // smart still call it) AND the GA-faithful portfolioBacktest below.
    let optimizedParams: StrategyParams = STRATEGY_PRESETS.optimized;
    let optimizedExtra: OptimizerExtraParams = {};
    // PR 26 (2026-05-27): also build the GA's OptimizableParams shape so we
    // can call portfolioBacktest directly. The previous code path passed
    // only a subset (stop/TP/trail) to simulateSignalStrategy — same params
    // but a DIFFERENT simulator → wildly different numbers vs Top Runs.
    let gaParams: OptimizableParams | null = null;
    let gaParamsSource: "active_run" | "latest_run" | "defaults" = "defaults";
    // The run's STORED out-of-sample metrics. The Optimized row uses these
    // directly so it always equals the Top Runs card — re-simulating here
    // diverged (different fresh data/split → 948% vs the run's 549% holdout).
    let storedTestReturn: number | null = null;
    let storedTestSharpe: number | null = null;
    let storedTestMaxDrawdown: number | null = null;
    let storedTestTradeCount: number | null = null;
    let storedTestAvgPositions: number | null = null;
    try {
      const sel = {
        bestParams: optimizationRuns.bestParams,
        testReturn: optimizationRuns.bestTestReturn,
        testSharpe: optimizationRuns.testSharpe,
        testMaxDrawdown: optimizationRuns.testMaxDrawdown,
        testTradeCount: optimizationRuns.testTradeCount,
        testAvgPositions: optimizationRuns.testAvgPositions,
      };
      const run = await withTimeout(5000, async (tx) => {
        const [activeParams] = await tx.select(sel)
          .from(optimizationRuns)
          .where(and(eq(optimizationRuns.status, "complete"), eq(optimizationRuns.isActive, true)))
          .limit(1);
        if (activeParams) return { row: activeParams, source: "active_run" as const };
        const [fallback] = await tx.select(sel)
          .from(optimizationRuns).where(eq(optimizationRuns.status, "complete"))
          .orderBy(desc(optimizationRuns.completedAt)).limit(1);
        return fallback ? { row: fallback, source: "latest_run" as const } : null;
      });
      if (run?.row.bestParams) {
        storedTestReturn = run.row.testReturn ?? null;
        storedTestSharpe = run.row.testSharpe ?? null;
        storedTestMaxDrawdown = run.row.testMaxDrawdown ?? null;
        storedTestTradeCount = run.row.testTradeCount ?? null;
        storedTestAvgPositions = run.row.testAvgPositions ?? null;
        const p = run.row.bestParams as Record<string, number>;
        if (p.stopLossPct != null) {
          optimizedParams = {
            stopLossPct: p.stopLossPct,
            // Old runs have takeProfitPct; new runs have takeProfitAtrMult instead.
            // High fallback ensures fixed TP never fires when ATR-based is active.
            takeProfitPct: p.takeProfitPct ?? 5.0,
            trailingStopPct: p.trailingStopPct ?? 0.09,
            holdPeriod: Math.round(p.holdPeriod ?? 43),
          };
          optimizedExtra = {
            rsThreshold: p.rsThreshold ?? -0.05,
            takeProfitAtrMult: p.takeProfitAtrMult ?? undefined,
            signalParams: p.emaFast != null && p.emaSlow != null ? {
              emaFast: Math.round(p.emaFast),
              emaSlow: Math.round(p.emaSlow),
              rsiOversold: Math.round(p.rsiOversold ?? 30),
              rsiOverbought: Math.round(p.rsiOverbought ?? 70),
            } : undefined,
          };
          // Build full OptimizableParams shape for portfolioBacktest.
          // All fields required — fall back to sensible defaults for runs
          // saved before the GA's param set was finalized.
          if (
            p.takeProfitAtrMult != null &&
            p.emaFast != null &&
            p.emaSlow != null &&
            p.rsiOversold != null &&
            p.rsiOverbought != null &&
            p.rsThreshold != null
          ) {
            gaParams = {
              stopLossPct: p.stopLossPct,
              takeProfitAtrMult: p.takeProfitAtrMult,
              trailingStopPct: p.trailingStopPct ?? 0.09,
              holdPeriod: Math.round(p.holdPeriod ?? 43),
              emaFast: Math.round(p.emaFast),
              emaSlow: Math.round(p.emaSlow),
              rsiOversold: Math.round(p.rsiOversold),
              rsiOverbought: Math.round(p.rsiOverbought),
              rsThreshold: p.rsThreshold,
            };
            gaParamsSource = run.source;
          }
        }
      }
    } catch { /* use default */ }

    // Run all modes
    const results: ModeResult[] = [];

    // SPY buy-and-hold
    results.push({
      mode: "spy", label: "SPY Buy & Hold",
      totalReturn: Math.round(spyReturn * 10) / 10,
      finalValue: Math.round(10000 * (1 + spyReturn / 100)),
      maxDrawdown: Math.round(spyMaxDD * 10) / 10,
      sharpe: 0, trades: 1, timeInMarket: 100,
    });

    // Signal-based modes — only the ones a user can actually pick.
    // conservative / moderate / aggressive remain in STRATEGY_PRESETS
    // because the adaptive regime classifier maps to them at runtime,
    // but they aren't directly selectable so showing them in the
    // comparison would surface unreachable choices.
    //
    // (Tactical, Tactical Smart, and Optimized are computed below
    // with their respective simulators.)

    // Optimized (GA) — runs the SAME simulator the GA itself uses
    // (portfolioBacktest), so this row's number matches what Top Runs
    // shows and what the live engine actually does. Pre-PR-26 this called
    // simulateSignalStrategy, a parallel simulator that diverged because
    // it predated PR 14/16's graduation + swap-sell + multi-obj fitness.
    if (gaParams && storedTestReturn != null) {
      // Use the run's STORED out-of-sample metrics so this row is identical to
      // the Top Runs card. Re-simulating here recomputed on the comparison's
      // own freshly-fetched data + split, which diverged from the run's actual
      // holdout (e.g. 948% vs the stored 549%). Per-segment trades / time-in-
      // market aren't stored, so they render as "—".
      results.push({
        mode: "optimized",
        label: "Optimized (GA)",
        totalReturn: Math.round(storedTestReturn * 10) / 10,
        finalValue: Math.round(10000 * (1 + storedTestReturn / 100)),
        maxDrawdown: storedTestMaxDrawdown != null ? Math.round(storedTestMaxDrawdown * 10) / 10 : null,
        sharpe: storedTestSharpe != null ? Math.round(storedTestSharpe * 100) / 100 : null,
        trades: storedTestTradeCount,
        // Same avgPositions×10 heuristic the re-sim path uses, for consistency.
        timeInMarket: storedTestAvgPositions != null ? Math.min(100, Math.round(storedTestAvgPositions * 10)) : null,
      });
      log.info({ source: gaParamsSource, storedTestReturn }, "Optimized row: stored OOS metrics");
    } else if (gaParams) {
      // Older run with params but no stored test metrics — re-simulate the
      // held-out segment (less consistent, but better than nothing).
      const ga = portfolioBacktest(portfolioData, gaParams, "test", eligibleOn);
      const timeInMarket = Math.min(100, Math.round(ga.avgPositions * 10));
      results.push({
        mode: "optimized",
        label: "Optimized (GA)",
        totalReturn: Math.round(ga.totalReturn * 10) / 10,
        finalValue: Math.round(10000 * (1 + ga.totalReturn / 100)),
        maxDrawdown: Math.round(ga.maxDrawdown * 10) / 10,
        sharpe: Math.round(ga.sharpeRatio * 100) / 100,
        trades: ga.tradeCount,
        timeInMarket,
      });
      log.info(
        { source: gaParamsSource, totalReturn: ga.totalReturn, trades: ga.tradeCount },
        "Optimized row: re-simulated (no stored test metrics)",
      );
    } else {
      // No GA-tuned run available (or schema-incomplete) — fall back to
      // the legacy simulator with the partial params we have, labeled so
      // the user knows it's not GA-faithful.
      const optResult = simulateSignalStrategy(
        allBars, optimizedParams, 10, 0.10, optimizedExtra,
      );
      results.push({ ...optResult, mode: "optimized", label: "Optimized (defaults — no tuned run)" });
      log.warn(
        { gaParamsSource },
        "Optimized row: no GA params available, used STRATEGY_PRESETS.optimized via simulateSignalStrategy",
      );
    }
    await new Promise(r => setTimeout(r, 1));

    // Tactical
    const tactical = simulateTactical(allBars, spyBars, splitDate, eligibleOn);
    results.push(tactical);

    // Tactical Smart
    await new Promise(r => setTimeout(r, 1));
    const tacticalSmart = simulateTacticalSmart(allBars, spyBars, splitDate, eligibleOn);
    results.push(tacticalSmart);

    log.info("Mode comparison complete");

    const testBars = portfolioData.dates.length - portfolioData.trainEnd;
    const testYears = (testBars / 252).toFixed(1);
    return NextResponse.json(
      { results, period: `out-of-sample test window (~${testYears}y)`, startingCapital: 10000 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: msg }, "Mode comparison failed");
    return NextResponse.json({ error: "Comparison failed" }, { status: 500 });
  }
}
