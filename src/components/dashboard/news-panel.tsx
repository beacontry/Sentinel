"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Newspaper, ExternalLink, Globe } from "lucide-react";
import { Button } from "../ui/button";

interface NewsArticle {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string;
  category: string;
}

interface NewsPanelProps {
  symbol?: string;
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NewsPanel({ symbol }: NewsPanelProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [showMarket, setShowMarket] = useState(!symbol);

  useEffect(() => {
    async function fetchNews() {
      setLoading(true);
      try {
        const endpoint = showMarket || !symbol
          ? "/api/news/market"
          : `/api/news/${encodeURIComponent(symbol)}`;
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();
        setArticles(data.articles ?? []);
        setConfigured(data.configured !== false);
      } catch {
        // Silently fail -- news is non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, [symbol, showMarket]);

  if (!configured) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Newspaper className="w-4 h-4" />
          <span>Set FINNHUB_API_KEY in .env to enable news</span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-accent" />
            News
          </CardTitle>
          {symbol && (
            <div className="flex gap-1">
              <Button
                variant={!showMarket ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowMarket(false)}
              >
                {symbol}
              </Button>
              <Button
                variant={showMarket ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowMarket(true)}
              >
                <Globe className="w-3.5 h-3.5" />
                Market
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <p className="text-sm text-text-muted py-4 text-center">
          No recent news found
        </p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg bg-bg-elevated hover:bg-bg-hover
                border border-transparent hover:border-border-hover transition-all duration-200 group"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                  {article.headline}
                </h4>
                <ExternalLink className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {article.summary && (
                <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
                  {article.summary}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="neutral">{article.source}</Badge>
                <span className="text-xs text-text-muted">
                  {timeAgo(article.datetime)}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
