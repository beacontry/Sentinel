import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { placeBrokerOrderSchema } from "@/lib/validators";
import { createBrokerClient, BrokerError } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";

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
    const connection = await getActiveConnection(session.userId);
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const connection = await getActiveConnection(session.userId);
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
      type: parsed.data.type as "market" | "limit" | "stop" | "stop_limit",
      timeInForce: parsed.data.timeInForce,
      limitPrice: parsed.data.limitPrice,
      stopPrice: parsed.data.stopPrice,
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
    if (err instanceof BrokerError) {
      return NextResponse.json(
        { error: err.userMessage },
        { status: err.statusCode }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Broker order error");
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
