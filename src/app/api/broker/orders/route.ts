import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { placeBrokerOrderSchema } from "@/lib/validators";

function getAlpacaBaseUrl(environment: string): string {
  return environment === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
}

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

    if (connection.broker !== "alpaca") {
      return NextResponse.json(
        { error: `${connection.broker} is not yet supported` },
        { status: 400 }
      );
    }

    const baseUrl = getAlpacaBaseUrl(connection.environment);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(
        `${baseUrl}/v2/orders?status=all&limit=50&direction=desc`,
        {
          headers: {
            "APCA-API-KEY-ID": connection.apiKey,
            "APCA-API-SECRET-KEY": connection.apiSecret,
          },
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        console.error("Alpaca orders fetch failed:", res.status);
        return NextResponse.json(
          { error: "Failed to fetch orders" },
          { status: 502 }
        );
      }

      let orders: Record<string, unknown>[];
      try {
        orders = await res.json();
      } catch {
        return NextResponse.json({ error: "Invalid response from broker" }, { status: 502 });
      }

      return NextResponse.json({
        orders: orders.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          qty: o.qty,
          filledQty: o.filled_qty,
          filledAvgPrice: o.filled_avg_price,
          status: o.status,
          timeInForce: o.time_in_force,
          limitPrice: o.limit_price,
          stopPrice: o.stop_price,
          submittedAt: o.submitted_at,
          filledAt: o.filled_at,
          canceledAt: o.canceled_at,
        })),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort")) {
      return NextResponse.json({ error: "Connection timed out" }, { status: 504 });
    }
    console.error("Broker orders error:", message);
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

    if (connection.broker !== "alpaca") {
      return NextResponse.json(
        { error: `${connection.broker} is not yet supported` },
        { status: 400 }
      );
    }

    const baseUrl = getAlpacaBaseUrl(connection.environment);

    const orderPayload: Record<string, string> = {
      symbol: parsed.data.symbol,
      side: parsed.data.side,
      qty: parsed.data.qty,
      type: parsed.data.type,
      time_in_force: parsed.data.timeInForce,
    };

    if (parsed.data.limitPrice) orderPayload.limit_price = parsed.data.limitPrice;
    if (parsed.data.stopPrice) orderPayload.stop_price = parsed.data.stopPrice;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers: {
          "APCA-API-KEY-ID": connection.apiKey,
          "APCA-API-SECRET-KEY": connection.apiSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        console.error("Alpaca order placement failed:", res.status, errorText);

        // Parse Alpaca error for user-friendly message
        let userError = "Failed to place order";
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.message) {
            userError = errorData.message;
          }
        } catch {
          // Use generic error
        }

        return NextResponse.json({ error: userError }, { status: 400 });
      }

      let order: Record<string, unknown>;
      try {
        order = await res.json();
      } catch {
        return NextResponse.json({ error: "Invalid response from broker" }, { status: 502 });
      }

      return NextResponse.json(
        {
          order: {
            id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            qty: order.qty,
            status: order.status,
            timeInForce: order.time_in_force,
            limitPrice: order.limit_price,
            stopPrice: order.stop_price,
            submittedAt: order.submitted_at,
          },
        },
        { status: 201 }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("abort")) {
      return NextResponse.json({ error: "Connection timed out" }, { status: 504 });
    }
    console.error("Broker order error:", message);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
