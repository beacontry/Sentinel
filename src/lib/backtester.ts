import type { Bar } from "@/types";
import { analyzeBars } from "./indicators/analyzer";
import { detectMarketRegime, type AdaptiveTarget } from "./market-regime";
import { STRATEGY_PRESETS } from "./strategy-presets";
import { BACKTEST_COSTS } from "./config";

// Trading-cost model — shared with the optimizer's portfolioBacktest so the
// two backtesters stay in parity (see config.ts § BACKTEST_COSTS).
const SLIP = BACKTEST_COSTS.slippageBps / 10000; // per-side slippage fraction
const COMMISSION = BACKTEST_COSTS.commissionPerFill;
import {
  type EngineMode,
  getGraduationMode,
  shouldGraduateExit,
  promoteToGraduationFloor,
} from "./trading-engine";

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  signal: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  wasCorrect: boolean;
  exitReason: string;
  shares: number;
}

export interface BacktestResult {
  symbol: string;
  trades: BacktestTrade[];
  equityCurve: { date: string; value: number }[];
  totalReturn: number;
  winRate: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  sharpeRatio: number;
  // 2026-05-12 — extra risk-adjusted metrics
  sortinoRatio: number;
  calmarRatio: number;
  marRatio: number;
  totalTrades: number;
  /**
   * When `mode === "adaptive"` and marketContext was supplied, this captures
   * which underlying mode adaptive was running at each bar. Used by the
   * /backtest/mode-compare UI to visualize regime swings.
   */
  modeTimeline?: { date: string; mode: AdaptiveTarget }[];
}

/**
 * Market-wide context bars for regime-switching backtests. SPY drives the
 * trend/SMA50 inputs; ^VIX drives the volatility input. Both must align in
 * date with the target symbol's bars. The backtester gracefully handles
 * missing-date entries (skips that bar's regime swap, sticks with previous).
 */
export interface BacktestMarketContext {
  spyBars: Bar[];
  vixBars: Bar[];
}

/** Maps a base engine mode to its corresponding BacktestConfig. Accepts
 *  AdaptiveTarget OR `"tactical"`. (Tactical isn't recommendable by the
 *  regime classifier but the backtest mode-compare passes it in via the
 *  `mode as AdaptiveTarget` cast below; keep the union explicit here.) */
function configForMode(mode: AdaptiveTarget | "tactical"): BacktestConfig {
  // `tactical` maps to the swing preset (matches trading-engine's modePresetMap).
  const preset =
    mode === "tactical"
      ? STRATEGY_PRESETS.swing
      : STRATEGY_PRESETS[mode];
  return {
    stopLossPct: preset.stopLossPct,
    takeProfitPct: preset.takeProfitPct,
    trailingStopPct: preset.trailingStopPct,
    // Sizing constants are not part of StrategyParams — keep at defaults.
    maxPositionSize: DEFAULT_CONFIG.maxPositionSize,
    maxSingleTradeLoss: DEFAULT_CONFIG.maxSingleTradeLoss,
  };
}

export interface BacktestConfig {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxPositionSize: number;
  maxSingleTradeLoss: number;
}

const DEFAULT_CONFIG: BacktestConfig = {
  stopLossPct: 0.02,
  takeProfitPct: 0.03,
  trailingStopPct: 0.015,
  maxPositionSize: 100,
  maxSingleTradeLoss: 100,
};

/**
 * Run a backtest that mirrors the live trader's risk rules:
 * - Long-only (BUY opens, SELL closes existing position)
 * - Stop-loss, trailing stop, and take-profit exits
 * - Risk-based position sizing (max loss per trade / stop distance)
 * - Hold period is a maximum — exits early on stops/TP/sell signals
 */
export function runBacktest(
  symbol: string,
  bars: Bar[],
  windowSize: number = 100,
  holdPeriod: number = 20,
  stepSize: number = 10,
  config: Partial<BacktestConfig> = {},
  /**
   * Optional: pin the backtest to a specific engine mode's preset. When
   * `mode === "adaptive"`, you MUST also pass `marketContext` so the
   * regime classifier can switch effective mode per bar. Otherwise this
   * throws.
   *
   * For non-adaptive modes, the preset's stop/TP/trail override
   * DEFAULT_CONFIG; the `config` param is layered on top for any
   * fine-grained overrides.
   */
  mode?: EngineMode,
  marketContext?: BacktestMarketContext
): BacktestResult {
  // Validate adaptive prerequisites up front so the caller sees a clear
  // error instead of a silent fall-through to default config.
  if (mode === "adaptive" && !marketContext) {
    throw new Error(
      "Adaptive backtest requires marketContext: { spyBars, vixBars }. " +
      "Without market-wide bars, the regime classifier has nothing to read."
    );
  }

  // Map mode → preset (only for non-adaptive modes; adaptive resolves
  // per-bar inside the loop). User-supplied `config` still wins on conflict
  // so per-strategy overrides remain supported.
  const baseCfg: BacktestConfig =
    mode && mode !== "adaptive" && mode !== "tactical-smart"
      ? configForMode(mode as AdaptiveTarget)
      : DEFAULT_CONFIG;
  const cfg = { ...baseCfg, ...config };

  // Build SPY-date lookup map for fast per-bar regime queries (adaptive only).
  // Map keyed by ISO-date string for O(1) lookup.
  const spyByDate = new Map<string, Bar>();
  const vixByDate = new Map<string, Bar>();
  if (marketContext) {
    for (const b of marketContext.spyBars) spyByDate.set(b.date, b);
    for (const b of marketContext.vixBars) vixByDate.set(b.date, b);
  }

  // Effective config used right now. For adaptive: re-evaluated per bar.
  let effectiveCfg: BacktestConfig = cfg;
  let lastEffectiveMode: AdaptiveTarget | null = null;
  const modeTimeline: { date: string; mode: AdaptiveTarget }[] = [];

  const trades: BacktestTrade[] = [];
  const initialCash = 10000;
  let cash = initialCash;
  const equityCurve: { date: string; value: number }[] = [];

  let position: {
    entryPrice: number;
    entryDate: string;
    entryIdx: number;
    signal: string;
    shares: number;
    peakPrice: number;
    /**
     * Mutable fixed-stop floor. Initialized to entry × (1 - stopLossPct),
     * promoted upward by take-profit graduation (entry × 1.30) when enabled
     * for the active mode. Mirrors `TrackedPosition.stopLoss` in the live
     * engine — having the field here lets the backtester model graduation
     * behavior with parity (PR 16, 2026-05-26).
     */
    stopLoss: number;
  } | null = null;

  for (let i = windowSize; i < bars.length; i++) {
    const bar = bars[i];

    // ── Adaptive: refresh effective config based on regime at this bar ──
    if (mode === "adaptive" && marketContext) {
      const spyAtBar = spyByDate.get(bar.date);
      const vixAtBar = vixByDate.get(bar.date);
      if (spyAtBar && vixAtBar) {
        // Need 50 bars of SPY history for SMA50; pull from spyBars by date
        // (best-effort — if we're too early in the SPY series, skip the
        // regime swap and keep current effectiveCfg).
        const spyIdx = marketContext.spyBars.findIndex((b) => b.date === bar.date);
        if (spyIdx >= 50) {
          const spy50 = marketContext.spyBars.slice(spyIdx - 50, spyIdx);
          const spyMA50 = spy50.reduce((s, b) => s + b.close, 0) / 50;
          const spyMA200 = spyIdx >= 200
            ? marketContext.spyBars.slice(spyIdx - 200, spyIdx).reduce((s, b) => s + b.close, 0) / 200
            : spyMA50;
          const report = detectMarketRegime({
            vix: vixAtBar.close,
            spyPrice: spyAtBar.close,
            spyMA50,
            spyMA200,
            // breadth omitted — backtest path
          });
          // Only swap config if the recommended mode actually changed.
          if (report.recommendedMode !== lastEffectiveMode) {
            effectiveCfg = { ...configForMode(report.recommendedMode), ...config };
            lastEffectiveMode = report.recommendedMode;
            modeTimeline.push({ date: bar.date, mode: report.recommendedMode });
          }
        }
      }
    }

    // Re-bind the trailing config used by exit logic to the (possibly
    // adaptive) effectiveCfg. For non-adaptive modes, effectiveCfg === cfg
    // forever, so this is a no-op.
    const activeCfg = mode === "adaptive" ? effectiveCfg : cfg;

    // ── In a position: check exits on every bar ──
    if (position) {
      if (bar.high > position.peakPrice) {
        position.peakPrice = bar.high;
      }

      let exitPrice: number | null = null;
      let exitReason = "";

      // Profit-based trailing stop — exponential decay toward 2% floor.
      // Uses activeCfg so adaptive's per-bar config swap actually drives the
      // trail and stop on adaptive backtests.
      const profitPct = (position.peakPrice - position.entryPrice) / position.entryPrice;
      const dynTrailPct = profitPct > 0
        ? 0.02 + (activeCfg.trailingStopPct - 0.02) * Math.exp(-3 * profitPct)
        : activeCfg.trailingStopPct;

      // position.stopLoss can be promoted above the entry-time fixed floor
      // by take-profit graduation (see below). Always uses the higher of
      // (a) the position's current stop and (b) the dynamic trail.
      const trailingStop = position.peakPrice * (1 - dynTrailPct);
      const effectiveStop = Math.max(position.stopLoss, trailingStop);

      // Resolve which mode's MODE_GRADUATION_DEFAULT applies. For adaptive,
      // use the currently-active base mode (the same getActiveMode pattern
      // the live engine uses). For non-adaptive, just use `mode`.
      const modeForGraduation: EngineMode | null =
        mode === "adaptive"
          ? (lastEffectiveMode ?? "moderate") // fallback before first regime swap
          : (mode ?? null);
      const graduationEnabled =
        modeForGraduation != null && getGraduationMode(modeForGraduation) === "enabled";

      // Take-profit graduation gate. Runs BEFORE the stop/trail checks
      // because graduation can promote position.stopLoss higher, which
      // then feeds into the stop check below. When graduation is disabled,
      // hard take-profit fires as before.
      const tpLevel = position.entryPrice * (1 + activeCfg.takeProfitPct);
      if (graduationEnabled && bar.high >= tpLevel) {
        promoteToGraduationFloor(position); // mutates position.stopLoss to max(current, entry × 1.30)

        // Check weakness signals against the analyzer's indicators
        // window. Note: shouldGraduateExit needs >=20 bars for the
        // 20-bar volume baseline. Cheap when graduationEnabled is rare
        // (only above takeProfit); skipped otherwise.
        const windowBars = bars.slice(Math.max(0, i - 100), i + 1);
        if (windowBars.length >= 20) {
          const analysis = analyzeBars(symbol, windowBars);
          const indicators = analysis.indicators as unknown as Record<string, number | null | undefined>;
          const graduation = shouldGraduateExit(position, windowBars, indicators, bar.close);
          if (graduation) {
            exitPrice = bar.close;
            exitReason = `graduated_exit`;
          }
          // Otherwise: hold. Don't fire the hard take_profit exit below.
        }
      }

      // 1. Stop hit (check low against effective stop) — runs whether or
      // not graduation fired above, because the locked +30% floor can be
      // hit on the same bar that price gapped above takeProfit. The
      // effectiveStop reads the (possibly graduation-promoted) stopLoss.
      if (!exitPrice && bar.low <= effectiveStop) {
        exitPrice = parseFloat(effectiveStop.toFixed(2));
        exitReason = trailingStop >= position.stopLoss ? "trailing_stop" : "stop_loss";
      }

      // 2. Take-profit hit (hard exit) — ONLY when graduation is disabled.
      // When graduation IS enabled, take-profit triggers the graduation
      // block above instead of this hard exit.
      if (!exitPrice && !graduationEnabled) {
        if (bar.high >= tpLevel) {
          exitPrice = parseFloat(tpLevel.toFixed(2));
          exitReason = "take_profit";
        }
      }

      // 3. SELL signal closes position (only check on step boundaries)
      if (!exitPrice && (i - windowSize) % stepSize === 0) {
        const windowBars = bars.slice(i - windowSize, i);
        if (windowBars.length >= 30) {
          const result = analyzeBars(symbol, windowBars);
          if (result.signal === "SELL" || result.signal === "STRONG_SELL") {
            exitPrice = bar.close;
            exitReason = "sell_signal";
          }
        }
      }

      // 4. Hold period expired — close at market
      if (!exitPrice && (i - position.entryIdx) >= holdPeriod) {
        exitPrice = bar.close;
        exitReason = "hold_expired";
      }

      if (exitPrice !== null) {
        // Sells fill below the trigger level (slippage); pay commission. Record
        // the realized fill so exitPrice and returnPct stay consistent.
        const exitFill = exitPrice * (1 - SLIP);
        const returnPct = ((exitFill - position.entryPrice) / position.entryPrice) * 100;
        cash += position.shares * exitFill - COMMISSION;

        trades.push({
          entryDate: position.entryDate,
          exitDate: bar.date,
          signal: position.signal,
          entryPrice: position.entryPrice,
          exitPrice: parseFloat(exitFill.toFixed(2)),
          returnPct,
          wasCorrect: returnPct > 0,
          exitReason,
          shares: position.shares,
        });

        equityCurve.push({ date: bar.date, value: cash });
        position = null;
      }

      continue;
    }

    // ── Not in position: evaluate signals on step boundaries ──
    if ((i - windowSize) % stepSize !== 0) continue;

    const windowBars = bars.slice(i - windowSize, i);
    if (windowBars.length < 30) continue;

    const result = analyzeBars(symbol, windowBars);

    // Long-only: only open on BUY/STRONG_BUY
    if (result.signal !== "BUY" && result.signal !== "STRONG_BUY") continue;

    // Buys fill above the close (slippage); entryPrice is the cost basis, so
    // stop/TP levels and returns all derive from the real fill.
    const entryPrice = bar.close * (1 + SLIP);

    // Risk-based position sizing: max_single_trade_loss / stop_distance.
    // activeCfg honors adaptive's per-bar regime swap.
    const stopDistance = entryPrice * activeCfg.stopLossPct;
    if (stopDistance <= 0) continue;
    const riskBasedShares = Math.floor(activeCfg.maxSingleTradeLoss / stopDistance);
    const affordableShares = Math.floor(cash / entryPrice);
    const shares = Math.min(riskBasedShares, activeCfg.maxPositionSize, affordableShares);

    if (shares <= 0) continue;

    cash -= shares * entryPrice + COMMISSION;
    position = {
      entryPrice,
      entryDate: bar.date,
      entryIdx: i,
      signal: result.signal,
      shares,
      peakPrice: entryPrice,
      stopLoss: entryPrice * (1 - activeCfg.stopLossPct),
    };
  }

  // Close any remaining position at end of data (liquidate at the last close,
  // net of exit slippage + commission, same as any other exit).
  if (position) {
    const lastBar = bars[bars.length - 1];
    const exitFill = lastBar.close * (1 - SLIP);
    const returnPct = ((exitFill - position.entryPrice) / position.entryPrice) * 100;
    cash += position.shares * exitFill - COMMISSION;

    trades.push({
      entryDate: position.entryDate,
      exitDate: lastBar.date,
      signal: position.signal,
      entryPrice: position.entryPrice,
      exitPrice: parseFloat(exitFill.toFixed(2)),
      returnPct,
      wasCorrect: returnPct > 0,
      exitReason: "end_of_data",
      shares: position.shares,
    });

    equityCurve.push({ date: lastBar.date, value: cash });
  }

  const winCount = trades.filter((t) => t.wasCorrect).length;
  const lossCount = trades.length - winCount;
  const winRate = trades.length > 0 ? winCount / trades.length : 0;
  const totalReturn = ((cash - initialCash) / initialCash) * 100;

  // Max drawdown from equity curve
  const allEquity = [initialCash, ...equityCurve.map((e) => e.value)];
  let peak = allEquity[0];
  let maxDrawdown = 0;
  for (const val of allEquity) {
    if (val > peak) peak = val;
    const drawdown = ((peak - val) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Sharpe ratio from portfolio-level returns
  const portfolioReturns: number[] = [];
  for (let i = 1; i < allEquity.length; i++) {
    portfolioReturns.push((allEquity[i] - allEquity[i - 1]) / allEquity[i - 1]);
  }
  const meanReturn = portfolioReturns.length > 0
    ? portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length
    : 0;
  const stdDev = portfolioReturns.length > 1
    ? Math.sqrt(
        portfolioReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) /
          (portfolioReturns.length - 1)
      )
    : 0;
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;

  // Sortino — like Sharpe but downside-only stdev. Same numerator
  // (mean return), denominator built from negative returns only.
  // Sample size in the denominator is the count of negative days, not
  // the count of all days (matches the most common Sortino formulation).
  const downside = portfolioReturns.filter((r) => r < 0);
  const downsideStdDev =
    downside.length > 1
      ? Math.sqrt(
          downside.reduce((sum, r) => sum + r * r, 0) / downside.length
        )
      : 0;
  const sortinoRatio =
    downsideStdDev > 0 ? (meanReturn / downsideStdDev) * Math.sqrt(252) : 0;

  // Calmar — annualized return / max drawdown. Days-to-years scaling
  // uses 252 trading days. Drawdown is already in percent so we keep
  // the same units on both sides (drop totalReturn's percent normalization
  // by dividing by 100 nowhere, just match).
  const tradingDays = Math.max(1, portfolioReturns.length);
  const annualizedReturn =
    portfolioReturns.length > 0 && initialCash > 0
      ? (Math.pow(cash / initialCash, 252 / tradingDays) - 1) * 100
      : 0;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // MAR — total return over the full track record / max drawdown. Same
  // shape as Calmar but no annualization (useful when the backtest
  // window is short and annualizing would extrapolate aggressively).
  const marRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : 0;

  return {
    symbol,
    trades,
    equityCurve: [{ date: bars[0].date, value: initialCash }, ...equityCurve],
    totalReturn,
    winRate,
    winCount,
    lossCount,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    marRatio,
    totalTrades: trades.length,
    // Only populated for adaptive backtests; non-adaptive runs stay clean.
    ...(mode === "adaptive" && marketContext ? { modeTimeline } : {}),
  };
}
