"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalBadge } from "@/components/ui/signal-badge";
import { MessageSquare, ArrowRight } from "lucide-react";
import Link from "next/link";

interface FeedPost {
  id: string;
  userName: string;
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  comment?: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SignalFeedWidget() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/feed");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setPosts((data.posts ?? []).slice(0, 5));
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
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
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
        Unable to load feed
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-6">
        <MessageSquare className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">No shared signals yet</p>
        <Link
          href="/dashboard/feed"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {posts.map((post) => (
          <div
            key={post.id}
            className="px-3 py-2 rounded-lg bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-text-primary">
                  {post.symbol}
                </span>
                <SignalBadge signal={post.signal} />
              </div>
              <span className="text-xs text-text-muted">
                {timeAgo(post.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-text-muted">{post.userName}</span>
              {post.comment && (
                <span className="text-xs text-text-secondary truncate max-w-[200px]">
                  &mdash; {post.comment}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/feed"
        className="flex items-center justify-center gap-1 text-xs text-accent
          hover:text-accent-hover pt-3 transition-colors min-h-[44px]"
      >
        View Feed <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
