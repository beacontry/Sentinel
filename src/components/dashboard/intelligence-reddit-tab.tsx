"use client";

// Reddit ticker-mention tab on the Analysis page intelligence panel.
// Pulls /api/reddit/[symbol] which queries the admin-managed subreddit
// list. Read-only feed — title, score, comments, sentiment chip, time
// ago, link out to the Reddit thread.

import { useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { MessagesSquare, ArrowUpCircle, ExternalLink } from "lucide-react";

interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  excerpt: string;
  author: string;
  url: string;
  score: number;
  numComments: number;
  createdUtc: number;
  flair: string | null;
  sentiment: "bullish" | "bearish" | "neutral";
}

interface RedditResponse {
  symbol: string;
  posts: RedditPost[];
  subreddits: string[];
  errored: string[];
  scannedAt: string;
  configured: boolean;
  unavailable?: boolean;
}

interface IntelligenceRedditTabProps {
  symbol: string;
}

function timeAgo(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000 - unixSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function IntelligenceRedditTab({ symbol }: IntelligenceRedditTabProps) {
  const [data, setData] = useState<RedditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchReddit() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/reddit/${encodeURIComponent(symbol)}`);
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const json = (await res.json()) as RedditResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchReddit();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100%" height="64px" rounded="lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        Couldn&apos;t reach Reddit. Try again in a minute.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        No data.
      </div>
    );
  }

  if (data.unavailable) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        Reddit feed temporarily unavailable. The lookup will retry on next
        refresh.
      </div>
    );
  }

  if (data.subreddits.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        No subreddits configured. An admin can add some on{" "}
        <a href="/dashboard/admin" className="text-accent hover:underline">
          /dashboard/admin
        </a>
        .
      </div>
    );
  }

  if (data.posts.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        <MessagesSquare className="w-8 h-8 mx-auto mb-2 text-text-muted" />
        No recent Reddit mentions for {symbol}
        <div className="mt-1 text-[10px]">
          Searched: {data.subreddits.map((s) => `r/${s}`).join(", ")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Reddit mentions
          </span>
          <Badge variant="neutral" className="text-[10px] font-mono">
            {data.posts.length}
          </Badge>
        </div>
        <span className="text-[10px] text-text-muted">
          {data.subreddits.length} sub{data.subreddits.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Posts */}
      <div className="space-y-2">
        {data.posts.slice(0, 25).map((p) => (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-border bg-bg-elevated p-3 transition-colors hover:border-border-hover hover:bg-bg-hover focus-visible:border-accent/40 focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[10px] text-accent shrink-0">
                r/{p.subreddit}
              </span>
              <span className="text-[10px] text-text-muted shrink-0">
                {timeAgo(p.createdUtc)}
              </span>
            </div>

            <p className="mt-1 text-xs text-text-primary leading-relaxed line-clamp-2">
              {p.title}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
              <span className="inline-flex items-center gap-1 font-mono">
                <ArrowUpCircle className="w-3 h-3" />
                {p.score}
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <MessagesSquare className="w-3 h-3" />
                {p.numComments}
              </span>
              <span className="font-mono text-text-muted">u/{p.author}</span>
              {p.flair && (
                <Badge variant="neutral" className="text-[9px] px-1.5 py-0">
                  {p.flair}
                </Badge>
              )}
              {p.sentiment !== "neutral" && (
                <Badge
                  variant={p.sentiment === "bullish" ? "bullish" : "bearish"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {p.sentiment}
                </Badge>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-accent">
                Open <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* Footer note: any errored subs + sources */}
      {data.errored.length > 0 && (
        <p className="text-[10px] text-text-muted italic">
          {data.errored.length} sub{data.errored.length === 1 ? "" : "s"} unreachable
          this fetch
        </p>
      )}
    </div>
  );
}
