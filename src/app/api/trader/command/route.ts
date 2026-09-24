import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { traderTrades } from "@/lib/db/schema";
import { createBrokerClient } from "@/lib/brokers";
import { resolveActiveConnection } from "@/lib/broker-connection";
import { decrypt } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { writeAudit, AuditAction } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limiter";
import { checkTier } from "@/lib/tiers-server";
import { isMarketOpen } from "@/lib/market-hours";
import { reserveManualFlatten, cancelAllAndWait, cancelSymbolOrdersAndWait, reconcilePendingTrades } from "@/lib/trading-engine";
import { z } from "zod";
import { isShuttingDown, shuttingDownResponseInit } from "@/lib/shutdown-state";

const commandSchema = z.object({
  command: z.enum(["flatten", "risk"]),
  symbol: z.string().max(10).optional(),
  params: z.record(z.union([z.number(), z.boolean(), z.null()])).optional(),
});

const log = createRouteLogger("trader-command");

/** Delay before the one reconcile pass a flatten starts during market hours,
 *  long enough for a market sell to fill. */
const FLATTEN_RECONCILE_DELAY_MS = 3000;

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

  // Flatten cancels the symbol's stops before its market sell. During the
  // shutdown drain the exit can land between the two and leave the position
  // with neither, so it waits for the new container. The emergency halt on
  // /api/trader/engine stays available.
  if (command === "flatten" && isShuttingDown()) {
    const { body: refusal, init } = shuttingDownResponseInit();
    return NextResponse.json(refusal, init);
  }

  // Flatten reservation tracked at handler scope so the catch below can
  // release it if a per-symbol audit-write throws and escapes the loop.
  let flattenRelease: ((sold: string[]) => void) | null = null;
  const flattenSold: string[] = [];

  try {
    switch (command) {
      case "flatten": {
        // Sell a single position or all positions directly through Alpaca

        // The shared resolver, so flatten acts on the same account as the
        // engine and the kill switch, never an arbitrary active row.
        const conn = await resolveActiveConnection(auth.userId);

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
            // Poll until the cancelled stops have actually released their
            // shares instead of a fixed 500ms settle, for the same reason as
            // flatten-all below.
            const cancel = await cancelSymbolOrdersAndWait(client, symbol, {
              filter: (o) => o.side === "sell" && (o.type === "stop" || o.type === "stop_limit"),
            });
            if (!cancel.released) {
              log.warn(
                { symbol, failedOrderIds: cancel.failedOrderIds },
                "Stop cancel before flatten did not fully release; the sell may be rejected",
              );
            }
          } else if (client.cancelAllOrders) {
            // Poll until the broker has actually released the cancelled
            // orders instead of a fixed 500ms: Alpaca cancels asynchronously
            // and a sell sent while a stop is pending_cancel is rejected for
            // insufficient qty.
            const cancel = await cancelAllAndWait(client);
            if (!cancel.released || cancel.failedOrderIds) {
              log.warn(
                { released: cancel.released, failedOrderIds: cancel.failedOrderIds },
                "Cancel-all before flatten did not fully release; some sells may be rejected",
              );
            }
          }
        } catch (err) {
          log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Failed to cancel orders before flatten");
        }

        // A flatten is protective, so it is never refused for the hour. Outside
        // regular hours the broker queues the market sells for the next open,
        // and the response says so rather than reporting them as sold.
        const queuedForOpen = !isMarketOpen();

        const results: { symbol: string; qty: number; status: string; pnl?: number }[] = [];
        // Reserve these symbols in the running engine's pendingExits so its
        // 15-min scan / 1-min exit poll won't also sell them mid-flatten
        // (double-sell / position-map drift). No-op when the engine isn't
        // running, so flatten-while-stopped behaves exactly as before.
        flattenRelease = reserveManualFlatten(auth.userId, toClose.map((p) => p.symbol)).release;
        for (const pos of toClose) {
          if (pos.qty <= 0) continue;
          try {
            const order = await client.placeOrder({
              symbol: pos.symbol,
              side: "sell",
              qty: String(pos.qty),
              type: "market",
              timeInForce: "day",
            });
            // The snapshot's unrealized P&L is an estimate, not the realized
            // figure: the sell has not filled yet (and outside regular hours
            // fills at the next open).
            const estimatedPnl = pos.unrealizedPnl;
            results.push({ symbol: pos.symbol, qty: pos.qty, status: queuedForOpen ? "queued" : "sold", pnl: estimatedPnl });
            flattenSold.push(pos.symbol);
            log.info(
              { symbol: pos.symbol, qty: pos.qty, estimatedPnl, brokerOrderId: order.id, queuedForOpen },
              "Position close submitted via command"
            );

            await writeAudit({
              actor: { userId: auth.userId, email: auth.email, role: auth.role },
              action: AuditAction.ORDER_PLACED,
              resourceType: "order",
              metadata: {
                symbol: pos.symbol,
                side: "sell",
                qty: pos.qty,
                type: "market",
                estimatedPnl,
                brokerOrderId: order.id,
                queuedForOpen,
                broker: conn.broker,
                environment: conn.environment,
                source: command === "flatten" && symbol ? "manual_flatten_one" : "manual_flatten_all",
              },
              request,
            });

            // Record the trade PENDING with the broker order id, the same way
            // the engine records its exits. reconcilePendingTrades sets the
            // real fill price, fill time and P&L when the broker reports the
            // fill, and adds the realized P&L to the daily total then, keyed
            // by the fill date. The snapshot price is kept only as the
            // placeholder the correction starts from. The broker order id is
            // also what keeps the broker-side exit reconciler from recording
            // this sell a second time.
            try {
              await db.insert(traderTrades).values({
                userId: auth.userId,
                brokerOrderId: order.id,
                symbol: pos.symbol,
                action: "manual_close",
                signal: "MANUAL",
                quantity: pos.qty,
                orderType: "market",
                fillPrice: null,
                placeholderFillPrice: pos.currentPrice,
                status: "PENDING",
                pnl: estimatedPnl,
                notes: queuedForOpen
                  ? `Closed via Trader UI outside market hours; queued for the next open`
                  : `Closed via Trader UI`,
                traderTimestamp: new Date(),
              });
            } catch (err) {
              // The sell is at the broker; only its record is missing. Log
              // enough to recover it (tax report, performance, daily P&L).
              log.error(
                {
                  err: err instanceof Error ? err.message : "unknown",
                  symbol: pos.symbol,
                  qty: pos.qty,
                  brokerOrderId: order.id,
                },
                "Failed to record flatten trade row; the sell was placed but trader_trades has no row for it"
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

        // One reconcile pass once the market sells have had time to fill, so
        // the rows reach FILLED with their real price even when the engine is
        // stopped (its scans and exit check are the usual reconcile callers).
        // Anything still open is picked up by the engine's next reconcile.
        if (flattenSold.length > 0 && !queuedForOpen) {
          const userId = auth.userId;
          setTimeout(() => {
            reconcilePendingTrades(client, userId).catch((err) => {
              log.warn({ err: err instanceof Error ? err.message : "unknown" }, "Post-flatten reconcile failed");
            });
          }, FLATTEN_RECONCILE_DELAY_MS);
        }

        return NextResponse.json({
          status: "ok",
          closed: results,
          queuedForOpen,
          ...(queuedForOpen && flattenSold.length > 0
            ? { message: "The market is closed. The sell orders are queued and will fill at the next open." }
            : {}),
        });
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
