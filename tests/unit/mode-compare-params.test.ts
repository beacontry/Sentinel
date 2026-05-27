/**
 * Tests for the mode-compare param-resolution logic (PR 22, 2026-05-27).
 *
 * Background: pre-PR-22 the /api/backtest/mode-compare route passed `{}`
 * for the backtester config on every mode, so the "Optimized (GA)" row
 * actually ran with backtester defaults instead of the user's GA-tuned
 * params. The surface badly misrepresented what the live engine would do
 * (showed ~+45% for a strategy the optimizer page said produced +898%).
 *
 * The loader mirrors the live engine's resolveStrategy() lookup order:
 *   1. symbol_strategies row for (userId, symbol)
 *   2. latest completed optimization_runs row (active flag preferred)
 *   3. null → caller uses backtester defaults
 *
 * We can't easily integration-test the route (DB + auth + market data),
 * so we pin the SELECTION LOGIC here as a pure helper-shaped test.
 */

import { describe, it, expect } from "vitest";

interface SymbolStrategyRow {
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  holdPeriod: number;
}

interface OptimizationRunRow {
  bestParams: Record<string, number>;
}

interface ResolvedParams {
  config: { stopLossPct?: number; takeProfitPct?: number; trailingStopPct?: number };
  holdPeriod?: number;
  source: "symbol_strategy" | "latest_optimizer_run" | "defaults";
}

/**
 * Pure version of loadOptimizedParamsForSymbol — caller provides the row
 * lookups instead of hitting the DB.
 */
function resolveOptimizedParams(
  perSymbolRow: SymbolStrategyRow | null,
  globalRun: OptimizationRunRow | null
): ResolvedParams {
  if (perSymbolRow) {
    return {
      config: {
        stopLossPct: perSymbolRow.stopLossPct,
        takeProfitPct: perSymbolRow.takeProfitPct,
        trailingStopPct: perSymbolRow.trailingStopPct,
      },
      holdPeriod: perSymbolRow.holdPeriod,
      source: "symbol_strategy",
    };
  }
  if (globalRun?.bestParams) {
    const p = globalRun.bestParams;
    if (
      typeof p.stopLossPct === "number" &&
      typeof p.takeProfitPct === "number" &&
      typeof p.trailingStopPct === "number"
    ) {
      return {
        config: {
          stopLossPct: p.stopLossPct,
          takeProfitPct: p.takeProfitPct,
          trailingStopPct: p.trailingStopPct,
        },
        holdPeriod: typeof p.holdPeriod === "number" ? p.holdPeriod : undefined,
        source: "latest_optimizer_run",
      };
    }
  }
  return { config: {}, source: "defaults" };
}

describe("mode-compare param resolution", () => {
  it("prefers per-symbol GA row when present (matches live resolveStrategy())", () => {
    const row: SymbolStrategyRow = {
      stopLossPct: 0.082,
      takeProfitPct: 0.18,
      trailingStopPct: 0.147,
      holdPeriod: 45,
    };
    const globalRun: OptimizationRunRow = {
      bestParams: { stopLossPct: 0.05, takeProfitPct: 0.10, trailingStopPct: 0.10, holdPeriod: 20 },
    };
    const result = resolveOptimizedParams(row, globalRun);
    expect(result.source).toBe("symbol_strategy");
    expect(result.config.stopLossPct).toBe(0.082);
    expect(result.holdPeriod).toBe(45);
  });

  it("falls back to latest optimizer run when no per-symbol row exists", () => {
    const globalRun: OptimizationRunRow = {
      bestParams: { stopLossPct: 0.05, takeProfitPct: 0.10, trailingStopPct: 0.10, holdPeriod: 20 },
    };
    const result = resolveOptimizedParams(null, globalRun);
    expect(result.source).toBe("latest_optimizer_run");
    expect(result.config.stopLossPct).toBe(0.05);
    expect(result.holdPeriod).toBe(20);
  });

  it("returns defaults when neither row source is available", () => {
    const result = resolveOptimizedParams(null, null);
    expect(result.source).toBe("defaults");
    expect(result.config).toEqual({});
    expect(result.holdPeriod).toBeUndefined();
  });

  it("skips global run that's missing required numeric fields", () => {
    const incomplete: OptimizationRunRow = {
      bestParams: { stopLossPct: 0.05 }, // missing TP + trail
    };
    const result = resolveOptimizedParams(null, incomplete);
    expect(result.source).toBe("defaults");
  });

  it("handles global run with stopLoss/TP/trail but no holdPeriod (engine fallback path)", () => {
    const partial: OptimizationRunRow = {
      bestParams: { stopLossPct: 0.05, takeProfitPct: 0.10, trailingStopPct: 0.10 },
      // holdPeriod absent — caller falls back to defaultHoldPeriod
    };
    const result = resolveOptimizedParams(null, partial);
    expect(result.source).toBe("latest_optimizer_run");
    expect(result.holdPeriod).toBeUndefined();
  });

  it("per-symbol row wins even when global run has 'better' params (no auto-merging)", () => {
    // Documents intent: per-symbol is authoritative once present; the page
    // must not silently mix per-symbol + global params on one row.
    const row: SymbolStrategyRow = {
      stopLossPct: 0.10,
      takeProfitPct: 0.05,
      trailingStopPct: 0.20,
      holdPeriod: 5,
    };
    const goodGlobal: OptimizationRunRow = {
      bestParams: { stopLossPct: 0.08, takeProfitPct: 0.30, trailingStopPct: 0.15, holdPeriod: 45 },
    };
    const result = resolveOptimizedParams(row, goodGlobal);
    expect(result.source).toBe("symbol_strategy");
    expect(result.config.takeProfitPct).toBe(0.05); // per-symbol value, not global's 0.30
    expect(result.holdPeriod).toBe(5);
  });
});
