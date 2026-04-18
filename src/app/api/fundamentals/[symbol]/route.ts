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
    const data = await client.getBasicFinancials(upperSymbol);

    if (!data?.metric) {
      return NextResponse.json({
        symbol: upperSymbol,
        configured: true,
        metrics: null,
      }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    const m = data.metric;

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      metrics: {
        peRatio: m["peBasicExclExtraTTM"] ?? null,
        eps: m["epsBasicExclExtraItemsTTM"] ?? null,
        beta: m["beta"] ?? null,
        weekHigh52: m["52WeekHigh"] ?? null,
        weekLow52: m["52WeekLow"] ?? null,
        dividendYield: m["dividendYieldIndicatedAnnual"] ?? null,
        marketCap: m["marketCapitalization"] ?? null,
        revenuePerShare: m["revenuePerShareTTM"] ?? null,
        currentRatio: m["currentRatioQuarterly"] ?? null,
        grossMargin: m["grossMarginTTM"] ?? null,
        netProfitMargin: m["netProfitMarginTTM"] ?? null,
        roeTTM: m["roeTTM"] ?? null,
        debtToEquity: m["totalDebt/totalEquityQuarterly"] ?? null,
        bookValuePerShare: m["bookValuePerShareQuarterly"] ?? null,
        priceSalesRatio: m["psTTM"] ?? null,
        priceBookRatio: m["pbQuarterly"] ?? null,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Basic financials fetch error:", message);
    return NextResponse.json(
      { error: "Failed to fetch fundamentals" },
      { status: 500 }
    );
  }
}
