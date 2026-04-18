import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { brokerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function getAlpacaBaseUrl(environment: string): string {
  return environment === "live"
    ? "https://api.alpaca.markets"
    : "https://paper-api.alpaca.markets";
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find the user's active broker connection
    const [connection] = await db
      .select()
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.userId, session.userId),
          eq(brokerConnections.isActive, true)
        )
      )
      .limit(1);

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
    const headers = {
      "APCA-API-KEY-ID": connection.apiKey,
      "APCA-API-SECRET-KEY": connection.apiSecret,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Fetch account and positions in parallel
      const [accountRes, positionsRes] = await Promise.allSettled([
        fetch(`${baseUrl}/v2/account`, { headers, signal: controller.signal }),
        fetch(`${baseUrl}/v2/positions`, { headers, signal: controller.signal }),
      ]);

      if (accountRes.status === "rejected" || !accountRes.value.ok) {
        const status = accountRes.status === "fulfilled" ? accountRes.value.status : 0;
        console.error("Alpaca account fetch failed:", status);
        return NextResponse.json(
          { error: status === 403 ? "Invalid API credentials" : "Failed to fetch account data" },
          { status: 502 }
        );
      }

      let accountData: Record<string, unknown>;
      try {
        accountData = await accountRes.value.json();
      } catch {
        return NextResponse.json({ error: "Invalid response from broker" }, { status: 502 });
      }

      let positions: Record<string, unknown>[] = [];
      if (positionsRes.status === "fulfilled" && positionsRes.value.ok) {
        try {
          positions = await positionsRes.value.json();
        } catch {
          // Positions fetch failed gracefully — return empty
          console.warn("Failed to parse positions response");
        }
      }

      // Update lastConnectedAt
      await db
        .update(brokerConnections)
        .set({ lastConnectedAt: new Date() })
        .where(eq(brokerConnections.id, connection.id))
        .catch((err: Error) => {
          console.warn("Failed to update lastConnectedAt:", err.message);
        });

      return NextResponse.json({
        broker: connection.broker,
        environment: connection.environment,
        label: connection.label,
        account: {
          id: accountData.id,
          accountNumber: accountData.account_number,
          status: accountData.status,
          buyingPower: accountData.buying_power,
          equity: accountData.equity,
          cash: accountData.cash,
          portfolioValue: accountData.portfolio_value,
          lastEquity: accountData.last_equity,
          daytradeCount: accountData.daytrade_count,
          daytradeLimit: accountData.daytrading_buying_power,
          patternDayTrader: accountData.pattern_day_trader,
        },
        positions: positions.map((p) => ({
          symbol: p.symbol,
          qty: p.qty,
          side: p.side,
          avgEntryPrice: p.avg_entry_price,
          currentPrice: p.current_price,
          marketValue: p.market_value,
          unrealizedPl: p.unrealized_pl,
          unrealizedPlpc: p.unrealized_plpc,
          changeToday: p.change_today,
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
    console.error("Broker account error:", message);
    return NextResponse.json({ error: "Failed to fetch account data" }, { status: 500 });
  }
}
