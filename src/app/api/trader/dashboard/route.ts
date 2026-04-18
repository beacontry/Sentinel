import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { traderStatus, traderPositions, traderTrades, traderDailyPnl, traderSignals } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Status
    const [status] = await db.select().from(traderStatus).limit(1);
    const isConnected = status
      ? Date.now() - status.lastHeartbeat.getTime() < 5 * 60 * 1000
      : false;

    // Today's P&L
    const today = new Date().toISOString().slice(0, 10);
    const [todayPnl] = await db
      .select()
      .from(traderDailyPnl)
      .where(eq(traderDailyPnl.date, today))
      .limit(1);

    // Open positions
    const positions = await db.select().from(traderPositions);

    // Recent trades
    const trades = await db
      .select()
      .from(traderTrades)
      .orderBy(desc(traderTrades.createdAt))
      .limit(20);

    // Recent signals
    const signals = await db
      .select()
      .from(traderSignals)
      .orderBy(desc(traderSignals.createdAt))
      .limit(20);

    // P&L history (last 30 days)
    const pnlHistory = await db
      .select()
      .from(traderDailyPnl)
      .orderBy(desc(traderDailyPnl.date))
      .limit(30);

    // Analytics — all filled trades with P&L
    const filledTrades = await db
      .select({ pnl: traderTrades.pnl })
      .from(traderTrades)
      .where(and(eq(traderTrades.status, "FILLED"), isNotNull(traderTrades.pnl)));

    const pnls = filledTrades.map((t) => t.pnl ?? 0);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p <= 0);
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const winRate = pnls.length > 0 ? (wins.length / pnls.length) * 100 : 0;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Max drawdown from daily P&L
    const sortedPnl = [...pnlHistory].reverse();
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const day of sortedPnl) {
      cumulative += day.realizedPnl + day.unrealizedPnl;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    }

    // Sharpe ratio (annualized from daily returns)
    const dailyReturns = sortedPnl.map((d) => d.realizedPnl + d.unrealizedPnl);
    let sharpeRatio = 0;
    if (dailyReturns.length > 1) {
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
      const std = Math.sqrt(variance);
      sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    }

    const analytics = {
      totalTrades: pnls.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: Math.round(winRate * 10) / 10,
      netPnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossLoss: Math.round(grossLoss * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    };

    return NextResponse.json({
      status: {
        connected: isConnected,
        mode: status?.mode ?? "unknown",
        lastHeartbeat: status?.lastHeartbeat?.toISOString() ?? null,
        watchlist: status?.watchlist ?? [],
      },
      todayPnl: todayPnl ? {
        realizedPnl: todayPnl.realizedPnl,
        unrealizedPnl: todayPnl.unrealizedPnl,
        totalPnl: todayPnl.realizedPnl + todayPnl.unrealizedPnl,
        tradesCount: todayPnl.tradesCount,
        halted: todayPnl.halted,
      } : null,
      positions: positions.map((p) => ({
        ...p,
        updatedAt: p.updatedAt.toISOString(),
      })),
      trades: trades.map((t) => ({
        ...t,
        fillTime: t.fillTime?.toISOString() ?? null,
        traderTimestamp: t.traderTimestamp.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      signals: signals.map((s) => ({
        ...s,
        traderTimestamp: s.traderTimestamp.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
      pnlHistory: pnlHistory.reverse().map((p) => ({
        date: p.date,
        realizedPnl: p.realizedPnl,
        unrealizedPnl: p.unrealizedPnl,
        totalPnl: p.realizedPnl + p.unrealizedPnl,
        tradesCount: p.tradesCount,
        halted: p.halted,
      })),
      analytics,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Trader dashboard error:", message);
    return NextResponse.json({ error: "Failed to load trader data" }, { status: 500 });
  }
}
