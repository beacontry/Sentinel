"use client";

import type { ReactNode } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ageLabel, fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody } from "./widget-body";

export interface NewsArticle {
  id?: number;
  headline: string;
  source: string;
  url: string;
  /** Unix seconds. */
  datetime: number;
}

interface NewsData {
  configured: boolean;
  articles: NewsArticle[];
}

/** The latest five market headlines, each opening the source in a new tab. */
export function NewsWidget() {
  const load = useWidgetLoad<NewsData>(async (signal) => {
    const data = await fetchWidgetJson<{ configured?: boolean; articles?: NewsArticle[] }>("/api/news/market", signal);
    if (data.configured === false) return { configured: false, articles: [] };
    return { configured: true, articles: (data.articles ?? []).slice(0, 5) };
  });

  return (
    <WidgetBody
      load={load}
      label="the news"
      skeleton={<HeadlinesSkeleton rows={5} />}
      isEmpty={(d) => d.articles.length === 0}
      empty={
        load.data?.configured === false ? (
          <EmptyState compact icon={<Newspaper />} title="News is not set up" description="This server has no news source configured." />
        ) : (
          <EmptyState compact icon={<Newspaper />} title="No headlines right now" description="Check back after the next market update." />
        )
      }
    >
      {({ articles }) => <Headlines articles={articles} />}
    </WidgetBody>
  );
}

/** Headline rows shared by the news widgets: two lines, source and age under it. */
export function Headlines<A extends NewsArticle>({
  articles,
  meta,
}: {
  articles: A[];
  /** Extra leading metadata per row, e.g. a sentiment chip. */
  meta?: (a: A, i: number) => ReactNode;
}) {
  const now = Date.now();
  return (
    <ul className="divide-y divide-[var(--color-hairline-inner)]">
      {articles.map((a, i) => (
        <li key={a.id ?? `${a.url}-${i}`}>
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group -mx-2 block rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-bg-hover"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-sm leading-5 text-text-primary">{a.headline}</span>
              <ExternalLink aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-text-primary" />
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              {meta?.(a, i)}
              <span>{a.source}</span>
              <span aria-hidden="true">·</span>
              <span>{ageLabel(a.datetime * 1000, now)}</span>
              <span className="sr-only">(opens in a new tab)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function HeadlinesSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-y divide-[var(--color-hairline-inner)]">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="space-y-1.5 py-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
