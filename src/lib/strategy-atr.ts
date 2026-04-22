import { ATR } from "./indicators/atr";
import { getMarketDataProvider } from "./market-data";
import type { StrategyParams } from "./strategy-presets";

export interface ATRTuningResult {
  params: StrategyParams;
  atr: number;
  atrPct: number;
  currentPrice: number;
}

/**
 * Compute ATR-based strategy params for a symbol.
 * Uses 90 days of daily bars to calculate ATR (matching screener lookback),
 * then derives stop/TP/trailing as multiples of ATR percentage.
 */
export async function computeATRStrategy(symbol: string): Promise<ATRTuningResult> {
  const provider = getMarketDataProvider();
  const bars = await provider.fetchBars(symbol, 90, "1d");
  if (bars.length < 15) throw new Error("Not enough data to compute ATR");

  const atrCalc = new ATR(14);
  for (const bar of bars) atrCalc.update(bar);
  const atr = atrCalc.value();
  if (atr === null) throw new Error("ATR calculation failed");

  const currentPrice = bars[bars.length - 1].close;
  const atrPct = atr / currentPrice;

  return {
    params: {
      stopLossPct: parseFloat((atrPct * 1.5).toFixed(4)),
      takeProfitPct: parseFloat((atrPct * 3.0).toFixed(4)),
      trailingStopPct: parseFloat((atrPct * 1.2).toFixed(4)),
      holdPeriod: 20,
    },
    atr,
    atrPct,
    currentPrice,
  };
}
