import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getFinnhubClient, type FinnhubNewsArticle } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("news-feed");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(10, Number(searchParams.get("limit")) || 20));

  try {
    // Get user's watchlist symbols
    const watchlist = await db
      .select({ symbol: watchlistItems.symbol })
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, session.userId as string));

    if (watchlist.length === 0) {
      return NextResponse.json(
        { articles: [], page, totalPages: 0, hasWatchlist: false },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const finnhub = getFinnhubClient();
    if (!finnhub.isConfigured) {
      return NextResponse.json(
        { articles: [], page, totalPages: 0, error: "News provider not configured" },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    // Fetch news for each watchlist symbol (up to 5 to respect rate limits)
    const symbols = watchlist.slice(0, 5).map((w) => w.symbol);
    const newsResults = await Promise.allSettled(
      symbols.map((s) => finnhub.getCompanyNews(s, 3))
    );

    // Aggregate and deduplicate by headline
    const seen = new Set<string>();
    const allArticles: (FinnhubNewsArticle & { symbol: string })[] = [];

    for (let i = 0; i < newsResults.length; i++) {
      const result = newsResults[i];
      if (result.status !== "fulfilled") continue;

      for (const article of result.value) {
        if (seen.has(article.headline)) continue;
        seen.add(article.headline);
        allArticles.push({ ...article, symbol: symbols[i] });
      }
    }

    // Sort newest first
    allArticles.sort((a, b) => b.datetime - a.datetime);

    // Paginate
    const total = allArticles.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const pageArticles = allArticles.slice(start, start + limit);

    const articles = pageArticles.map((a) => ({
      headline: a.headline,
      summary: a.summary,
      source: a.source,
      datetime: a.datetime,
      symbol: a.symbol,
      url: a.url,
      image: a.image,
    }));

    return NextResponse.json(
      { articles, page, totalPages, hasWatchlist: true },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "News feed error");
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
