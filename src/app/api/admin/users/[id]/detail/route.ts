/**
 * Per-user admin detail.
 *
 * GET /api/admin/users/[id]/detail
 *
 * Returns the full picture for one user — powers /dashboard/admin/users/[id]
 * drilldown linked from the per-user performance card. One trip to keep the
 * page snappy + bounded by withTimeout.
 *
 * Includes:
 *   - User profile (email, name, role, tier, createdAt)
 *   - Active broker connection (label, broker, env, lastConnectedAt)
 *   - Engine state snapshot (peek, no instantiate side-effects)
 *   - Lifetime trade aggregates (totalTrades, wins, losses, winRate,
 *     realizedPnl, grossProfit, grossLoss, profitFactor, avgWin, avgLoss)
 *   - Recent trades (last 50, newest first)
 *   - Daily P&L (last 30 days)
 *   - Recent audit events touching this user as actor (last 25)
 *
 * Admin-only (403 otherwise). The user being queried doesn't have to be
 * the requester.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import {
  users,
  brokerConnections,
  traderTrades,
  traderDailyPnl,
} from "@/lib/db/schema";
import { auditLog } from "@/lib/db/schema/audit";
import { peekEngineStatus } from "@/lib/trading-engine";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/users-detail");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  try {
    // Single 5s window for every DB read. The aggregates query is the
    // heaviest; the others use indexed lookups.
    const result = await withTimeout(5000, async (tx) => {
      const [user] = await tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          tier: users.tier,
          tierExpiresAt: users.tierExpiresAt,
          createdAt: users.createdAt,
          liveTradingEnabled: users.liveTradingEnabled,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return null;

      const [conn] = await tx
        .select({
          label: brokerConnections.label,
          broker: brokerConnections.broker,
          environment: brokerConnections.environment,
          isActive: brokerConnections.isActive,
          lastConnectedAt: brokerConnections.lastConnectedAt,
        })
        .from(brokerConnections)
        .where(
          and(eq(brokerConnections.userId, userId), eq(brokerConnections.isActive, true))
        )
        .limit(1);

      const [aggregates] = await tx
        .select({
          totalTrades: sql<number>`COUNT(*)::int`,
          wins: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.pnl} > 0)::int`,
          losses: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.pnl} < 0)::int`,
          lifetimeRealized: sql<number>`COALESCE(SUM(${traderTrades.pnl}), 0)::float`,
          grossProfit: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.pnl} > 0 THEN ${traderTrades.pnl} ELSE 0 END), 0)::float`,
          grossLoss: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.pnl} < 0 THEN ABS(${traderTrades.pnl}) ELSE 0 END), 0)::float`,
          tradesToday: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.fillTime} >= ((NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York'))::int`,
          todayRealized: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.fillTime} >= ((NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York') THEN ${traderTrades.pnl} ELSE 0 END), 0)::float`,
          lastTradeAt: sql<Date | null>`MAX(${traderTrades.fillTime})`,
          firstTradeAt: sql<Date | null>`MIN(${traderTrades.fillTime})`,
        })
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, userId),
            eq(traderTrades.status, "FILLED"),
            isNotNull(traderTrades.pnl)
          )
        );

      // Recent trades — last 50, newest first. Covers PENDING too so admin
      // can see in-flight orders (e.g., the WDC pending-buy bug surfaces here).
      const recentTrades = await tx
        .select({
          id: traderTrades.id,
          symbol: traderTrades.symbol,
          action: traderTrades.action,
          signal: traderTrades.signal,
          quantity: traderTrades.quantity,
          fillPrice: traderTrades.fillPrice,
          status: traderTrades.status,
          pnl: traderTrades.pnl,
          fillTime: traderTrades.fillTime,
          createdAt: traderTrades.createdAt,
          notes: traderTrades.notes,
          brokerOrderId: traderTrades.brokerOrderId,
        })
        .from(traderTrades)
        .where(eq(traderTrades.userId, userId))
        .orderBy(desc(traderTrades.createdAt))
        .limit(50);

      const dailyPnl = await tx
        .select({
          date: traderDailyPnl.date,
          realizedPnl: traderDailyPnl.realizedPnl,
          unrealizedPnl: traderDailyPnl.unrealizedPnl,
          tradesCount: traderDailyPnl.tradesCount,
          halted: traderDailyPnl.halted,
          haltReason: traderDailyPnl.haltReason,
        })
        .from(traderDailyPnl)
        .where(eq(traderDailyPnl.userId, userId))
        .orderBy(desc(traderDailyPnl.date))
        .limit(30);

      // Audit events where the user was the actor (admin actions ON the
      // user are also visible via resourceType=user + resourceId=userId
      // but we'd need a separate query; for v1 keep it to actor only.)
      const audits = await tx
        .select({
          id: auditLog.id,
          createdAt: auditLog.createdAt,
          action: auditLog.action,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          metadata: auditLog.metadata,
          ip: auditLog.ip,
        })
        .from(auditLog)
        .where(eq(auditLog.actorUserId, userId))
        .orderBy(desc(auditLog.createdAt))
        .limit(25);

      return { user, conn: conn ?? null, aggregates, recentTrades, dailyPnl, audits };
    });

    if (!result) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { user, conn, aggregates, recentTrades, dailyPnl, audits } = result;
    const engine = peekEngineStatus(userId);

    // Derived stats on top of the SQL aggregates.
    const totalTrades = aggregates?.totalTrades ?? 0;
    const wins = aggregates?.wins ?? 0;
    const losses = aggregates?.losses ?? 0;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const grossProfit = aggregates?.grossProfit ?? 0;
    const grossLoss = aggregates?.grossLoss ?? 0;
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tier: user.tier,
        tierExpiresAt: user.tierExpiresAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        liveTradingEnabled: user.liveTradingEnabled,
      },
      connection: conn
        ? {
            label: conn.label,
            broker: conn.broker,
            environment: conn.environment,
            lastConnectedAt: conn.lastConnectedAt?.toISOString() ?? null,
          }
        : null,
      engine: engine
        ? {
            running: engine.running,
            halted: engine.halted,
            mode: engine.mode,
            effectiveMode: engine.effectiveMode,
            environment: engine.environment,
            brokerConnected: engine.brokerConnected,
            positionCount: engine.positionCount,
            scanCount: engine.scanCount,
            dailyLoss: engine.dailyLoss,
            lastScanAt: engine.lastScanAt,
            scanStartedAt: engine.scanStartedAt,
            errors: engine.errors,
            adaptiveRegime: engine.adaptiveRegime,
          }
        : null,
      lifetime: {
        totalTrades,
        wins,
        losses,
        winRate: Math.round(winRate * 10) / 10,
        realizedPnl: Math.round((aggregates?.lifetimeRealized ?? 0) * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossLoss: Math.round(grossLoss * 100) / 100,
        profitFactor: Number.isFinite(profitFactor)
          ? Math.round(profitFactor * 100) / 100
          : 999,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        firstTradeAt: aggregates?.firstTradeAt
          ? new Date(aggregates.firstTradeAt).toISOString()
          : null,
        lastTradeAt: aggregates?.lastTradeAt
          ? new Date(aggregates.lastTradeAt).toISOString()
          : null,
      },
      today: {
        tradesCount: aggregates?.tradesToday ?? 0,
        realizedPnl: Math.round((aggregates?.todayRealized ?? 0) * 100) / 100,
      },
      recentTrades: recentTrades.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        action: t.action,
        signal: t.signal,
        quantity: t.quantity,
        fillPrice: t.fillPrice,
        status: t.status,
        pnl: t.pnl,
        fillTime: t.fillTime?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        notes: t.notes,
        brokerOrderId: t.brokerOrderId,
      })),
      dailyPnl: dailyPnl.map((d) => ({
        date: d.date,
        realizedPnl: d.realizedPnl,
        unrealizedPnl: d.unrealizedPnl,
        tradesCount: d.tradesCount,
        halted: d.halted,
        haltReason: d.haltReason,
      })),
      audits: audits.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        metadata: a.metadata,
        ip: a.ip,
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId },
      "Failed to load user detail"
    );
    return NextResponse.json({ error: "Failed to load user detail" }, { status: 500 });
  }
}
