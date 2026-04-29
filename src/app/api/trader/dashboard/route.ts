import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderStatus, traderTrades, traderDailyPnl, traderSignals, brokerConnections } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { createBrokerClient } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { getBrokerPositionCache, getTrackedPositionData } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limiter";

const log = createRouteLogger("trader-dashboard");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Heavy aggregate query: cap to 30/min/user (above polling rate of one per ~10s).
  const limit = rateLimit(`trader-dashboard:${session.userId}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  try {
    // Status and broker connection — wrap all initial DB reads in a timeout
    const { status, conn } = await withTimeout(3000, async (tx) => {
      const [s] = await tx.select().from(traderStatus).where(eq(traderStatus.userId, session.userId)).limit(1);
      const [c] = await tx
        .select()
        .from(brokerConnections)
        .where(and(eq(brokerConnections.userId, session.userId), eq(brokerConnections.isActive, true)))
        .limit(1);
      return { status: s ?? null, conn: c ?? null };
    });

    const traderServiceAlive = status
      ? Date.now() - status.lastHeartbeat.getTime() < 5 * 60 * 1000
      : false;

    // Always fetch broker account data when a connection exists
    let brokerAccount: { equity: number; cash: number; buyingPower: number; portfolioValue: number } | null = null;
    let brokerPositions: { symbol: string; qty: number; avgEntryPrice: number; currentPrice: number; unrealizedPnl: number; marketValue: number }[] = [];
    let brokerOpenOrders: Array<{
      id: string; symbol: string; side: string; type: string; qty: number;
      filledQty: number; status: string; stopPrice: string | null;
      limitPrice: string | null; timeInForce: string; submittedAt: string;
    }> = [];
    let brokerConnected = false;
    let brokerName = "";
    let brokerEnv = "";

    if (conn) {
      brokerName = conn.broker;
      brokerEnv = conn.environment;
      try {
        const client = createBrokerClient(conn.broker, decrypt(conn.apiKey), decrypt(conn.apiSecret), conn.environment);
        const [acct, pos, orders] = await Promise.allSettled([client.getAccount(), client.getPositions(), client.getOrders(50)]);
        if (acct.status === "fulfilled") {
          const a = acct.value;
          brokerAccount = { equity: a.equity, cash: a.cash, buyingPower: a.buyingPower, portfolioValue: a.portfolioValue ?? a.equity };
          brokerConnected = true;
        }
        if (pos.status === "fulfilled") {
          brokerPositions = pos.value.map((p) => ({
            symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avgEntryPrice,
            currentPrice: p.currentPrice, unrealizedPnl: p.unrealizedPnl, marketValue: p.marketValue,
          }));
        }
        if (orders.status === "fulfilled") {
          // Only include open/pending orders (not filled/canceled)
          brokerOpenOrders = orders.value
            .filter((o) => ["new", "accepted", "pending_new", "partially_filled", "held"].includes(o.status))
            .map((o) => ({
              id: o.id, symbol: o.symbol, side: o.side, type: o.type,
              qty: o.qty, filledQty: o.filledQty, status: o.status,
              stopPrice: o.stopPrice, limitPrice: o.limitPrice,
              timeInForce: o.timeInForce, submittedAt: o.submittedAt,
            }));
        }
      } catch {
        // Broker connection failed — show as offline
      }
    }

    const isConnected = traderServiceAlive || brokerConnected;

    // All remaining DB reads in a single timeout
    const today = new Date().toISOString().slice(0, 10);
    const { todayPnl, trades, signals, pnlHistory, filledTrades } = await withTimeout(3000, async (tx) => {
      // Today's P&L — scoped to current user
      const [tp] = await tx
        .select()
        .from(traderDailyPnl)
        .where(and(eq(traderDailyPnl.date, today), eq(traderDailyPnl.userId, session.userId)))
        .limit(1);

      // Recent trades — scoped to current user
      const tr = await tx
        .select()
        .from(traderTrades)
        .where(eq(traderTrades.userId, session.userId))
        .orderBy(desc(traderTrades.createdAt))
        .limit(20);

      // Recent signals — scoped to current user
      const sig = await tx
        .select()
        .from(traderSignals)
        .where(eq(traderSignals.userId, session.userId))
        .orderBy(desc(traderSignals.createdAt))
        .limit(20);

      // P&L history (last 30 days) — scoped to current user
      const ph = await tx
        .select()
        .from(traderDailyPnl)
        .where(eq(traderDailyPnl.userId, session.userId))
        .orderBy(desc(traderDailyPnl.date))
        .limit(30);

      // Analytics — all filled trades with P&L — scoped to current user
      const ft = await tx
        .select({ pnl: traderTrades.pnl })
        .from(traderTrades)
        .where(and(eq(traderTrades.status, "FILLED"), isNotNull(traderTrades.pnl), eq(traderTrades.userId, session.userId)));

      return { todayPnl: tp ?? null, trades: tr, signals: sig, pnlHistory: ph, filledTrades: ft };
    });

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

    // Normalize positions — prefer live broker data, fall back to engine cache, then DB
    let finalPositions: Array<Record<string, unknown>>;
    let positionsStale = false;
    let positionsAgeSeconds = 0;

    // Get tracked stop/target data from engine's in-memory position map
    const trackedData = getTrackedPositionData(session.userId);

    if (brokerPositions.length > 0) {
      // Live broker data — merge with engine's tracked stop prices
      finalPositions = brokerPositions.map((p) => {
        const tracked = trackedData.get(p.symbol);
        return {
          symbol: p.symbol, quantity: p.qty, qty: p.qty,
          entryPrice: p.avgEntryPrice, currentPrice: p.currentPrice,
          unrealizedPnl: p.unrealizedPnl, pnl: p.unrealizedPnl,
          marketValue: p.marketValue,
          stopPrice: tracked?.stopLoss ?? null,
          updatedAt: new Date().toISOString(),
        };
      });
    } else {
      // Try engine's in-memory cache
      const cached = getBrokerPositionCache(session.userId);
      if (cached && cached.positions.length > 0) {
        positionsStale = true;
        positionsAgeSeconds = Math.floor((Date.now() - cached.fetchedAt.getTime()) / 1000);
        finalPositions = cached.positions.map((p) => {
          const tracked = trackedData.get(p.symbol);
          return {
            symbol: p.symbol, quantity: p.qty, qty: p.qty,
            entryPrice: p.avgEntryPrice, currentPrice: p.currentPrice,
            unrealizedPnl: p.unrealizedPnl, pnl: p.unrealizedPnl,
            marketValue: p.marketValue,
            stopPrice: tracked?.stopLoss ?? null,
            updatedAt: cached.fetchedAt.toISOString(),
          };
        });
      } else {
        // No broker data and no cache — empty positions
        finalPositions = [];
      }
    }

    return NextResponse.json({
      status: {
        connected: isConnected,
        mode: traderServiceAlive
          ? (status?.mode ?? "unknown")
          : brokerConnected
            ? brokerEnv
            : "unknown",
        lastHeartbeat: status?.lastHeartbeat?.toISOString() ?? (brokerConnected ? new Date().toISOString() : null),
        watchlist: status?.watchlist ?? [],
        broker: brokerConnected ? brokerName : undefined,
      },
      brokerAccount: brokerAccount ? {
        equity: brokerAccount.equity,
        cash: brokerAccount.cash,
        buyingPower: brokerAccount.buyingPower,
        portfolioValue: brokerAccount.portfolioValue,
      } : null,
      todayPnl: (() => {
        // Always prefer live broker P&L when connected
        if (brokerConnected && brokerPositions.length > 0) {
          const unrealized = brokerPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
          const realized = todayPnl?.realizedPnl ?? 0;
          return {
            realizedPnl: realized,
            unrealizedPnl: unrealized,
            totalPnl: realized + unrealized,
            tradesCount: todayPnl?.tradesCount ?? brokerPositions.length,
            halted: todayPnl?.halted ?? false,
          };
        }
        if (todayPnl) {
          return {
            realizedPnl: todayPnl.realizedPnl,
            unrealizedPnl: todayPnl.unrealizedPnl,
            totalPnl: todayPnl.realizedPnl + todayPnl.unrealizedPnl,
            tradesCount: todayPnl.tradesCount,
            halted: todayPnl.halted,
          };
        }
        return null;
      })(),
      positions: finalPositions,
      positionsStale,
      positionsAgeSeconds,
      openOrders: brokerOpenOrders,
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
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Trader dashboard error");
    return NextResponse.json({ error: "Failed to load trader data" }, { status: 500 });
  }
}
