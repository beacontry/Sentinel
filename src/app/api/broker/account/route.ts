import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createBrokerClient, BrokerError } from "@/lib/brokers";
import { decrypt } from "@/lib/crypto";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("broker-account");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    // Find the user's active broker connection
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

    // Fetch account and positions in parallel
    const [accountResult, positionsResult] = await Promise.allSettled([
      client.getAccount(),
      client.getPositions(),
    ]);

    if (accountResult.status === "rejected") {
      const err = accountResult.reason;
      log.error({ err: err?.message ?? String(err) }, "Broker account fetch failed");
      const userMessage =
        err instanceof BrokerError ? err.userMessage : "Failed to fetch account data";
      return NextResponse.json({ error: userMessage }, { status: 502 });
    }

    const account = accountResult.value;
    const positions =
      positionsResult.status === "fulfilled" ? positionsResult.value : [];

    if (positionsResult.status === "rejected") {
      log.warn({ err: positionsResult.reason?.message }, "Positions fetch failed gracefully");
    }

    // Update lastConnectedAt
    await db
      .update(brokerConnections)
      .set({ lastConnectedAt: new Date() })
      .where(eq(brokerConnections.id, connection.id))
      .catch((err: Error) => {
        log.warn({ err: err.message }, "Failed to update lastConnectedAt");
      });

    return NextResponse.json({
      broker: connection.broker,
      environment: connection.environment,
      label: connection.label,
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        status: account.status,
        buyingPower: account.buyingPower,
        equity: account.equity,
        cash: account.cash,
        portfolioValue: account.portfolioValue,
        lastEquity: account.lastEquity,
        daytradeCount: account.daytradeCount,
        daytradeLimit: account.daytradeBuyingPower,
        patternDayTrader: account.patternDayTrader,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        side: p.side,
        avgEntryPrice: p.avgEntryPrice,
        currentPrice: p.currentPrice,
        marketValue: p.marketValue,
        unrealizedPl: p.unrealizedPnl,
        unrealizedPlpc: p.unrealizedPnlPct,
        changeToday: p.changeToday,
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
    log.error({ err: message }, "Broker account error");
    return NextResponse.json({ error: "Failed to fetch account data" }, { status: 500 });
  }
}
