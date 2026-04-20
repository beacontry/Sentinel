import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("news-market");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getFinnhubClient();
  if (!client.isConfigured) {
    return NextResponse.json({ articles: [], configured: false }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const articles = await client.getMarketNews("general");

    return NextResponse.json({
      articles: articles.slice(0, 20).map((a) => ({
        id: a.id,
        headline: a.headline,
        summary: a.summary,
        source: a.source,
        url: a.url,
        datetime: a.datetime,
        image: a.image,
        category: a.category,
      })),
      configured: true,
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Market news fetch error");
    return NextResponse.json(
      { error: "Failed to fetch market news" },
      { status: 500 }
    );
  }
}
