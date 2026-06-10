/**
 * Phase 12 — Position drift audit.
 *
 * For each user with an active broker connection, compares:
 *   - net_qty from trader_trades (sum of FILLED BUY − FILLED SELL/manual_close)
 *   - current_qty from the broker's getPositions
 *
 * Surfaces drift in three categories so admins can find historical bugs
 * (duplicate fills like LYB×3, ROST silent exits, etc.) before they
 * become a problem.
 *
 * Categories:
 *   - OVER_RECORDED: trader_trades net > broker qty
 *       (we recorded more buys than actually filled — typical of pre-Phase-7
 *        duplicate-order bug where engine logged "FILLED" but Alpaca only
 *        filled one of N duplicates)
 *   - UNDER_RECORDED: trader_trades net < broker qty
 *       (we missed logging some buys — uncommon; usually means a manual
 *        purchase via Alpaca UI)
 *   - MISSING_EXIT: trader_trades has BUYs but broker has no position
 *       (pre-Phase-7.5 broker-side stops fired and engine never logged the
 *        sell — TGT/ROST/CHD/HUBB/CVNA-class incidents)
 *
 * Admin-only. 5s timeout. Best-effort broker calls — broker failures
 * surface as drift_unknown=true on that user.
 */

import { NextResponse } from "next/server";
import { requireAuthForRead } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { users, brokerConnections, traderTrades } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { createBrokerClient } from "@/lib/brokers";
import { createRouteLogger } from "@/lib/logger";
import { eq, and, sql } from "drizzle-orm";

const log = createRouteLogger("admin/position-drift");

interface DriftRow {
  symbol: string;
  category: "OVER_RECORDED" | "UNDER_RECORDED" | "MISSING_EXIT";
  recordedNetQty: number;
  brokerQty: number;
  diff: number;
  buys: number;
  sells: number;
}

interface UserDrift {
  user: { id: string; name: string; email: string; role: string };
  connection: { broker: string; label: string; environment: string } | null;
  driftRows: DriftRow[];
  totalDriftRows: number;
  brokerError: string | null;
}

export async function GET() {
  const session = await requireAuthForRead(["admin"]);
  if (session instanceof Response) return session;

  try {
    // Pull users with active broker connections (these are the only ones with positions)
    const userRows = await withTimeout(5000, async (tx) => {
      return tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          broker: brokerConnections.broker,
          label: brokerConnections.label,
          environment: brokerConnections.environment,
          apiKey: brokerConnections.apiKey,
          apiSecret: brokerConnections.apiSecret,
        })
        .from(users)
        .innerJoin(
          brokerConnections,
          and(eq(brokerConnections.userId, users.id), eq(brokerConnections.isActive, true))
        );
    });

    const results: UserDrift[] = [];

    for (const u of userRows) {
      const userDrift: UserDrift = {
        user: { id: u.id, name: u.name, email: u.email, role: u.role },
        connection: { broker: u.broker, label: u.label, environment: u.environment },
        driftRows: [],
        totalDriftRows: 0,
        brokerError: null,
      };

      // Aggregate trader_trades net qty per symbol for this user
      const tradeAgg = await withTimeout(5000, async (tx) => {
        return tx
          .select({
            symbol: traderTrades.symbol,
            netQty: sql<number>`SUM(CASE WHEN ${traderTrades.action} = 'BUY' THEN ${traderTrades.quantity} ELSE -${traderTrades.quantity} END)::int`,
            buys: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.action} = 'BUY')::int`,
            sells: sql<number>`COUNT(*) FILTER (WHERE ${traderTrades.action} IN ('SELL', 'manual_close'))::int`,
          })
          .from(traderTrades)
          .where(and(eq(traderTrades.userId, u.id), eq(traderTrades.status, "FILLED")))
          .groupBy(traderTrades.symbol);
      });

      const recordedBySymbol = new Map<string, { netQty: number; buys: number; sells: number }>();
      for (const r of tradeAgg) {
        recordedBySymbol.set(r.symbol, { netQty: r.netQty, buys: r.buys, sells: r.sells });
      }

      // Fetch broker positions
      let brokerBySymbol = new Map<string, number>();
      try {
        const client = createBrokerClient(u.broker, decrypt(u.apiKey), decrypt(u.apiSecret), u.environment);
        const positions = await client.getPositions();
        brokerBySymbol = new Map(positions.map((p) => [p.symbol, p.qty]));
      } catch (err) {
        userDrift.brokerError = err instanceof Error ? err.message.slice(0, 200) : "unknown";
        results.push(userDrift);
        continue;
      }

      // Compute drift
      const allSymbols = new Set([...recordedBySymbol.keys(), ...brokerBySymbol.keys()]);
      for (const symbol of allSymbols) {
        const recorded = recordedBySymbol.get(symbol) ?? { netQty: 0, buys: 0, sells: 0 };
        const brokerQty = brokerBySymbol.get(symbol) ?? 0;
        const diff = recorded.netQty - brokerQty;

        if (diff === 0) continue; // No drift

        let category: DriftRow["category"];
        if (brokerQty === 0 && recorded.netQty > 0) {
          category = "MISSING_EXIT";
        } else if (diff > 0) {
          category = "OVER_RECORDED";
        } else {
          category = "UNDER_RECORDED";
        }

        userDrift.driftRows.push({
          symbol,
          category,
          recordedNetQty: recorded.netQty,
          brokerQty,
          diff,
          buys: recorded.buys,
          sells: recorded.sells,
        });
      }

      userDrift.driftRows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
      userDrift.totalDriftRows = userDrift.driftRows.length;
      results.push(userDrift);
    }

    return NextResponse.json({ users: results });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Position drift audit failed");
    return NextResponse.json({ error: "Failed to audit drift" }, { status: 500 });
  }
}
