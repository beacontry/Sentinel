"use client";

import { useState, useEffect } from "react";
import type { FeedPost } from "@/types";
import { SignalPost } from "@/components/feed/signal-post";
import { LeaderboardCard } from "@/components/feed/leaderboard-card";
import { PageIntro } from "@/components/layout/page-intro";
import { Rss } from "lucide-react";

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/feed");
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts ?? []);
        }
      } catch {
        // Feed will be empty
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleLike(postId: string) {
    await fetch("/api/feed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Network"
        title="Feed"
        description="Browse the latest trading signals and ideas shared by the community."
        stats={[
          { label: "Signals", value: String(posts.length) },
          {
            label: "Bullish",
            value: String(posts.filter((p) => p.signal === "STRONG_BUY" || p.signal === "BUY").length),
            tone: "bullish",
          },
          {
            label: "Bearish",
            value: String(posts.filter((p) => p.signal === "STRONG_SELL" || p.signal === "SELL").length),
            tone: "bearish",
          },
          {
            label: "Total Likes",
            value: String(posts.reduce((sum, p) => sum + (p.likes ?? 0), 0)),
          },
        ]}
      />

      {/* Leaderboard */}
      <LeaderboardCard />

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <Rss className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            No shared signals yet
          </h3>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            Be the first to share. Open any symbol on the{" "}
            <a href="/dashboard/analysis" className="text-accent hover:underline">Analysis page</a>{" "}
            and tap Share — your signal appears here for the community to see.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          {posts.map((post) => (
            <SignalPost key={post.id} post={post} onLike={handleLike} />
          ))}
        </div>
      )}
    </div>
  );
}
