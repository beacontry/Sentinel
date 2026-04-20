import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("sentiment");

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
    const data = await client.getNewsSentiment(upperSymbol);

    return NextResponse.json({
      symbol: upperSymbol,
      bullishPercent: data.sentiment?.bullishPercent ?? 0.5,
      bearishPercent: data.sentiment?.bearishPercent ?? 0.5,
      newsScore: data.companyNewsScore ?? 0,
      buzz: data.buzz?.buzz ?? 0,
      articlesInLastWeek: data.buzz?.articlesInLastWeek ?? 0,
      sectorAvgBullish: data.sectorAverageBullishPercent ?? 0.5,
      configured: true,
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Sentiment fetch error");
    return NextResponse.json(
      { error: "Failed to fetch sentiment" },
      { status: 500 }
    );
  }
}
