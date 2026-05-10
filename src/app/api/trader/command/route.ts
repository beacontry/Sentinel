import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections, traderTrades, traderDailyPnl } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createBrokerClient } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { writeAudit, AuditAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limiter";
import { z } from "zod";

const commandSchema = z.object({
  command: z.enum(["flatten", "risk"]),
  symbol: z.string().max(10).optional(),
  params: z.record(z.union([z.number(), z.boolean(), z.null()])).optional(),
});

const log = createRouteLogger("trader-command");

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { allowed } = rateLimit(`trader-cmd:${auth.userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid command", details: parsed.error.flatten() }, { status: 400 });
  }

  const { command, symbol } = parsed.data;

  try {
    switch (command) {
      case "flatten": {
        // Sell a single position or all positions directly through Alpaca

        const [conn] = await db.select().from(brokerConnections)
          .where(and(eq(brokerConnections.userId, auth.userId), eq(brokerConnections.isActive, true)))
          .limit(1);

        if (!conn) {
          return NextResponse.json({ error: "No active broker connection" }, { status: 400 });
        }

        const client = createBrokerClient(conn.broker, decrypt(conn.apiKey), decrypt(conn.apiSecret), conn.environment);
        const positions = await client.getPositions();

        const toClose = symbol
          ? positions.filter(p => p.symbol === symbol)
          : positions;

        if (toClose.length === 0) {
          return NextResponse.json({
            error: `No position found${symbol ? ` for ${symbol}` : ""} on broker`,
          }, { status: 404 });
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

            await writeAudit({
              actor: { userId: auth.userId, email: auth.email, role: auth.role },
              action: AuditAction.ORDER_PLACED,
              resourceType: "order",
              metadata: {
                symbol: pos.symbol,
                side: "sell",
                qty: pos.qty,
                type: "market",
                pnl: realizedPnl,
                broker: conn.broker,
                environment: conn.environment,
                source: command === "flatten" && symbol ? "manual_flatten_one" : "manual_flatten_all",
              },
              request,
            });

            // Record trade in DB
            try {
              await db.insert(traderTrades).values({
                userId: auth.userId,
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
                .where(and(eq(traderDailyPnl.date, today), eq(traderDailyPnl.userId, auth.userId)))
                .limit(1);
              if (existing) {
                await db.update(traderDailyPnl)
                  .set({ realizedPnl: existing.realizedPnl + realizedPnl, tradesCount: existing.tradesCount + 1 })
                  .where(eq(traderDailyPnl.id, existing.id));
              } else {
                await db.insert(traderDailyPnl).values({ userId: auth.userId, date: today, realizedPnl, unrealizedPnl: 0, tradesCount: 1, halted: false });
              }
            } catch { /* best effort */ }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown";
            results.push({ symbol: pos.symbol, qty: pos.qty, status: `failed: ${msg}` });
            log.error({ symbol: pos.symbol, err: msg }, "Failed to close position");
            await writeAudit({
              actor: { userId: auth.userId, email: auth.email, role: auth.role },
              action: AuditAction.ORDER_REJECTED,
              resourceType: "order",
              metadata: {
                symbol: pos.symbol,
                side: "sell",
                qty: pos.qty,
                error: msg.slice(0, 200),
                source: "manual_flatten",
              },
              request,
            });
          }
        }

        return NextResponse.json({ status: "ok", closed: results });
      }

      case "risk": {
        const params = parsed.data.params;
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
