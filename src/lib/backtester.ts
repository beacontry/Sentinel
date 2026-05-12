import type { Bar } from "@/types";
import { analyzeBars } from "./indicators/analyzer";

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
  config: Partial<BacktestConfig> = {}
): BacktestResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
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
  } | null = null;

  for (let i = windowSize; i < bars.length; i++) {
    const bar = bars[i];

    // ── In a position: check exits on every bar ──
    if (position) {
      if (bar.high > position.peakPrice) {
        position.peakPrice = bar.high;
      }

      let exitPrice: number | null = null;
      let exitReason = "";

      // Profit-based trailing stop — exponential decay toward 2% floor
      const profitPct = (position.peakPrice - position.entryPrice) / position.entryPrice;
      const dynTrailPct = profitPct > 0
        ? 0.02 + (cfg.trailingStopPct - 0.02) * Math.exp(-3 * profitPct)
        : cfg.trailingStopPct;

      const fixedStop = position.entryPrice * (1 - cfg.stopLossPct);
      const trailingStop = position.peakPrice * (1 - dynTrailPct);
      const effectiveStop = Math.max(fixedStop, trailingStop);

      // 1. Stop hit (check low against effective stop)
      if (bar.low <= effectiveStop) {
        exitPrice = parseFloat(effectiveStop.toFixed(2));
        exitReason = trailingStop >= fixedStop ? "trailing_stop" : "stop_loss";
      }

      // 2. Take-profit hit
      if (!exitPrice) {
        const tpLevel = position.entryPrice * (1 + cfg.takeProfitPct);
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
        const returnPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
        cash += position.shares * exitPrice;

        trades.push({
          entryDate: position.entryDate,
          exitDate: bar.date,
          signal: position.signal,
          entryPrice: position.entryPrice,
          exitPrice,
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

    const entryPrice = bar.close;

    // Risk-based position sizing: max_single_trade_loss / stop_distance
    const stopDistance = entryPrice * cfg.stopLossPct;
    if (stopDistance <= 0) continue;
    const riskBasedShares = Math.floor(cfg.maxSingleTradeLoss / stopDistance);
    const affordableShares = Math.floor(cash / entryPrice);
    const shares = Math.min(riskBasedShares, cfg.maxPositionSize, affordableShares);

    if (shares <= 0) continue;

    cash -= shares * entryPrice;
    position = {
      entryPrice,
      entryDate: bar.date,
      entryIdx: i,
      signal: result.signal,
      shares,
      peakPrice: entryPrice,
    };
  }

  // Close any remaining position at end of data
  if (position) {
    const lastBar = bars[bars.length - 1];
    const exitPrice = lastBar.close;
    const returnPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    cash += position.shares * exitPrice;

    trades.push({
      entryDate: position.entryDate,
      exitDate: lastBar.date,
      signal: position.signal,
      entryPrice: position.entryPrice,
      exitPrice,
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
  };
}
