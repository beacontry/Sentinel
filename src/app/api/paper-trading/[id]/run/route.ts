import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { paperTradingConfigs, paperTradingRuns } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { runBacktest } from "@/lib/backtester";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("paper-trading-run");
import { getMarketDataProvider } from "@/lib/market-data";
import { STRATEGY_PRESETS, type PresetName } from "@/lib/strategy-presets";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Fetch config
    const [config] = await db
      .select()
      .from(paperTradingConfigs)
      .where(
        and(
          eq(paperTradingConfigs.id, id),
          eq(paperTradingConfigs.userId, session.userId as string)
        )
      )
      .limit(1);

    if (!config) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let strategyConfig: { preset: PresetName; symbol: string; days: number };
    let riskConfig: {
      stopLossPct: number;
      takeProfitPct: number;
      trailingStopPct: number;
      holdPeriod: number;
    };

    try {
      strategyConfig = config.strategyConfig as typeof strategyConfig;
      riskConfig = config.riskConfig as typeof riskConfig;
    } catch {
      return NextResponse.json(
        { error: "Invalid configuration data" },
        { status: 422 }
      );
    }

    // Get strategy preset defaults and merge with risk config
    const presetDefaults = STRATEGY_PRESETS[strategyConfig.preset] ?? STRATEGY_PRESETS.moderate;
    const mergedRisk = {
      stopLossPct: riskConfig.stopLossPct ?? presetDefaults.stopLossPct,
      takeProfitPct: riskConfig.takeProfitPct ?? presetDefaults.takeProfitPct,
      trailingStopPct: riskConfig.trailingStopPct ?? presetDefaults.trailingStopPct,
    };
    const holdPeriod = riskConfig.holdPeriod ?? presetDefaults.holdPeriod;

    // Fetch market data
    const provider = getMarketDataProvider();
    const bars = await provider.fetchBars(
      strategyConfig.symbol,
      strategyConfig.days ?? 90,
      "1d"
    );

    if (bars.length < 50) {
      return NextResponse.json(
        { error: "Not enough historical data for backtesting" },
        { status: 422 }
      );
    }

    // Calculate window and step
    const maxWindow = Math.floor((bars.length - holdPeriod) * 0.7);
    const windowSize = Math.max(30, Math.min(50, maxWindow));
    const stepSize = Math.max(1, Math.floor(windowSize / 10));

    // Run backtest
    const result = runBacktest(
      strategyConfig.symbol,
      bars,
      windowSize,
      holdPeriod,
      stepSize,
      mergedRisk
    );

    // Save run
    const [run] = await db
      .insert(paperTradingRuns)
      .values({
        configId: id,
        startedAt: new Date(),
        endedAt: new Date(),
        results: {
          totalReturn: result.totalReturn,
          winRate: result.winRate,
          winCount: result.winCount,
          lossCount: result.lossCount,
          totalTrades: result.totalTrades,
          maxDrawdown: result.maxDrawdown,
          sharpeRatio: result.sharpeRatio,
        },
      })
      .returning();

    return NextResponse.json(
      {
        run,
        result: {
          totalReturn: result.totalReturn,
          winRate: result.winRate,
          winCount: result.winCount,
          lossCount: result.lossCount,
          totalTrades: result.totalTrades,
          maxDrawdown: result.maxDrawdown,
          sharpeRatio: result.sharpeRatio,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Paper trading run error");
    return NextResponse.json(
      { error: "Failed to run backtest" },
      { status: 500 }
    );
  }
}
