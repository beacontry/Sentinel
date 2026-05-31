"use client";

import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { PageIntro } from "@/components/layout/page-intro";
import {
  Newspaper,
  ExternalLink,
  Clock,
  RefreshCw,
} from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface NewsArticle {
  headline: string;
  summary: string;
  source: string;
  datetime: number;
  symbol: string;
  url: string;
  image: string;
  // 2026-05-12 — keyword-based per-headline sentiment from the news/feed route
  sentiment?: "bullish" | "bearish" | "neutral";
}

function relativeTime(unixTimestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixTimestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [hasWatchlist, setHasWatchlist] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchNews = useCallback(async (p: number = 1, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(`/api/news/feed?page=${p}&limit=20`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setArticles(data.articles ?? []);
      setTotalPages(data.totalPages ?? 0);
      setHasWatchlist(data.hasWatchlist !== false);
      setLastUpdated(new Date());
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and page changes
  useEffect(() => {
    fetchNews(page);
  }, [fetchNews, page]);

  // Auto-refresh every 5 minutes (pauses when tab hidden)
  usePolling(() => fetchNews(page, false), POLLING_INTERVALS.newsRefresh);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Per-symbol news" description="Headlines per ticker (Finnhub) with sentiment badges. General market news is free." />
      <PageIntro
        eyebrow="Research"
        title="News"
        description="Market news aggregated from your watchlist symbols, refreshed every 5 minutes."
        actions={
          lastUpdated ? (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <RefreshCw className="w-3 h-3" />
              Updated {relativeTime(lastUpdated.getTime() / 1000)}
            </div>
          ) : undefined
        }
        stats={[
          { label: "Articles", value: String(articles.length) },
          { label: "Page", value: `${page} / ${totalPages || 1}` },
          { label: "Sources", value: String(new Set(articles.map((a) => a.source)).size) },
          { label: "Symbols", value: String(new Set(articles.map((a) => a.symbol)).size) },
        ]}
      />

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" rounded="lg" />
          ))}
        </div>
      ) : !hasWatchlist ? (
        <EmptyState
          icon={<Newspaper className="w-12 h-12" />}
          title="No Watchlist Symbols"
          description="Add symbols to your watchlist to see relevant market news here."
        />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="w-12 h-12" />}
          title="No News Available"
          description="No recent news found for your watchlist symbols. Check back later."
        />
      ) : (
        <>
          <div className="space-y-3">
            {articles.map((article, idx) => (
              <a
                key={`${article.datetime}-${idx}`}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Card hover className="transition-all duration-200">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Headline */}
                      <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2">
                        {article.headline}
                      </h3>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="default">{article.symbol}</Badge>
                        <Badge variant="neutral">{article.source}</Badge>
                        {article.sentiment && article.sentiment !== "neutral" && (
                          <span title="Headline sentiment from keyword classifier — not financial advice">
                            <Badge
                              variant={article.sentiment === "bullish" ? "bullish" : "bearish"}
                              className="text-[10px] uppercase tracking-wider"
                            >
                              {article.sentiment === "bullish" ? "▲ Bullish" : "▼ Bearish"}
                            </Badge>
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock className="w-3 h-3" />
                          {relativeTime(article.datetime)}
                        </span>
                      </div>

                      {/* Summary */}
                      {article.summary && (
                        <p className="text-xs text-text-secondary mt-2 line-clamp-2 leading-relaxed">
                          {article.summary}
                        </p>
                      )}
                    </div>

                    <div className="flex items-start shrink-0">
                      <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center pt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
