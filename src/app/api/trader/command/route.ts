import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections, traderTrades, traderDailyPnl, traderPositions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createBrokerClient } from "@/lib/brokers";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("trader-command");

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const command = body.command as string;

  try {
    switch (command) {
      case "flatten": {
        // Sell a single position or all positions directly through Alpaca
        const symbol = body.symbol as string | undefined;

        const [conn] = await db.select().from(brokerConnections)
          .where(and(eq(brokerConnections.userId, session.userId), eq(brokerConnections.isActive, true)))
          .limit(1);

        if (!conn) {
          return NextResponse.json({ error: "No active broker connection" }, { status: 400 });
        }

        const client = createBrokerClient(conn.broker, conn.apiKey, conn.apiSecret, conn.environment);
        const positions = await client.getPositions();

        const toClose = symbol
          ? positions.filter(p => p.symbol === symbol)
          : positions;

        if (toClose.length === 0) {
          // Position doesn't exist on broker — clean up stale DB record
          if (symbol) {
            await db.delete(traderPositions).where(
              and(eq(traderPositions.symbol, symbol), eq(traderPositions.userId, session.userId))
            ).catch(() => {});
            // Also try without userId for legacy records
            await db.delete(traderPositions).where(eq(traderPositions.symbol, symbol)).catch(() => {});
            log.info({ symbol }, "Cleaned up stale DB position — not found on broker");
            return NextResponse.json({ status: "ok", closed: [{ symbol, qty: 0, status: "removed_stale" }] });
          }
          return NextResponse.json({ error: "No positions found on broker" }, { status: 404 });
        }

        // Cancel all open orders first — stop orders block market sells
        // (disaster stops get re-placed on the next engine scan)
        try {
          if (client.cancelAllOrders) {
            await client.cancelAllOrders();
            await new Promise(r => setTimeout(r, 500)); // settle time
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to cancel orders before flatten");
        }

        const results: { symbol: string; qty: number; status: string; pnl?: number }[] = [];
        for (const pos of toClose) {
          if (pos.qty <= 0) continue;
          try {
            await client.placeOrder({
              symbol: pos.symbol,
              side: "sell",
              qty: String(pos.qty),
              type: "market",
              timeInForce: "day",
            });
            const realizedPnl = pos.unrealizedPnl;
            results.push({ symbol: pos.symbol, qty: pos.qty, status: "sold", pnl: realizedPnl });
            log.info({ symbol: pos.symbol, qty: pos.qty, pnl: realizedPnl }, "Position closed via command");

            // Record trade in DB
            try {
              await db.insert(traderTrades).values({
                userId: session.userId,
                symbol: pos.symbol,
                action: "manual_close",
                signal: "MANUAL",
                quantity: pos.qty,
                orderType: "market",
                fillPrice: pos.currentPrice,
                status: "FILLED",
                pnl: realizedPnl,
                notes: `Closed via Trader UI`,
                traderTimestamp: new Date(),
              });
            } catch { /* best effort */ }

            // Update daily P&L
            try {
              const today = new Date().toISOString().slice(0, 10);
              const [existing] = await db.select().from(traderDailyPnl)
                .where(and(eq(traderDailyPnl.date, today), eq(traderDailyPnl.userId, session.userId)))
                .limit(1);
              if (existing) {
                await db.update(traderDailyPnl)
                  .set({ realizedPnl: existing.realizedPnl + realizedPnl, tradesCount: existing.tradesCount + 1 })
                  .where(eq(traderDailyPnl.id, existing.id));
              } else {
                await db.insert(traderDailyPnl).values({ userId: session.userId, date: today, realizedPnl, unrealizedPnl: 0, tradesCount: 1, halted: false });
              }
            } catch { /* best effort */ }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            results.push({ symbol: pos.symbol, qty: pos.qty, status: `failed: ${msg}` });
            log.error({ symbol: pos.symbol, err: msg }, "Failed to close position");
          }
        }

        return NextResponse.json({ status: "ok", closed: results });
      }

      case "risk": {
        const params = body.params as Record<string, number | boolean | null>;
        if (!params) {
          return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }
        // Risk overrides are saved via /api/risk-profile PATCH — this is just for live engine push
        return NextResponse.json({ status: "ok", params });
      }

      default:
        return NextResponse.json({ error: `Unknown command: ${command}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ command, err: message }, "Command failed");
    return NextResponse.json({ error: `Command failed: ${message}` }, { status: 502 });
  }
}
