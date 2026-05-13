/**
 * Journal v2 — phase 6: tagged-pattern behavioral badges.
 *
 * Returns per-tag statistics from the user's journaled trades:
 *   - n = number of journal entries with this tag that also link to
 *     a FILLED trader_trades row with a non-null pnl
 *   - wins = entries where pnl > 0
 *   - winRate = wins / n
 *
 * Only tags with n >= MIN_N are returned — small samples are noise.
 * Sorted by absolute deviation from the user's overall win rate so
 * the most diagnostic tags surface first ("FOMO trades: 30% win rate"
 * is more interesting than "Patience trades: 51% win rate" if the
 * baseline is 50%).
 *
 * Used by the journal home page to render quiet badges:
 *   "Trades tagged FOMO: 30% win rate (n=12) — below your baseline."
 *
 * Computed live from a single JOIN query; no caching needed (the
 * journal page already polls).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { tradeJournal, traderTrades } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("journal-patterns");

const MIN_N = 5;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await withTimeout(5000, async (tx) => {
      // Unnest the entry tags, join to the linked trader_trade, group by tag.
      // jsonb_array_elements_text expands the entry.tags jsonb array into a
      // row per tag value. The join filters to entries that actually have
      // a linked trade with realized P&L.
      return tx.execute<{
        tag: string;
        n: number;
        wins: number;
        avg_pnl: number | null;
      }>(sql`
        SELECT
          jsonb_array_elements_text(${tradeJournal.tags}::jsonb) AS tag,
          COUNT(*)::int AS n,
          SUM(CASE WHEN ${traderTrades.pnl} > 0 THEN 1 ELSE 0 END)::int AS wins,
          AVG(${traderTrades.pnl})::float8 AS avg_pnl
        FROM ${tradeJournal}
        INNER JOIN ${traderTrades}
          ON ${traderTrades.id} = ${tradeJournal.traderTradeId}
          AND ${traderTrades.status} = 'FILLED'
          AND ${traderTrades.pnl} IS NOT NULL
        WHERE ${eq(tradeJournal.userId, session.userId)}
        GROUP BY tag
        HAVING COUNT(*) >= ${MIN_N}
      `);
    });

    // Compute the user's baseline win rate across ALL linked trades
    // (regardless of tag) so we can flag patterns that DEVIATE.
    const baselineRows = await withTimeout(3000, async (tx) => {
      return tx.execute<{ n: number; wins: number }>(sql`
        SELECT
          COUNT(*)::int AS n,
          SUM(CASE WHEN ${traderTrades.pnl} > 0 THEN 1 ELSE 0 END)::int AS wins
        FROM ${tradeJournal}
        INNER JOIN ${traderTrades}
          ON ${traderTrades.id} = ${tradeJournal.traderTradeId}
          AND ${traderTrades.status} = 'FILLED'
          AND ${traderTrades.pnl} IS NOT NULL
        WHERE ${eq(tradeJournal.userId, session.userId)}
      `);
    });

    const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
    const baselineList = Array.isArray(baselineRows) ? baselineRows : (baselineRows as { rows?: unknown[] }).rows ?? [];

    const baseline = baselineList[0] as { n: number; wins: number } | undefined;
    const baselineWinRate = baseline && baseline.n > 0 ? baseline.wins / baseline.n : 0.5;

    const patterns = (list as Array<{ tag: string; n: number; wins: number; avg_pnl: number | null }>)
      .map((r) => ({
        tag: r.tag,
        n: r.n,
        wins: r.wins,
        winRate: r.n > 0 ? r.wins / r.n : 0,
        avgPnl: r.avg_pnl,
        deviation: (r.wins / r.n) - baselineWinRate,
      }))
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

    return NextResponse.json({
      patterns,
      baseline: {
        n: baseline?.n ?? 0,
        wins: baseline?.wins ?? 0,
        winRate: baselineWinRate,
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Journal patterns query failed");
    return NextResponse.json({ error: "Pattern query failed" }, { status: 500 });
  }
}
