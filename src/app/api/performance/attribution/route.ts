// GET /api/performance/attribution
//
// Realized P&L broken out by symbol — answers "where did my returns
// actually come from?" Aggregates filled SELL/manual_close rows from
// trader_trades scoped to the caller, summing pnl per symbol and
// returning newest-first by absolute contribution.
//
// Different from /api/performance which scores signal-prediction
// accuracy. This is realized portfolio attribution.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { and, eq, isNotNull, sql, inArray } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("attribution");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          symbol: traderTrades.symbol,
          totalPnl: sql<number>`COALESCE(SUM(${traderTrades.pnl}), 0)::float`,
          tradeCount: sql<number>`COUNT(*)::int`,
          winCount: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.pnl} > 0)::int`,
        })
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, session.userId),
            eq(traderTrades.status, "FILLED"),
            inArray(traderTrades.action, ["SELL", "manual_close"]),
            isNotNull(traderTrades.pnl)
          )
        )
        .groupBy(traderTrades.symbol);
    });

    // Total realized for percent attribution
    const totalAbs = rows.reduce((s, r) => s + Math.abs(Number(r.totalPnl ?? 0)), 0);
    const totalNet = rows.reduce((s, r) => s + Number(r.totalPnl ?? 0), 0);

    const attribution = rows
      .map((r) => {
        const pnl = Number(r.totalPnl ?? 0);
        return {
          symbol: r.symbol,
          pnl,
          tradeCount: r.tradeCount,
          winCount: r.winCount,
          // Pct of total absolute P&L — same metric for winners + losers
          // (positive symbols contribute positive %, negative contribute
          // negative). Lets the UI render proportional bars without
          // negative-width math.
          pctOfTotal: totalAbs === 0 ? 0 : (pnl / totalAbs) * 100,
        };
      })
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

    return NextResponse.json(
      {
        totalPnl: totalNet,
        rows: attribution,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Attribution error");
    return NextResponse.json({ error: "Failed to compute attribution" }, { status: 500 });
  }
}
