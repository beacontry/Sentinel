"use client";

import { useCallback, useEffect, useState } from "react";
import { Newspaper, ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";

/**
 * Live news feed widget.
 *
 * Heavier-duty cousin of the static <NewsWidget>:
 *  - polls /api/news/feed every newsRefresh (5 min) so the latest
 *    headlines surface without page reload
 *  - shows up to 15 items in a scrolling list (max-height with
 *    overflow-y-auto)
 *  - colored sentiment indicator per item (bullish ▲ / bearish ▼ / -)
 *  - watchlist-symbol items appear first (the API does this server-side
 *    by including watchlist symbols in the article fetch)
 *  - "just now" / "Xm ago" relative time on each item
 *  - solid background colors per Sentinel design tokens (no gradients)
 *
 * Designed to be added to the user's dashboard layout via the Edit
 * Layout flow. Sits nicely as a right-column anchor on wide screens.
 */
interface FeedArticle {
  headline: string;
  summary?: string;
  source: string;
  datetime: number;
  symbol?: string;
  url: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function LiveNewsFeedWidget() {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/news/feed?limit=15");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setArticles(data.articles ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh every 5 min (POLLING_INTERVALS.newsRefresh). usePolling
  // pauses on Page Visibility hidden so background tabs don't keep
  // burning API quota.
  usePolling(refresh, POLLING_INTERVALS.newsRefresh);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-5 w-full" rounded="md" />
            <Skeleton className="h-4 w-2/3" rounded="md" />
          </div>
        ))}
      </div>
    );
  }

  if (error || articles.length === 0) {
    return (
      <div className="py-5 text-center">
        <Newspaper className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">
          {error ? "Unable to load news" : "No recent news"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
      {articles.map((article, i) => {
        const tone =
          article.sentiment === "bullish"
            ? "text-bullish"
            : article.sentiment === "bearish"
              ? "text-bearish"
              : "text-text-muted";
        const Icon =
          article.sentiment === "bullish"
            ? TrendingUp
            : article.sentiment === "bearish"
              ? TrendingDown
              : null;

        return (
          <a
            key={`${article.url}-${i}`}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-lg bg-bg-elevated px-3 py-2 hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="line-clamp-2 text-[13px] leading-5 text-text-primary group-hover:text-accent transition-colors">
                {article.headline}
              </h4>
              <ArrowUpRight className="w-3 h-3 text-text-muted shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {Icon && (
                <span className={`flex items-center gap-1 text-[11px] font-medium ${tone}`}>
                  <Icon className="w-3 h-3" />
                  {article.sentiment === "bullish" ? "Bullish" : "Bearish"}
                </span>
              )}
              {article.symbol && (
                <Badge variant="neutral">{article.symbol}</Badge>
              )}
              <span className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                {article.source}
              </span>
              <span className="text-[10px] text-text-muted ml-auto">
                {timeAgo(article.datetime)}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
