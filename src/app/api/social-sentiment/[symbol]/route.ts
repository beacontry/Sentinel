import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("social-sentiment");

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
    const data = await client.getSocialSentiment(upperSymbol);

    const reddit = data?.reddit ?? [];
    const twitter = data?.twitter ?? [];

    // Aggregate totals
    let redditMentions = 0;
    let redditPositive = 0;
    let redditNegative = 0;
    let twitterMentions = 0;
    let twitterPositive = 0;
    let twitterNegative = 0;

    for (const entry of reddit) {
      redditMentions += entry.mention ?? 0;
      redditPositive += entry.positiveScore ?? 0;
      redditNegative += entry.negativeScore ?? 0;
    }

    for (const entry of twitter) {
      twitterMentions += entry.mention ?? 0;
      twitterPositive += entry.positiveScore ?? 0;
      twitterNegative += entry.negativeScore ?? 0;
    }

    const totalMentions = redditMentions + twitterMentions;
    const totalPositive = redditPositive + twitterPositive;
    const totalNegative = redditNegative + twitterNegative;
    const avgScore = totalPositive + totalNegative > 0
      ? totalPositive / (totalPositive + totalNegative)
      : 0.5;

    // Trend: compare last 7 entries vs previous 7 entries
    function computeTrend(entries: typeof reddit): "up" | "down" | "flat" {
      if (entries.length < 4) return "flat";
      const recent = entries.slice(0, Math.min(7, Math.floor(entries.length / 2)));
      const previous = entries.slice(Math.min(7, Math.floor(entries.length / 2)), Math.min(14, entries.length));
      if (previous.length === 0) return "flat";
      const recentAvg = recent.reduce((s, e) => s + (e.mention ?? 0), 0) / recent.length;
      const prevAvg = previous.reduce((s, e) => s + (e.mention ?? 0), 0) / previous.length;
      const change = prevAvg > 0 ? (recentAvg - prevAvg) / prevAvg : 0;
      if (change > 0.1) return "up";
      if (change < -0.1) return "down";
      return "flat";
    }

    const trend = computeTrend([...reddit, ...twitter]);

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      reddit: {
        mentions: redditMentions,
        positiveScore: redditPositive,
        negativeScore: redditNegative,
      },
      twitter: {
        mentions: twitterMentions,
        positiveScore: twitterPositive,
        negativeScore: twitterNegative,
      },
      totalMentions,
      avgScore,
      trend,
    }, {
      headers: { "Cache-Control": "private, max-age=1800" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Social sentiment fetch error");
    return NextResponse.json(
      { error: "Failed to fetch social sentiment" },
      { status: 500 }
    );
  }
}
