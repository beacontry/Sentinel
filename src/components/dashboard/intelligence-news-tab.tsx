"use client";

import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { ExternalLink } from "lucide-react";

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

interface IntelligenceNewsTabProps {
  symbol: string;
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function IntelligenceNewsTab({ symbol }: IntelligenceNewsTabProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchNews() {
      setLoading(true);
      try {
        const res = await fetch(`/api/news/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setConfigured(data.configured !== false);
          setArticles(data.articles ?? []);
        }
      } catch {
        // Non-critical data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNews();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg bg-bg-elevated space-y-1.5">
            <Skeleton width="90%" height="14px" rounded="sm" />
            <Skeleton width="60%" height="10px" rounded="sm" />
            <div className="flex gap-2">
              <Skeleton width="50px" height="18px" rounded="lg" />
              <Skeleton width="40px" height="18px" rounded="lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        Set FINNHUB_API_KEY to enable news
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        No recent news for {symbol}
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
            <h4 className="text-xs font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
              {article.headline}
            </h4>
            <ExternalLink className="w-3 h-3 text-text-muted shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {article.summary && (
            <p className="text-[10px] text-text-muted mt-1 line-clamp-1 leading-relaxed">
              {article.summary}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="neutral" className="text-[10px] px-1.5 py-0.5">
              {article.source}
            </Badge>
            <span className="text-[10px] text-text-muted">
              {timeAgo(article.datetime)}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
