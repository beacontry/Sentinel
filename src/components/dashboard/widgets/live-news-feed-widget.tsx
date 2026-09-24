"use client";

import { Newspaper, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { POLLING_INTERVALS } from "@/lib/config";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody } from "./widget-body";
import { Headlines, HeadlinesSkeleton, type NewsArticle } from "./news-widget";

/**
 * The polling cousin of NewsWidget: up to 15 headlines from /api/news/feed,
 * re-read every POLLING_INTERVALS.newsRefresh (paused in a hidden tab),
 * with watchlist symbols first (the API orders them).
 *
 * A failed poll keeps the headlines on screen marked stale with their age;
 * it used to replace them with a failure message.
 */
interface FeedArticle extends NewsArticle {
  symbol?: string;
  sentiment: "bullish" | "bearish" | "neutral";
}

export function LiveNewsFeedWidget() {
  const load = useWidgetLoad<FeedArticle[]>(
    async (signal) => {
      const data = await fetchWidgetJson<{ articles?: FeedArticle[] }>("/api/news/feed?limit=15", signal);
      return data.articles ?? [];
    },
    { pollMs: POLLING_INTERVALS.newsRefresh },
  );

  return (
    <WidgetBody
      load={load}
      label="the news feed"
      skeleton={<HeadlinesSkeleton rows={6} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState compact icon={<Newspaper />} title="No headlines right now" description="The feed checks again every few minutes." />}
    >
      {(articles) => (
        <div className="max-h-[30rem] overflow-y-auto pr-1">
          <Headlines
            articles={articles}
            meta={(f) => {
              return (
                <>
                  {f.sentiment === "bullish" && (
                    <StatusChip tone="bullish" icon={<TrendingUp className="h-3 w-3" />}>
                      Bullish
                    </StatusChip>
                  )}
                  {f.sentiment === "bearish" && (
                    <StatusChip tone="bearish" icon={<TrendingDown className="h-3 w-3" />}>
                      Bearish
                    </StatusChip>
                  )}
                  {f.symbol && <span className="font-mono font-semibold text-text-secondary">{f.symbol}</span>}
                </>
              );
            }}
          />
        </div>
      )}
    </WidgetBody>
  );
}
