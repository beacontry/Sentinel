"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ArrowRight, BookOpen } from "lucide-react";

interface NetWorthSummary {
  total: number;
  manual: { total: number; portfolios: { id: string; name: string; value: number }[] };
  broker: {
    total: number;
    positions: { symbol: string; qty: number; marketValue: number; unrealizedPnl: number }[];
    cacheAge: number | null;
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Aggregated net-worth view across paper portfolios + live broker positions.
 * Calls /api/portfolio/summary which combines portfolioPositions table data
 * with the in-memory broker position cache.
 *
 * If both sources are empty, prompts the user to set one up.
 */
export function NetWorthWidget() {
  const [data, setData] = useState<NetWorthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portfolio/summary", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed");
        setData(await res.json());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" rounded="lg" />
        <Skeleton className="h-4 w-1/2" rounded="lg" />
        <Skeleton className="h-4 w-1/3" rounded="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load net worth
      </p>
    );
  }

  const { total, manual, broker } = data;
  const hasAny = manual.total > 0 || broker.total > 0;
  const totalUnrealized = broker.positions.reduce(
    (acc, p) => acc + p.unrealizedPnl,
    0,
  );

  if (!hasAny) {
    return (
      <div className="py-4 space-y-3">
        <p className="text-sm text-text-muted">
          No portfolio data yet. Connect a broker or set up a paper portfolio.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/trader"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Connect broker <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/dashboard/portfolio"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Paper portfolio <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-mono font-semibold text-text-primary tabular-nums">
          {fmt(total)}
        </p>
        <p className="text-xs text-text-muted">Total</p>
      </div>

      {totalUnrealized !== 0 && (
        <p
          className={`text-xs flex items-center gap-1 font-mono ${
            totalUnrealized >= 0 ? "text-bullish" : "text-bearish"
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          {totalUnrealized >= 0 ? "+" : ""}
          {fmt(totalUnrealized)} unrealized
        </p>
      )}

      <div className="space-y-1.5 pt-2 border-t border-border/50">
        {broker.total > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Broker positions</span>
            <span className="font-mono text-text-secondary">
              {fmt(broker.total)}
            </span>
          </div>
        )}
        {manual.total > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Paper portfolios</span>
            <span className="font-mono text-text-secondary">
              {fmt(manual.total)}
            </span>
          </div>
        )}
        {broker.cacheAge !== null && broker.cacheAge > 300 && (
          <p className="text-[10px] text-text-muted">
            Broker cache: {Math.floor(broker.cacheAge / 60)}m old
          </p>
        )}
      </div>

      <Link
        href="/dashboard/education#calculators"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
      >
        <BookOpen className="h-3 w-3" />
        FIRE Number Calculator
      </Link>
    </div>
  );
}
