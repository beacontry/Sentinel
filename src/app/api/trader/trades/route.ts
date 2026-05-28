import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("trader-trades");

/**
 * Filled trades for the authenticated user, optionally scoped to a single
 * ET calendar day. Backs the P&L-calendar day drill-down.
 *
 * The legacy POST/PATCH push handlers (external Python-daemon era, shared
 * TRADER_SECRET, numeric trader_id) were removed — the in-process engine
 * writes trader_trades directly with the per-user UUID.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const limitParamRaw = parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitParamRaw)
    ? Math.min(Math.max(limitParamRaw, 1), 500)
    : 100;

  try {
    const rows = await withTimeout(3000, async (tx) => {
      const conds: SQL[] = [
        eq(traderTrades.userId, session.userId),
        eq(traderTrades.status, "FILLED"),
      ];
      // Match the ET calendar day the rest of the app buckets trades by —
      // trader_daily_pnl rows are ET-keyed, so a UTC date filter here would
      // drop late-session fills (e.g. 9 PM ET = next-day UTC).
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        conds.push(
          sql`(${traderTrades.fillTime} AT TIME ZONE 'America/New_York')::date = ${date}::date`
        );
      }
      return tx
        .select({
          symbol: traderTrades.symbol,
          action: traderTrades.action,
          quantity: traderTrades.quantity,
          fillPrice: traderTrades.fillPrice,
          limitPrice: traderTrades.limitPrice,
          pnl: traderTrades.pnl,
          fillTime: traderTrades.fillTime,
        })
        .from(traderTrades)
        .where(and(...conds))
        .orderBy(desc(traderTrades.fillTime))
        .limit(limit);
    });

    return NextResponse.json(
      {
        trades: rows.map((t) => ({
          symbol: t.symbol,
          action: t.action,
          quantity: t.quantity,
          price: t.fillPrice ?? t.limitPrice ?? 0,
          pnl: t.pnl,
          fillTime: t.fillTime?.toISOString() ?? null,
        })),
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
    log.error({ err: message }, "Trader trades fetch error");
    return NextResponse.json({ error: "Failed to load trades" }, { status: 500 });
  }
}
