"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody } from "./widget-body";

interface InsightData {
  symbol: string;
  /** False when the server has no AI provider configured. */
  configured: boolean;
  insight: string | null;
}

/**
 * A short AI read on the first symbol of the default watchlist (SPY when
 * the list is empty). "Not set up" is its own state rather than an
 * insight: it used to print an instruction to configure an API key the
 * app no longer uses, in the insight's place.
 */
export function QuickInsightWidget() {
  const load = useWidgetLoad<InsightData>(async (signal) => {
    const wl = await fetchWidgetJson<{ symbols?: string[] }>("/api/watchlist", signal);
    const symbol = wl.symbols?.[0] ?? "SPY";
    const data = await fetchWidgetJson<{ configured?: boolean; insight?: string; summary?: string }>(
      `/api/insights/${encodeURIComponent(symbol)}`,
      signal,
    );
    return { symbol, configured: data.configured !== false, insight: data.insight ?? data.summary ?? null };
  });

  return (
    <WidgetBody
      load={load}
      label="the insight"
      skeleton={
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      }
      isEmpty={(d) => !d.configured || !d.insight}
      empty={
        <EmptyState
          compact
          icon={<Sparkles />}
          title={load.data?.configured === false ? "AI insights are not set up" : "No insight yet"}
          description={
            load.data?.configured === false
              ? "This server has no AI provider configured."
              : `Nothing has been written for ${load.data?.symbol ?? "this symbol"} yet.`
          }
        />
      }
    >
      {({ symbol, insight }) => (
        <div>
          <p className="font-mono text-sm font-semibold text-text-primary">{symbol}</p>
          <p className="mt-1 line-clamp-5 text-sm leading-6 text-text-secondary">{insight}</p>
          <Link
            href={`/dashboard/insights?symbol=${encodeURIComponent(symbol)}`}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:text-accent-hover"
          >
            Read the full insight on {symbol}
          </Link>
        </div>
      )}
    </WidgetBody>
  );
}
