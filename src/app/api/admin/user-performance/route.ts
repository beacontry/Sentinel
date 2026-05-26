/**
 * Admin user-performance dashboard data.
 *
 * GET /api/admin/user-performance
 *
 * Returns one row per user with: tier, engine state, today/lifetime P&L,
 * trade counts, win rate, last trade + heartbeat times. Powers the per-user
 * performance card on /dashboard/admin so the operator can spot:
 *   - users with stale engines (positions held but no recent scans)
 *   - users with degrading win rates
 *   - users approaching daily loss limits
 *   - users with the most realized P&L (validate engine across cohorts)
 *
 * All aggregates pulled from trader_trades (FILLED, pnl IS NOT NULL). Engine
 * status from in-memory peek (no DB write). Bounded by withTimeout — admin
 * UI tolerates 5s for a fleet view.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { users, traderTrades, traderStatus } from "@/lib/db/schema";
import { eq, sql, isNotNull, and } from "drizzle-orm";
import { peekEngineStatus } from "@/lib/trading-engine";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/user-performance");

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // One trip to load all users (tier + email + role). Trader_status
    // heartbeat picked up in the same withTimeout window.
    const [allUsers, heartbeats] = await Promise.all([
      withTimeout(5000, async (tx) =>
        tx
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            tier: users.tier,
            createdAt: users.createdAt,
          })
          .from(users)
      ),
      withTimeout(5000, async (tx) =>
        tx
          .select({
            userId: traderStatus.userId,
            mode: traderStatus.mode,
            lastHeartbeat: traderStatus.lastHeartbeat,
          })
          .from(traderStatus)
      ),
    ]);

    // Per-user trade aggregates. Single query, one row per user.
    // Today's window is anchored to America/New_York since that's where the
    // trading session lives — UTC midnight is mid-trading-day in ET.
    const aggregates = await withTimeout(5000, async (tx) =>
      tx
        .select({
          userId: traderTrades.userId,
          totalTrades: sql<number>`COUNT(*)::int`,
          wins: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.pnl} > 0)::int`,
          losses: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.pnl} < 0)::int`,
          lifetimeRealized: sql<number>`COALESCE(SUM(${traderTrades.pnl}), 0)::float`,
          grossProfit: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.pnl} > 0 THEN ${traderTrades.pnl} ELSE 0 END), 0)::float`,
          grossLoss: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.pnl} < 0 THEN ABS(${traderTrades.pnl}) ELSE 0 END), 0)::float`,
          tradesToday: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.fillTime} >= ((NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York'))::int`,
          todayRealized: sql<number>`COALESCE(SUM(CASE WHEN ${traderTrades.fillTime} >= ((NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York') THEN ${traderTrades.pnl} ELSE 0 END), 0)::float`,
          lastTradeAt: sql<Date | null>`MAX(${traderTrades.fillTime})`,
        })
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.status, "FILLED"),
            isNotNull(traderTrades.pnl),
            isNotNull(traderTrades.userId)
          )
        )
        .groupBy(traderTrades.userId)
    );

    // Index for the join step.
    const aggByUser = new Map<string, (typeof aggregates)[number]>();
    for (const row of aggregates) {
      if (row.userId) aggByUser.set(row.userId, row);
    }
    const heartbeatByUser = new Map<string, (typeof heartbeats)[number]>();
    for (const hb of heartbeats) {
      if (hb.userId) heartbeatByUser.set(hb.userId, hb);
    }

    const rows = allUsers.map((u) => {
      const agg = aggByUser.get(u.id);
      const hb = heartbeatByUser.get(u.id);
      const engine = peekEngineStatus(u.id);

      // Derived metrics
      const totalTrades = agg?.totalTrades ?? 0;
      const wins = agg?.wins ?? 0;
      const losses = agg?.losses ?? 0;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const grossProfit = agg?.grossProfit ?? 0;
      const grossLoss = agg?.grossLoss ?? 0;
      const profitFactor =
        grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

      return {
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          tier: u.tier,
          createdAt: u.createdAt.toISOString(),
        },
        engine: engine
          ? {
              running: engine.running,
              halted: engine.halted,
              mode: engine.mode,
              effectiveMode: engine.effectiveMode,
              environment: engine.environment,
              brokerConnected: engine.brokerConnected,
              positionCount: engine.positionCount,
              lastScanAt: engine.lastScanAt,
            }
          : null,
        today: {
          tradesCount: agg?.tradesToday ?? 0,
          realizedPnl: Math.round((agg?.todayRealized ?? 0) * 100) / 100,
        },
        lifetime: {
          totalTrades,
          wins,
          losses,
          winRate: Math.round(winRate * 10) / 10,
          realizedPnl: Math.round((agg?.lifetimeRealized ?? 0) * 100) / 100,
          grossProfit: Math.round(grossProfit * 100) / 100,
          grossLoss: Math.round(grossLoss * 100) / 100,
          // Cap displayed profit factor at 999 so the JSON serializes
          // (JSON.stringify(Infinity) === "null" silently breaks the UI).
          profitFactor: Number.isFinite(profitFactor)
            ? Math.round(profitFactor * 100) / 100
            : 999,
        },
        activity: {
          lastTradeAt: agg?.lastTradeAt ? new Date(agg.lastTradeAt).toISOString() : null,
          lastHeartbeatAt: hb?.lastHeartbeat ? hb.lastHeartbeat.toISOString() : null,
          serviceMode: hb?.mode ?? null,
        },
      };
    });

    return NextResponse.json({ rows, generatedAt: new Date().toISOString() });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to load user performance"
    );
    return NextResponse.json({ error: "Failed to load user performance" }, { status: 500 });
  }
}
