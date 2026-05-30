// GET /api/performance
//
// Per-user performance: win rate + avg return + signal-type breakdown +
// per-symbol leaderboard + weekly trend across the caller's own closed
// trades. Queried from `trader_trades` filled SELL / manual_close rows
// scoped by userId.
//
// History — until 2026-05-29 this read the platform-wide `signals` /
// `signal_accuracy` tables (the analyzer's overall accuracy across every
// user). The page is in the Journal sub-nav, tier-gated to Trader+, and
// the empty-state copy explicitly describes personal data ("trades
// you've actually taken") — so leaking a platform aggregate to every
// authenticated user was a cross-tenant data exposure. Migrated to
// per-user `trader_trades` (same source as /api/performance/attribution)
// to match the page's UX intent.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { and, eq, isNotNull, sql, inArray, desc } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("performance");

// Per-trade % return on entry cost basis. proceeds = fillPrice * qty;
// cost basis = proceeds - pnl. nullif() guards a zero-cost edge case so
// avg() ignores instead of dividing by zero.
const PNL_PCT_SQL = sql`(${traderTrades.pnl} * 100.0) / nullif(${traderTrades.fillPrice} * ${traderTrades.quantity} - ${traderTrades.pnl}, 0)`;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    const baseFilter = and(
      eq(traderTrades.userId, session.userId),
      eq(traderTrades.status, "FILLED"),
      inArray(traderTrades.action, ["SELL", "manual_close"]),
      isNotNull(traderTrades.pnl),
      isNotNull(traderTrades.fillPrice),
    );

    const { overall, byType, bySymbol, weekly } = await withTimeout(3000, async (tx) => {
      const [ov] = await tx
        .select({
          totalSignals: sql<number>`count(*)::int`,
          correctSignals: sql<number>`(count(*) filter (where ${traderTrades.pnl} > 0))::int`,
          avgReturn: sql<number>`avg(${PNL_PCT_SQL})::float`,
        })
        .from(traderTrades)
        .where(baseFilter);

      const bt = await tx
        .select({
          signalType: traderTrades.signal,
          count: sql<number>`count(*)::int`,
          correct: sql<number>`(count(*) filter (where ${traderTrades.pnl} > 0))::int`,
          avgReturn: sql<number>`avg(${PNL_PCT_SQL})::float`,
        })
        .from(traderTrades)
        .where(baseFilter)
        .groupBy(traderTrades.signal);

      const bs = await tx
        .select({
          symbol: traderTrades.symbol,
          count: sql<number>`count(*)::int`,
          correct: sql<number>`(count(*) filter (where ${traderTrades.pnl} > 0))::int`,
          avgReturn: sql<number>`avg(${PNL_PCT_SQL})::float`,
        })
        .from(traderTrades)
        .where(baseFilter)
        .groupBy(traderTrades.symbol)
        .orderBy(desc(sql`avg(${PNL_PCT_SQL})`))
        .limit(10);

      const wk = await tx
        .select({
          week: sql<string>`to_char(date_trunc('week', ${traderTrades.fillTime}), 'YYYY-MM-DD')`.as("week"),
          count: sql<number>`count(*)::int`,
          correct: sql<number>`(count(*) filter (where ${traderTrades.pnl} > 0))::int`,
        })
        .from(traderTrades)
        .where(and(baseFilter, isNotNull(traderTrades.fillTime)))
        .groupBy(sql`date_trunc('week', ${traderTrades.fillTime})`)
        .orderBy(sql`date_trunc('week', ${traderTrades.fillTime})`);

      return { overall: ov, byType: bt, bySymbol: bs, weekly: wk };
    });

    const totalSignals = Number(overall?.totalSignals ?? 0);
    const correctSignals = Number(overall?.correctSignals ?? 0);

    return NextResponse.json({
      overall: {
        totalSignals,
        correctSignals,
        accuracy: totalSignals > 0 ? correctSignals / totalSignals : 0,
        avgReturn: Number(overall?.avgReturn ?? 0),
      },
      byType: byType.map((t) => ({
        signalType: t.signalType,
        count: Number(t.count),
        correct: Number(t.correct),
        accuracy: Number(t.count) > 0 ? Number(t.correct) / Number(t.count) : 0,
        avgReturn: Number(t.avgReturn ?? 0),
      })),
      bySymbol: bySymbol.map((s) => ({
        symbol: s.symbol,
        count: Number(s.count),
        correct: Number(s.correct),
        accuracy: Number(s.count) > 0 ? Number(s.correct) / Number(s.count) : 0,
        avgReturn: Number(s.avgReturn ?? 0),
      })),
      weekly: weekly.map((w) => ({
        week: w.week,
        count: Number(w.count),
        correct: Number(w.correct),
        winRate: Number(w.count) > 0 ? Number(w.correct) / Number(w.count) : 0,
      })),
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Performance error");
    return NextResponse.json({ error: "Failed to load performance" }, { status: 500 });
  }
}
