"use client";

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { Skeleton } from "@/components/ui/skeleton";
import { ageLabel, fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody } from "./widget-body";

interface FeedPost {
  id: string;
  userName: string;
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  comment?: string;
  createdAt: string;
}

/** The five latest signals shared to the community feed. */
export function SignalFeedWidget() {
  const load = useWidgetLoad<FeedPost[]>(async (signal) => {
    const data = await fetchWidgetJson<{ posts?: FeedPost[] }>("/api/feed", signal);
    return (data.posts ?? []).slice(0, 5);
  });

  return (
    <WidgetBody
      load={load}
      label="the signal feed"
      skeleton={
        <ul className="divide-y divide-[var(--color-hairline-inner)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="space-y-1.5 py-2.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </li>
          ))}
        </ul>
      }
      isEmpty={(d) => d.length === 0}
      empty={
        <EmptyState
          compact
          icon={<MessageSquare />}
          title="No shared signals yet"
          description="Signals other traders share show up here."
          action={{ label: "Open the feed", href: "/dashboard/feed" }}
        />
      }
    >
      {(posts) => {
        const now = Date.now();
        return (
          <ul className="divide-y divide-[var(--color-hairline-inner)]">
            {posts.map((post) => (
              <li key={post.id} className="relative py-2.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <SymbolLink symbol={post.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
                    <SignalBadge signal={post.signal} />
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{ageLabel(new Date(post.createdAt).getTime(), now)}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-text-secondary">
                  {post.userName}
                  {post.comment && <span className="text-text-muted">: {post.comment}</span>}
                </span>
              </li>
            ))}
          </ul>
        );
      }}
    </WidgetBody>
  );
}
