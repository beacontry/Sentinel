"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, ArrowRight } from "lucide-react";
import Link from "next/link";

interface NewsArticle {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NewsWidget() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/news/market");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (data.configured === false) {
          setError(true);
          return;
        }
        setArticles((data.articles ?? []).slice(0, 5));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-5 w-full" rounded="md" />
            <Skeleton className="h-4 w-2/3" rounded="md" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load news
      </p>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="py-5 text-center">
        <Newspaper className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No recent news</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {articles.map((article) => (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-[10px] bg-bg-elevated px-2.5 py-2 hover:bg-bg-hover
              transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="line-clamp-2 text-[13px] leading-5 text-text-primary
                group-hover:text-accent transition-colors">
                {article.headline}
              </h4>
              <ExternalLink className="w-3 h-3 text-text-muted shrink-0 mt-0.5
                opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge variant="neutral">{article.source}</Badge>
              <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                {timeAgo(article.datetime)}
              </span>
            </div>
          </a>
        ))}
      </div>

      <Link
        href="/dashboard/news"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        View All News <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
