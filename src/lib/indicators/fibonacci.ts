import type { Bar } from "@/types";

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  swingHighDate: string;
  swingLowDate: string;
  levels: { ratio: number; label: string; price: number }[];
}

const FIB_RATIOS = [
  { ratio: 0, label: "0%" },
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1, label: "100%" },
];

/**
 * Find swing high: bar whose high is greater than the N bars before and after it.
 */
function findSwingHigh(bars: Bar[], margin: number): { price: number; date: string; index: number } | null {
  let best: { price: number; date: string; index: number } | null = null;

  for (let i = margin; i < bars.length - margin; i++) {
    let isSwing = true;
    for (let j = 1; j <= margin; j++) {
      if (bars[i].high <= bars[i - j].high || bars[i].high <= bars[i + j].high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing && (!best || bars[i].high > best.price)) {
      best = { price: bars[i].high, date: bars[i].date, index: i };
    }
  }

  return best;
}

/**
 * Find swing low: bar whose low is less than the N bars before and after it.
 */
function findSwingLow(bars: Bar[], margin: number): { price: number; date: string; index: number } | null {
  let best: { price: number; date: string; index: number } | null = null;

  for (let i = margin; i < bars.length - margin; i++) {
    let isSwing = true;
    for (let j = 1; j <= margin; j++) {
      if (bars[i].low >= bars[i - j].low || bars[i].low >= bars[i + j].low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing && (!best || bars[i].low < best.price)) {
      best = { price: bars[i].low, date: bars[i].date, index: i };
    }
  }

  return best;
}

/**
 * Calculate Fibonacci retracement levels from recent swing high/low.
 * Returns null if swings can't be detected (not enough data or no clear swings).
 */
export function calculateFibLevels(bars: Bar[], lookback = 50): FibonacciLevels | null {
  const recentBars = bars.slice(-lookback);
  if (recentBars.length < 10) return null;

  const margin = Math.min(5, Math.floor(recentBars.length / 4));
  const swingHigh = findSwingHigh(recentBars, margin);
  const swingLow = findSwingLow(recentBars, margin);

  if (!swingHigh || !swingLow) return null;
  if (swingHigh.price <= swingLow.price) return null;

  const range = swingHigh.price - swingLow.price;

  // Direction (audit #67): if the swing LOW is more recent than the swing HIGH,
  // price is in a downtrend → project retracement levels UP from the low;
  // otherwise (uptrend) retrace DOWN from the high. The old code always
  // retraced from the high, mislabeling downtrend levels.
  const downtrend = swingLow.date > swingHigh.date;
  const levels = FIB_RATIOS.map(({ ratio, label }) => ({
    ratio,
    label,
    price: downtrend ? swingLow.price + ratio * range : swingHigh.price - ratio * range,
  }));

  return {
    swingHigh: swingHigh.price,
    swingLow: swingLow.price,
    swingHighDate: swingHigh.date,
    swingLowDate: swingLow.date,
    levels,
  };
}
