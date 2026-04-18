import type { StrategyParams } from "./strategy-presets";
import { STRATEGY_PRESETS } from "./strategy-presets";
import { computeATRStrategy } from "./strategy-atr";
import { db } from "./db";
import { symbolStrategies, userRiskProfiles } from "./db/schema";
import { eq, and } from "drizzle-orm";

export interface ResolvedStrategy {
  params: StrategyParams;
  source: "assignment" | "risk_profile" | "preset" | "default";
  presetName?: string;
  atr?: number;
  atrPct?: number;
}

/**
 * Resolve strategy params for a user + symbol.
 * Priority: explicit assignment > risk profile + ATR > moderate default.
 */
export async function resolveStrategy(
  userId: string,
  symbol: string
): Promise<ResolvedStrategy> {
  // 1. Check for explicit per-symbol assignment
  const [assignment] = await db
    .select()
    .from(symbolStrategies)
    .where(
      and(
        eq(symbolStrategies.userId, userId),
        eq(symbolStrategies.symbol, symbol.toUpperCase())
      )
    )
    .limit(1);

  if (assignment) {
    return {
      params: {
        stopLossPct: assignment.stopLossPct,
        takeProfitPct: assignment.takeProfitPct,
        trailingStopPct: assignment.trailingStopPct,
        holdPeriod: assignment.holdPeriod,
      },
      source: "assignment",
      presetName: assignment.presetName ?? undefined,
      atr: assignment.lastAtr ?? undefined,
    };
  }

  // 2. Derive from risk profile + ATR
  const [profile] = await db
    .select()
    .from(userRiskProfiles)
    .where(eq(userRiskProfiles.userId, userId))
    .limit(1);

  if (profile) {
    try {
      const atrResult = await computeATRStrategy(symbol);
      const scale =
        profile.riskTolerance === "conservative" ? 0.75
        : profile.riskTolerance === "aggressive" ? 1.5
        : 1.0;

      return {
        params: {
          stopLossPct: parseFloat((atrResult.params.stopLossPct * scale).toFixed(4)),
          takeProfitPct: parseFloat((atrResult.params.takeProfitPct * scale).toFixed(4)),
          trailingStopPct: parseFloat((atrResult.params.trailingStopPct * scale).toFixed(4)),
          holdPeriod: atrResult.params.holdPeriod,
        },
        source: "risk_profile",
        atr: atrResult.atr,
        atrPct: atrResult.atrPct,
      };
    } catch {
      // ATR failed, fall back to preset matching risk tolerance
      const presetName = profile.riskTolerance as keyof typeof STRATEGY_PRESETS;
      return {
        params: STRATEGY_PRESETS[presetName] ?? STRATEGY_PRESETS.moderate,
        source: "risk_profile",
        presetName,
      };
    }
  }

  // 3. Default
  return {
    params: STRATEGY_PRESETS.moderate,
    source: "default",
    presetName: "moderate",
  };
}
