"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";

interface EarningsEntry {
  symbol: string;
  date: string;
  hour?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays}d`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function EarningsWidget() {
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Get watchlist first for context
        const wlRes = await fetch("/api/watchlist");
        let symbols = "SPY,AAPL,MSFT,NVDA,GOOGL";
        if (wlRes.ok) {
          const wlData = await wlRes.json();
          const wlSymbols = wlData.symbols ?? [];
          if (wlSymbols.length > 0) {
            symbols = wlSymbols.slice(0, 20).join(",");
          }
        }

        const res = await fetch(`/api/earnings?symbols=${encodeURIComponent(symbols)}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        if (data.configured === false) {
          setError(true);
          return;
        }

        // Filter to future dates and sort
        const now = new Date().toISOString().slice(0, 10);
        const upcoming = (data.earnings ?? [])
          .filter((e: EarningsEntry) => e.date >= now)
          .sort((a: EarningsEntry, b: EarningsEntry) => a.date.localeCompare(b.date))
          .slice(0, 5);

        setEarnings(upcoming);
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
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" rounded="md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load earnings
      </p>
    );
  }

  if (earnings.length === 0) {
    return (
      <div className="py-5 text-center">
        <Calendar className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No upcoming earnings</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1">
        {earnings.map((e, i) => (
          <div
            key={`${e.symbol}-${i}`}
            className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5
              bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            <span className="font-mono text-[13px] font-medium text-text-primary">
              {e.symbol}
            </span>
            <div className="flex items-center gap-1.5">
              {e.hour && (
                <Badge variant="neutral">
                  {e.hour === "bmo" ? "Pre" : e.hour === "amc" ? "Post" : e.hour}
                </Badge>
              )}
              <span className="font-mono text-[12px] text-text-secondary">
                {formatDate(e.date)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/calendar"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        Full Calendar <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
