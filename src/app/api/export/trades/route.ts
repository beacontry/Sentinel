/**
 * GET /api/export/trades?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Exports the calling user's trader_trades rows as CSV. Scoped to userId —
 * never returns another user's data.
 *
 * Date filtering is on trader_timestamp (the broker fill time when available,
 * else order submission time). Defaults: from = 1 year ago, to = today.
 *
 * Includes all statuses (FILLED, PENDING, CANCELED, REJECTED) so the export
 * is a full audit of what the engine attempted, not just what filled. Users
 * can filter in Excel/Sheets after download.
 */

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { buildCsv, csvAttachmentHeaders } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("export/trades");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  // Default window: last 365 days
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const from = fromStr ? new Date(fromStr) : yearAgo;
  const to = toStr ? new Date(toStr) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return new Response("Invalid date", { status: 400 });
  }
  // Make `to` inclusive by adding a day
  const toInclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  try {
    const rows = await withTimeout(8000, async (tx) => {
      return tx
        .select()
        .from(traderTrades)
        .where(
          and(
            eq(traderTrades.userId, session.userId),
            gte(traderTrades.traderTimestamp, from),
            lte(traderTrades.traderTimestamp, toInclusive)
          )
        )
        .orderBy(traderTrades.traderTimestamp);
    });

    const header = [
      "timestamp_utc",
      "symbol",
      "action",
      "signal",
      "quantity",
      "order_type",
      "limit_price",
      "stop_price",
      "fill_price",
      "fill_time_utc",
      "status",
      "pnl",
      "broker_order_id",
      "notes",
    ];

    const csvBody = buildCsv(
      header,
      rows.map((r) => [
        r.traderTimestamp.toISOString(),
        r.symbol,
        r.action,
        r.signal,
        r.quantity,
        r.orderType,
        r.limitPrice,
        r.stopPrice,
        r.fillPrice,
        r.fillTime?.toISOString() ?? "",
        r.status,
        r.pnl,
        r.brokerOrderId,
        r.notes,
      ])
    );

    const filename = `sentinel-trades-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`;
    return new Response(csvBody, { status: 200, headers: csvAttachmentHeaders(filename) });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return new Response("Query timed out — narrow the date range", { status: 504 });
    }
    log.error(
      { err: err instanceof Error ? err.message : "unknown", userId: session.userId },
      "Trade export failed"
    );
    return new Response("Failed to export trades", { status: 500 });
  }
}
