import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { placeBrokerOrderSchema } from "@/lib/validators";
import { createBrokerClient, BrokerError } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import { peekEngineStatus } from "@/lib/trading-engine";

const log = createRouteLogger("broker-orders");

async function getActiveConnection(userId: string) {
  const [connection] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.userId, userId),
        eq(brokerConnections.isActive, true)
      )
    )
    .limit(1);
  return connection;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [connection] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(brokerConnections)
        .where(
          and(
            eq(brokerConnections.userId, session.userId),
            eq(brokerConnections.isActive, true)
          )
        )
        .limit(1);
    });

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

  try {
    const connection = await getActiveConnection(auth.userId);
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

    const order = await client.placeOrder({
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
    });

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
