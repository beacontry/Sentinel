"use client";

import { useState, useEffect, useCallback } from "react";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";
import { useRouter } from "next/navigation";
import { PageIntro } from "@/components/layout/page-intro";
import { PenSquare, Hash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ComposeBox } from "@/components/social/compose-box";
import { PostCard } from "@/components/social/post-card";

interface SharedTrade {
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  strategy?: string | null;
  timestamp: string;
}

interface Post {
  id: string;
  content: string;
  symbol: string | null;
  sharedTrade?: SharedTrade | null;
  createdAt: string;
  userId: string;
  authorName: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [filterInput, setFilterInput] = useState("");

  const loadPosts = useCallback(async (page: number, symbol?: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (symbol) {
        params.set("symbol", symbol);
      }
      const res = await fetch(`/api/social/posts?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setPosts(data.posts);
      setPagination(data.pagination);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and filter changes
  useEffect(() => {
    setLoading(true);
    loadPosts(1, symbolFilter || undefined);
  }, [symbolFilter, loadPosts]);

  // Auto-refresh every 30s (pauses when tab hidden)
  usePolling(
    () => loadPosts(pagination.page, symbolFilter || undefined),
    POLLING_INTERVALS.postsRefresh,
  );

  function handleNewPost(post: Post) {
    setPosts((prev) => [post, ...prev]);
    setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
  }

  function handleLoadMore() {
    if (pagination.page < pagination.totalPages) {
      const nextPage = pagination.page + 1;
      const params = new URLSearchParams({ page: String(nextPage), limit: "20" });
      if (symbolFilter) params.set("symbol", symbolFilter);

      fetch(`/api/social/posts?${params}`)
        .then((res) => res.json())
        .then((data) => {
          setPosts((prev) => [...prev, ...data.posts]);
          setPagination(data.pagination);
        })
        .catch(() => {
          // Non-critical
        });
    }
  }

  function applySymbolFilter(e: React.FormEvent) {
    e.preventDefault();
    setSymbolFilter(filterInput.toUpperCase().trim());
  }

  function clearFilter() {
    setFilterInput("");
    setSymbolFilter("");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Network"
        title="Posts"
        description="Share quick takes, trade setups, and analysis with the community."
        stats={[
          { label: "Total Posts", value: String(pagination.total) },
          { label: "Page", value: `${pagination.page} / ${pagination.totalPages || 1}` },
          { label: "Showing", value: String(posts.length) },
          ...(symbolFilter ? [{ label: "Filter", value: `$${symbolFilter}`, tone: "brand" as const }] : []),
        ]}
      />

      {/* Symbol filter */}
      <form onSubmit={applySymbolFilter} className="flex items-center gap-2">
        <div className="w-36 sm:w-44">
          <Input
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value.toUpperCase())}
            placeholder="Filter by symbol"
            icon={<Hash className="h-4 w-4" />}
          />
        </div>
        <Button type="submit" variant="secondary" size="md">
          Filter
        </Button>
        {symbolFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilter}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </form>

      {/* Compose */}
      <ComposeBox onPost={handleNewPost} />

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" rounded="lg" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<PenSquare className="h-12 w-12" />}
          title="No posts yet"
          description={
            symbolFilter
              ? `No posts tagged with $${symbolFilter}.`
              : "Be the first to share something with the community."
          }
        />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              id={post.id}
              content={post.content}
              symbol={post.symbol}
              sharedTrade={post.sharedTrade}
              createdAt={post.createdAt}
              authorName={post.authorName}
              userId={post.userId}
              likeCount={post.likeCount}
              commentCount={post.commentCount}
              liked={post.liked}
              onClick={() => router.push(`/dashboard/posts/${post.id}`)}
            />
          ))}

          {pagination.page < pagination.totalPages && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" size="md" onClick={handleLoadMore}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
