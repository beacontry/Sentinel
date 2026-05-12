/**
 * GET /api/export/pnl-history?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Exports daily P&L history from trader_daily_pnl for the calling user.
 */

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderDailyPnl } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { buildCsv, csvAttachmentHeaders } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("export/pnl-history");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from") ?? "2020-01-01";
  const toStr = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  try {
    const rows = await withTimeout(5000, async (tx) => {
      return tx
        .select()
        .from(traderDailyPnl)
        .where(
          and(
            eq(traderDailyPnl.userId, session.userId),
            gte(traderDailyPnl.date, fromStr),
            lte(traderDailyPnl.date, toStr)
          )
        )
        .orderBy(traderDailyPnl.date);
    });

    const header = [
      "date",
      "realized_pnl",
      "unrealized_pnl",
      "total_pnl",
      "trades_count",
      "halted",
      "halt_reason",
      "engine_mode",
    ];

    const csvBody = buildCsv(
      header,
      rows.map((r) => [
        r.date,
        r.realizedPnl,
        r.unrealizedPnl,
        r.realizedPnl + r.unrealizedPnl,
        r.tradesCount,
        r.halted,
        r.haltReason,
        r.engineMode,
      ])
    );

    const filename = `sentinel-pnl-history-${fromStr}-to-${toStr}.csv`;
    return new Response(csvBody, { status: 200, headers: csvAttachmentHeaders(filename) });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return new Response("Query timed out", { status: 504 });
    }
    log.error({ err: err instanceof Error ? err.message : "unknown", userId: session.userId }, "P&L export failed");
    return new Response("Failed to export P&L history", { status: 500 });
  }
}
