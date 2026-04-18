export interface StrategyParams {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
}

export type PresetName = "conservative" | "moderate" | "aggressive" | "day_trade" | "swing";

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
};

export const PRESET_LABELS: Record<PresetName, { label: string; description: string }> = {
  day_trade:    { label: "Day Trade",    description: "Intraday, quick exits" },
  conservative: { label: "Conservative", description: "Tight stops, modest targets" },
  moderate:     { label: "Moderate",     description: "Balanced risk/reward" },
  aggressive:   { label: "Aggressive",   description: "Wider stops, larger targets" },
  swing:        { label: "Swing",        description: "Multi-week holds" },
};
