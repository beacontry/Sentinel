"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PerformanceData {
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  avgReturn: number;
}

export function PerformanceWidget() {
  const [stats, setStats] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/performance");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setStats(data.overall ?? null);
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
      <div className="space-y-2.5">
        <Skeleton className="h-10 w-full" rounded="md" />
        <Skeleton className="h-7 w-full" rounded="md" />
        <Skeleton className="h-7 w-full" rounded="md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load performance
      </p>
    );
  }

  if (!stats || stats.totalSignals === 0) {
    return (
      <div className="py-5 text-center">
        <Target className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No performance data yet</p>
        <Link
          href="/dashboard/performance"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View performance
        </Link>
      </div>
    );
  }

  const winRate = (stats.accuracy * 100).toFixed(1);
  const isGoodWinRate = stats.accuracy >= 0.5;

  return (
    <div>
      <div className="py-1 text-center">
        <p
          className={`font-display text-[2rem] font-bold leading-none tracking-tight ${
            isGoodWinRate ? "text-bullish" : "text-warning"
          }`}
        >
          {winRate}%
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-text-muted">Win Rate</p>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Total</p>
          <p className="font-mono text-[13px] font-medium text-text-primary">
            {stats.totalSignals}
          </p>
        </div>
        <div className="rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Correct</p>
          <p className="font-mono text-[13px] font-medium text-bullish">
            {stats.correctSignals}
          </p>
        </div>
      </div>

      {stats.avgReturn !== 0 && (
        <div className="mt-1.5 rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Avg Return</p>
          <p
            className={`font-mono text-[13px] font-medium ${
              stats.avgReturn >= 0 ? "text-bullish" : "text-bearish"
            }`}
          >
            {stats.avgReturn >= 0 ? "+" : ""}
            {(stats.avgReturn * 100).toFixed(2)}%
          </p>
        </div>
      )}

      <Link
        href="/dashboard/performance"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        Full Analytics <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
