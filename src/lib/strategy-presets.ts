export interface StrategyParams {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
}

export type PresetName =
  | "conservative" | "moderate" | "aggressive" | "optimized"
  | "day_trade" | "swing"
  | "tactical" | "tactical-smart";

export const STRATEGY_PRESETS: Record<PresetName, StrategyParams> = {
  conservative: {
    stopLossPct: 0.015,
    takeProfitPct: 0.02,
    trailingStopPct: 0.01,
    holdPeriod: 30,
  },
  moderate: {
    stopLossPct: 0.02,
    takeProfitPct: 0.03,
    trailingStopPct: 0.015,
    holdPeriod: 20,
  },
  aggressive: {
    stopLossPct: 0.03,
    takeProfitPct: 0.05,
    trailingStopPct: 0.025,
    holdPeriod: 15,
  },
  optimized: {
    stopLossPct: 0.085,
    takeProfitPct: 0.369,
    trailingStopPct: 0.126,
    holdPeriod: 33,
  },
  day_trade: {
    stopLossPct: 0.01,
    takeProfitPct: 0.015,
    trailingStopPct: 0.008,
    holdPeriod: 1,
  },
  swing: {
    stopLossPct: 0.025,
    takeProfitPct: 0.06,
    trailingStopPct: 0.02,
    holdPeriod: 40,
  },
  tactical: {
    stopLossPct: 0.025,
    takeProfitPct: 0.06,
    trailingStopPct: 0.02,
    holdPeriod: 999,
  },
  "tactical-smart": {
    stopLossPct: 0.025,
    takeProfitPct: 0.06,
    trailingStopPct: 0.02,
    holdPeriod: 999,
  },
};

export const PRESET_LABELS: Record<PresetName, { label: string; description: string }> = {
  conservative: { label: "Conservative", description: "Tight stops, modest targets" },
  moderate:     { label: "Moderate",     description: "Balanced risk/reward" },
  aggressive:   { label: "Aggressive",   description: "Wider stops, larger targets" },
  optimized:    { label: "Optimized",    description: "GA-tuned params from latest optimizer run" },
  day_trade:    { label: "Day Trade",    description: "Intraday, quick exits" },
  swing:        { label: "Swing",        description: "Multi-week holds" },
  tactical:     { label: "Tactical",     description: "Top 50 S&P, exit on SPY weakness" },
  "tactical-smart": { label: "Tactical Smart", description: "SPY timing + active stock rotation + crash protection" },
};
