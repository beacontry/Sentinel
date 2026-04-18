"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function QuickInsightWidget() {
  const [insight, setInsight] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Get first watchlist symbol for insight
        const wlRes = await fetch("/api/watchlist");
        if (!wlRes.ok) throw new Error("No watchlist");
        const wlData = await wlRes.json();
        const symbols = wlData.symbols ?? [];
        const sym = symbols[0] ?? "SPY";
        setSymbol(sym);

        const res = await fetch(`/api/insights/${encodeURIComponent(sym)}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        if (data.configured === false) {
          setInsight("Configure ANTHROPIC_API_KEY to enable AI insights.");
          return;
        }

        setInsight(data.insight ?? data.summary ?? null);
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
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-full" rounded="md" />
        <Skeleton className="h-4 w-5/6" rounded="md" />
        <Skeleton className="h-4 w-3/4" rounded="md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load insight
      </p>
    );
  }

  return (
    <div>
      {symbol && (
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-accent">{symbol}</p>
      )}
      <p className="text-[13px] leading-6 text-text-secondary line-clamp-4">
        {insight ?? "No insight available"}
      </p>

      <Link
        href={`/dashboard/insights${symbol ? `?symbol=${symbol}` : ""}`}
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        Full Insights <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
