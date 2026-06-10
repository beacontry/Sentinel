/**
 * Phase 16 — Slippage report.
 *
 * Compares each FILLED order's placeholder fill price (recorded at order
 * submission via logTrade) with the actual broker fill price (updated by
 * the Phase 11 reconciler).
 *
 * Signed slippage = fillPrice - placeholderFillPrice
 *   - BUY:  positive = paid more than expected (bad)  → cost = +slippage × qty
 *   - SELL: positive = received more than expected (good) → cost = -slippage × qty
 * Cost is always reported as the user's $ impact (negative = lost money).
 *
 * Surfaces the "paper-to-live tax" once live trading is on. Admin-only.
 * Window defaults to 30 days; ?days=N to override (1-365).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthForRead } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { users, traderTrades } from "@/lib/db/schema";
import { eq, and, gte, isNotNull, sql } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/slippage-report");

interface SlippageRow {
  symbol: string;
  orders: number;
  totalShares: number;
  totalCostDollars: number;
  avgSlippagePerShare: number;
  worstSlippage: number;
  worstSlippageOrderId: string | null;
}

interface UserSlippage {
  user: { id: string; name: string; email: string };
  totalOrders: number;
  totalCost: number;
  bySymbol: SlippageRow[];
}

function slippageCost(action: string, placeholder: number, actual: number, qty: number): number {
  const slip = actual - placeholder;
  // BUY: paying more = cost increases; SELL: receiving less = cost increases
  return action === "BUY" ? -slip * qty : slip * qty;
}

export async function GET(request: NextRequest) {
  const session = await requireAuthForRead(["admin"]);
  if (session instanceof Response) return session;

  const url = new URL(request.url);
  const daysStr = url.searchParams.get("days");
  const days = daysStr ? Math.min(Math.max(parseInt(daysStr, 10) || 30, 1), 365) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const rows = await withTimeout(8000, async (tx) => {
      return tx
        .select({
          userId: traderTrades.userId,
          userName: users.name,
          userEmail: users.email,
          symbol: traderTrades.symbol,
          action: traderTrades.action,
          quantity: traderTrades.quantity,
          fillPrice: traderTrades.fillPrice,
          placeholderFillPrice: traderTrades.placeholderFillPrice,
          brokerOrderId: traderTrades.brokerOrderId,
          createdAt: traderTrades.createdAt,
        })
        .from(traderTrades)
        .leftJoin(users, eq(sql`${traderTrades.userId}::uuid`, users.id))
        .where(
          and(
            eq(traderTrades.status, "FILLED"),
            isNotNull(traderTrades.fillPrice),
            isNotNull(traderTrades.placeholderFillPrice),
            gte(traderTrades.createdAt, since)
          )
        );
    });

    // Aggregate per user → per symbol
    const userMap = new Map<
      string,
      {
        user: { id: string; name: string; email: string };
        symbols: Map<string, { orders: number; shares: number; cost: number; perShare: number[]; worstCost: number; worstId: string | null }>;
      }
    >();

    for (const r of rows) {
      if (r.fillPrice === null || r.placeholderFillPrice === null) continue;
      const userKey = r.userId ?? "unknown";
      const cost = slippageCost(r.action, r.placeholderFillPrice, r.fillPrice, r.quantity);
      const perShare = (r.fillPrice - r.placeholderFillPrice) * (r.action === "BUY" ? -1 : 1);

      let userEntry = userMap.get(userKey);
      if (!userEntry) {
        userEntry = {
          user: { id: userKey, name: r.userName ?? "unknown", email: r.userEmail ?? "unknown" },
          symbols: new Map(),
        };
        userMap.set(userKey, userEntry);
      }
      const sym = userEntry.symbols.get(r.symbol) ?? {
        orders: 0,
        shares: 0,
        cost: 0,
        perShare: [],
        worstCost: 0,
        worstId: null,
      };
      sym.orders++;
      sym.shares += r.quantity;
      sym.cost += cost;
      sym.perShare.push(perShare);
      // Worst = most negative (biggest cost). Track when worse than current worst.
      if (cost < sym.worstCost) {
        sym.worstCost = cost;
        sym.worstId = r.brokerOrderId;
      }
      userEntry.symbols.set(r.symbol, sym);
    }

    const result: UserSlippage[] = [];
    for (const userEntry of userMap.values()) {
      const symRows: SlippageRow[] = [];
      let totalCost = 0;
      let totalOrders = 0;
      for (const [symbol, agg] of userEntry.symbols) {
        const avgPerShare =
          agg.perShare.length > 0 ? agg.perShare.reduce((a, b) => a + b, 0) / agg.perShare.length : 0;
        symRows.push({
          symbol,
          orders: agg.orders,
          totalShares: agg.shares,
          totalCostDollars: agg.cost,
          avgSlippagePerShare: avgPerShare,
          worstSlippage: agg.worstCost,
          worstSlippageOrderId: agg.worstId,
        });
        totalCost += agg.cost;
        totalOrders += agg.orders;
      }
      // Sort worst (most negative cost) first
      symRows.sort((a, b) => a.totalCostDollars - b.totalCostDollars);
      result.push({
        user: userEntry.user,
        totalOrders,
        totalCost,
        bySymbol: symRows,
      });
    }

    result.sort((a, b) => a.totalCost - b.totalCost);

    return NextResponse.json({
      windowDays: days,
      since: since.toISOString(),
      users: result,
      eligibleRows: rows.length,
      note:
        rows.length === 0
          ? "No FILLED rows with both placeholder + actual fill prices in window. Need engine to run and reconciler to update at least one row."
          : `Slippage cost is the user's $ impact (negative = lost to slippage). Phase 16 populates placeholder_fill_price for new orders; pre-Phase-16 rows are excluded.`,
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Slippage report failed");
    return NextResponse.json({ error: "Failed to build slippage report" }, { status: 500 });
  }
}
