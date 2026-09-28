import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { resolveActiveConnection } from "@/lib/broker-connection";
import { withTimeout, isStatementTimeout } from "@/lib/db";
import { placeBrokerOrderSchema } from "@/lib/validators";
import {
  createBrokerClient,
  BrokerError,
  isAmbiguousOrderError,
  isNotWorkingOrder,
  lookupOrderByClientId,
  type BrokerOrder,
} from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { peekEngineStatus } from "@/lib/trading-engine";
import { checkTier } from "@/lib/tiers-server";
import { isShuttingDown, shuttingDownResponseInit } from "@/lib/shutdown-state";
import { rateLimit } from "@/lib/rate-limiter";

const log = createRouteLogger("broker-orders");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connection = await withTimeout(3000, (tx) =>
      resolveActiveConnection(session.userId, tx)
    );

    if (!connection) {
      return NextResponse.json(
        { error: "No active broker connection found" },
        { status: 404 }
      );
    }

    const client = createBrokerClient(
      connection.broker,
      decrypt(connection.apiKey),
      decrypt(connection.apiSecret),
      connection.environment
    );

    const orders = await client.getOrders(50);

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty,
        filledQty: o.filledQty,
        filledAvgPrice: o.filledPrice,
        status: o.status,
        timeInForce: o.timeInForce,
        limitPrice: o.limitPrice,
        stopPrice: o.stopPrice,
        submittedAt: o.submittedAt,
        filledAt: o.filledAt,
        canceledAt: o.canceledAt,
      })),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    if (err instanceof BrokerError) {
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Broker orders error");
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  // No new orders while the process drains for shutdown: the exit can land
  // between the order and anything that should follow it.
  if (isShuttingDown()) {
    const { body: refusal, init } = shuttingDownResponseInit();
    return NextResponse.json(refusal, init);
  }

  // Per-user cap on order submissions, ahead of the tier lookup and the body
  // parse. Keyed on the user id so it cannot be reset by changing networks.
  const { allowed } = rateLimit(`broker-order:${auth.userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many orders. Wait a minute and try again.", code: "RATE_LIMITED", retryable: true },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Trader tier or higher — manual order placement requires a paid
  // sub. Free users can browse / educate / watch; can't actually trade.
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = placeBrokerOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  // Engine-running gate. Manual orders while the engine is also placing
  // orders create a position-map drift bug: the engine's in-memory map
  // doesn't know about the user's manual trade until the next scan
  // reconciles, during which it may have already placed a conflicting one
  // (e.g. a stop sized for a position that's now double the assumed size).
  const status = peekEngineStatus(auth.userId);
  if (status?.running) {
    return NextResponse.json(
      {
        error: "Stop the engine before placing manual orders.",
        code: "ENGINE_RUNNING",
      },
      { status: 409 }
    );
  }

  // One client_order_id per order intent. The ticket sends its own and
  // reuses it on a resubmit, so the broker refuses a second order for the
  // same intent. A caller that sends none gets one here, which still lets
  // the lookup below resolve a lost response. Minted before the try so a
  // refusal's audit row carries it too.
  const clientOrderId = parsed.data.clientOrderId ?? randomUUID();

  try {
    const connection = await resolveActiveConnection(auth.userId);
    if (!connection) {
      return NextResponse.json(
        { error: "No active broker connection found" },
        { status: 404 }
      );
    }

    // The ticket names the connection it was showing. If the active one has
    // changed since (a switch in the sidebar, another tab or another device),
    // refuse before the broker is contacted: the user confirmed an order for
    // a different account, possibly paper where this one is live.
    if (
      connection.id !== parsed.data.expectedConnectionId ||
      (parsed.data.expectedEnvironment !== undefined &&
        connection.environment !== parsed.data.expectedEnvironment)
    ) {
      log.warn(
        {
          userId: auth.userId,
          expectedConnectionId: parsed.data.expectedConnectionId,
          expectedEnvironment: parsed.data.expectedEnvironment ?? null,
          activeConnectionId: connection.id,
          activeEnvironment: connection.environment,
        },
        "Manual order refused: active broker connection changed since the ticket loaded"
      );
      return NextResponse.json(
        {
          error:
            connection.environment === "live"
              ? "Your active broker account changed to LIVE since this ticket loaded. Review the order and submit again."
              : "Your active broker account changed since this ticket loaded. Review the order and submit again.",
          code: "CONNECTION_CHANGED",
          retryable: false,
          activeConnection: {
            id: connection.id,
            environment: connection.environment,
            broker: connection.broker,
            label: connection.label,
          },
        },
        { status: 409 }
      );
    }

    const client = createBrokerClient(
      connection.broker,
      decrypt(connection.apiKey),
      decrypt(connection.apiSecret),
      connection.environment
    );

    let order: BrokerOrder;
    let resolvedAfter: "unknown" | "duplicate" | null = null;
    try {
      order = await client.placeOrder({
        symbol: parsed.data.symbol,
        side: parsed.data.side as "buy" | "sell",
        qty: parsed.data.qty,
        notional: parsed.data.notional,
        type: parsed.data.type as "market" | "limit" | "stop" | "stop_limit",
        timeInForce: parsed.data.timeInForce,
        limitPrice: parsed.data.limitPrice,
        stopPrice: parsed.data.stopPrice,
        orderClass: parsed.data.orderClass,
        takeProfitPrice: parsed.data.takeProfitPrice,
        stopLossPrice: parsed.data.stopLossPrice,
        clientOrderId,
      });
    } catch (err) {
      // A timeout, dropped connection or 5xx after the POST was sent does not
      // mean the broker refused the order, and a duplicate client_order_id
      // means an order for this intent already exists. Ask the broker before
      // answering: reporting a live order as failed invites a second one.
      if (!isAmbiguousOrderError(err)) throw err;
      const found = await lookupOrderByClientId(client, clientOrderId);
      if (!found) {
        log.warn(
          { clientOrderId, outcome: err.orderOutcome, err: err.message.slice(0, 200) },
          "Manual order outcome unknown"
        );
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ORDER_UNCONFIRMED,
          resourceType: "order",
          resourceId: clientOrderId,
          metadata: {
            symbol: parsed.data.symbol,
            side: parsed.data.side,
            qty: parsed.data.qty ?? null,
            notional: parsed.data.notional ?? null,
            type: parsed.data.type,
            clientOrderId,
            outcome: err.orderOutcome,
            error: err.message.slice(0, 200),
            broker: connection.broker,
            environment: connection.environment,
            source: "manual_ui",
          },
          request,
        });
        return NextResponse.json(
          {
            error:
              "Order status unknown: the broker did not confirm it. Check your open orders before placing it again.",
            code: "ORDER_STATUS_UNKNOWN",
            retryable: false,
            clientOrderId,
          },
          { status: 202 }
        );
      }
      if (isNotWorkingOrder(found)) {
        // The broker has an order under this id, but it was rejected,
        // canceled or expired with nothing filled. Not placed, and the id is
        // spent at the broker: the ticket must mint a new one to try again.
        log.warn(
          { clientOrderId, orderId: found.id, status: found.status, outcome: err.orderOutcome },
          "Manual order found by client_order_id but not working"
        );
        await writeAudit({
          actor: { userId: auth.userId, email: auth.email, role: auth.role },
          action: AuditAction.ORDER_REJECTED,
          resourceType: "order",
          resourceId: found.id,
          metadata: {
            symbol: parsed.data.symbol,
            side: parsed.data.side,
            qty: parsed.data.qty ?? null,
            notional: parsed.data.notional ?? null,
            type: parsed.data.type,
            clientOrderId,
            brokerStatus: found.status,
            resolvedAfter: err.orderOutcome,
            reason: "found_not_working",
            broker: connection.broker,
            environment: connection.environment,
            source: "manual_ui",
          },
          request,
        });
        return NextResponse.json(
          {
            error: `The broker has this order as ${found.status.toLowerCase()}, so it is not working. Submitting again places a new order.`,
            code: "ORDER_NOT_WORKING",
            retryable: false,
            clientOrderId,
            brokerStatus: found.status,
          },
          { status: 422 }
        );
      }
      order = found;
      resolvedAfter = err.orderOutcome;
      log.warn(
        { clientOrderId, orderId: found.id, outcome: err.orderOutcome },
        "Manual order confirmed by client_order_id lookup after an ambiguous submit"
      );
    }

    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.ORDER_PLACED,
      resourceType: "order",
      resourceId: order.id,
      metadata: {
        symbol: parsed.data.symbol,
        side: parsed.data.side,
        qty: parsed.data.qty ?? null,
        notional: parsed.data.notional ?? null,
        type: parsed.data.type,
        timeInForce: parsed.data.timeInForce,
        limitPrice: parsed.data.limitPrice ?? null,
        stopPrice: parsed.data.stopPrice ?? null,
        orderClass: parsed.data.orderClass ?? "simple",
        takeProfitPrice: parsed.data.takeProfitPrice ?? null,
        stopLossPrice: parsed.data.stopLossPrice ?? null,
        broker: connection.broker,
        environment: connection.environment,
        clientOrderId,
        resolvedAfter,
        source: "manual_ui",
      },
      request,
    });

    return NextResponse.json(
      {
        order: {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          qty: order.qty,
          status: order.status,
          timeInForce: order.timeInForce,
          limitPrice: order.limitPrice,
          stopPrice: order.stopPrice,
          submittedAt: order.submittedAt,
        },
        clientOrderId,
        // The order already existed under this client_order_id: a resubmit
        // of the same intent, answered with the original order.
        deduplicated: resolvedAfter === "duplicate",
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.ORDER_REJECTED,
      resourceType: "order",
      metadata: {
        symbol: parsed.data.symbol,
        side: parsed.data.side,
        qty: parsed.data.qty ?? null,
        notional: parsed.data.notional ?? null,
        type: parsed.data.type,
        clientOrderId,
        error: message.slice(0, 200),
        source: "manual_ui",
      },
      request,
    });
    if (err instanceof BrokerError) {
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode }
      );
    }
    log.error({ err: message }, "Broker order error");
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
