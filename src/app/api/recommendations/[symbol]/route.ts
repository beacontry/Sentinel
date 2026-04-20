import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("recommendations");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) {
    return NextResponse.json({ configured: false }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const data = await client.getRecommendations(upperSymbol);

    if (!data || data.length === 0) {
      return NextResponse.json({
        symbol: upperSymbol,
        configured: true,
        recommendations: null,
      }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    // Use the latest period
    const latest = data[0];
    const buyTotal = (latest.buy ?? 0) + (latest.strongBuy ?? 0);
    const sellTotal = (latest.sell ?? 0) + (latest.strongSell ?? 0);
    const holdTotal = latest.hold ?? 0;
    const totalAnalysts = buyTotal + sellTotal + holdTotal;

    let consensus: string;
    if (buyTotal > sellTotal && buyTotal > holdTotal) {
      consensus = (latest.strongBuy ?? 0) > (latest.buy ?? 0) ? "Strong Buy" : "Buy";
    } else if (sellTotal > buyTotal && sellTotal > holdTotal) {
      consensus = (latest.strongSell ?? 0) > (latest.sell ?? 0) ? "Strong Sell" : "Sell";
    } else {
      consensus = "Hold";
    }

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      recommendations: {
        period: latest.period,
        buy: latest.buy ?? 0,
        hold: latest.hold ?? 0,
        sell: latest.sell ?? 0,
        strongBuy: latest.strongBuy ?? 0,
        strongSell: latest.strongSell ?? 0,
        consensus,
        totalAnalysts,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Recommendations fetch error");
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
