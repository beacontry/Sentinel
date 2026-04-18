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
    const chain = await client.getOptionChain(upperSymbol);

    if (!chain.data || chain.data.length === 0) {
      return NextResponse.json({
        symbol: upperSymbol,
        available: false,
        configured: true,
      }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    // Aggregate put/call data from nearest expiration
    const nearest = chain.data[0];
    const calls = nearest.options?.CALL ?? [];
    const puts = nearest.options?.PUT ?? [];

    const totalCallVolume = calls.reduce((s, c) => s + (c.volume || 0), 0);
    const totalPutVolume = puts.reduce((s, p) => s + (p.volume || 0), 0);
    const totalCallOI = calls.reduce((s, c) => s + (c.openInterest || 0), 0);
    const totalPutOI = puts.reduce((s, p) => s + (p.openInterest || 0), 0);
    const avgCallIV = calls.length > 0
      ? calls.reduce((s, c) => s + (c.impliedVolatility || 0), 0) / calls.length
      : 0;
    const avgPutIV = puts.length > 0
      ? puts.reduce((s, p) => s + (p.impliedVolatility || 0), 0) / puts.length
      : 0;

    const pcRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

    return NextResponse.json({
      symbol: upperSymbol,
      available: true,
      configured: true,
      expirationDate: nearest.expirationDate,
      callVolume: totalCallVolume,
      putVolume: totalPutVolume,
      callOpenInterest: totalCallOI,
      putOpenInterest: totalPutOI,
      putCallRatio: pcRatio,
      avgCallIV,
      avgPutIV,
      contractCount: calls.length + puts.length,
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Options fetch error:", message);
    return NextResponse.json(
      { error: "Failed to fetch options data" },
      { status: 500 }
    );
  }
}
