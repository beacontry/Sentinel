import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";

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
    const [data, sentimentData] = await Promise.allSettled([
      client.getInsiderTransactions(upperSymbol),
      client.getInsiderSentiment(upperSymbol),
    ]);

    const transactions_raw =
      data.status === "fulfilled" ? data.value : null;
    const sentiment_raw =
      sentimentData.status === "fulfilled" ? sentimentData.value : null;

    if (
      (!transactions_raw?.data || transactions_raw.data.length === 0) &&
      (!sentiment_raw?.data || sentiment_raw.data.length === 0)
    ) {
      return NextResponse.json({
        symbol: upperSymbol,
        configured: true,
        transactions: [],
        summary: null,
        sentiment: [],
      }, {
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    }

    // Process sentiment (MSPR) data
    const sentiment = (sentiment_raw?.data ?? []).map((entry) => ({
      year: entry.year,
      month: entry.month,
      change: entry.change,
      mspr: entry.mspr,
    }));

    if (!transactions_raw?.data || transactions_raw.data.length === 0) {
      return NextResponse.json({
        symbol: upperSymbol,
        configured: true,
        transactions: [],
        summary: null,
        sentiment,
      }, {
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    }

    // Take last 20 transactions
    const transactions = transactions_raw.data.slice(0, 20).map((t) => {
      const typeLower = (t.transactionType ?? "").toLowerCase();
      let type: "buy" | "sell" | "gift" | "other";
      if (typeLower.includes("purchase") || typeLower.includes("buy") || typeLower.startsWith("p")) {
        type = "buy";
      } else if (typeLower.includes("sale") || typeLower.includes("sell") || typeLower.startsWith("s")) {
        type = "sell";
      } else if (typeLower.includes("gift")) {
        type = "gift";
      } else {
        type = "other";
      }

      return {
        name: t.name ?? "Unknown",
        type,
        shares: Math.abs(t.change ?? t.share ?? 0),
        price: t.transactionPrice ?? 0,
        date: t.filingDate ?? "",
        rawType: t.transactionType ?? "",
      };
    });

    // Compute summary
    let netBuyShares = 0;
    let netBuyValue = 0;
    let netSellShares = 0;
    let netSellValue = 0;

    for (const t of transactions) {
      if (t.type === "buy") {
        netBuyShares += t.shares;
        netBuyValue += t.shares * t.price;
      } else if (t.type === "sell") {
        netSellShares += t.shares;
        netSellValue += t.shares * t.price;
      }
    }

    const netDirection = netBuyValue >= netSellValue ? "buying" : "selling";
    const netAmount = Math.abs(netBuyValue - netSellValue);

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      transactions,
      summary: {
        netDirection,
        netAmount,
        totalBuyShares: netBuyShares,
        totalSellShares: netSellShares,
        totalBuyValue: netBuyValue,
        totalSellValue: netSellValue,
      },
      sentiment,
    }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Insider transactions fetch error:", message);
    return NextResponse.json(
      { error: "Failed to fetch insider transactions" },
      { status: 500 }
    );
  }
}
