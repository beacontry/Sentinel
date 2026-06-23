import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections, traderTrades, traderDailyPnl } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createBrokerClient } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { writeAudit, AuditAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limiter";
import { checkTier } from "@/lib/tiers-server";
import { getETDateString } from "@/lib/market-hours";
import { reserveManualFlatten } from "@/lib/trading-engine";
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

  // Rate-limit gate first (audit #79) — the cheapest per-user check, ahead of
  // the tier DB lookup and the body parse, so a flood can't drive that work.
  const { allowed } = rateLimit(`trader-cmd:${auth.userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Trader tier or higher — engine command (flatten / risk update) is
  // a paid-feature mutation. Returns 402 with upgrade payload if not.
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid command", details: parsed.error.flatten() }, { status: 400 });
  }

  const { command, symbol } = parsed.data;

  // Flatten reservation tracked at handler scope so the catch below can
  // release it if a per-symbol audit-write throws and escapes the loop.
  let flattenRelease: ((sold: string[]) => void) | null = null;
  const flattenSold: string[] = [];

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

        // Cancel open orders that would block the market sells. Stop / stop-limit
        // sells against these positions are the actual blockers.
        //
        // P2 audit (2026-06-09) — pre-fix this called cancelAllOrders even on a
        // single-symbol flatten, killing unrelated manual GTC orders the user
        // had placed on other symbols. Now: single-symbol flatten cancels only
        // blocking orders for THAT symbol via cancelOrder(id); flatten-all
        // keeps cancelAllOrders (consistent with closing every position).
        try {
          if (symbol && client.cancelOrder) {
            const openOrders = await client.getOrders(100, "open");
            const toCancel = openOrders.filter(
              (o) =>
                o.symbol === symbol &&
                o.side === "sell" &&
                (o.type === "stop" || o.type === "stop_limit"),
            );
            for (const o of toCancel) {
              try {
                await client.cancelOrder(o.id);
              } catch (err) {
                log.warn(
                  { orderId: o.id, symbol, err: err instanceof Error ? err.message : "unknown" },
                  "Failed to cancel blocking order before flatten",
                );
              }
            }
            if (toCancel.length > 0) {
              await new Promise(r => setTimeout(r, 500)); // settle time
            }
          } else if (client.cancelAllOrders) {
            await client.cancelAllOrders();
            await new Promise(r => setTimeout(r, 500)); // settle time
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to cancel orders before flatten");
        }

        const results: { symbol: string; qty: number; status: string; pnl?: number }[] = [];
        // Reserve these symbols in the running engine's pendingExits so its
        // 15-min scan / 1-min exit poll won't also sell them mid-flatten
        // (double-sell / position-map drift). No-op when the engine isn't
        // running, so flatten-while-stopped behaves exactly as before.
        flattenRelease = reserveManualFlatten(auth.userId, toClose.map((p) => p.symbol)).release;
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
            flattenSold.push(pos.symbol);
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

            // Update daily P&L. Key by ET date — the engine writes every
            // traderDailyPnl row via getETDateString(); a UTC key here would
            // fragment the day's realized total into a separate (tomorrow-
            // dated) row whenever a flatten lands after ~8 PM ET.
            // Atomic upsert on the (date, userId) accumulator row (audit #35).
            // The old select-then-(insert|update) lost a flatten's realized P&L
            // under concurrency: two writers both saw "no row", raced the
            // INSERT, the unique (date,userId) index rejected one, and the catch
            // swallowed it; the UPDATE branch was a lost-update RMW. ON CONFLICT
            // folds the deltas in one statement.
            try {
              await db.insert(traderDailyPnl)
                .values({ userId: auth.userId, date: getETDateString(), realizedPnl, unrealizedPnl: 0, tradesCount: 1, halted: false })
                .onConflictDoUpdate({
                  target: [traderDailyPnl.date, traderDailyPnl.userId],
                  set: {
                    realizedPnl: sql`${traderDailyPnl.realizedPnl} + ${realizedPnl}`,
                    tradesCount: sql`${traderDailyPnl.tradesCount} + 1`,
                  },
                });
            } catch (err) {
              log.warn(
                { err: err instanceof Error ? err.message : "unknown", symbol: pos.symbol },
                "Failed to record flatten P&L to daily total"
              );
            }
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

        flattenRelease(flattenSold);
        flattenRelease = null;
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
    // Release the flatten reservation if a sell's audit-write threw and
    // escaped the loop — otherwise the reserved symbols stay stuck in
    // pendingExits and the engine never re-evaluates them.
    flattenRelease?.(flattenSold);
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ command, err: message }, "Command failed");
    return NextResponse.json({ error: `Command failed: ${message}` }, { status: 502 });
  }
}
