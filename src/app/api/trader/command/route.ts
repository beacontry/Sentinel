import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
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
          return NextResponse.json({ error: `No position found${symbol ? ` for ${symbol}` : ""}` }, { status: 404 });
        }

        const results: { symbol: string; qty: number; status: string }[] = [];
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
            results.push({ symbol: pos.symbol, qty: pos.qty, status: "sold" });
            log.info({ symbol: pos.symbol, qty: pos.qty }, "Position closed via command");
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
