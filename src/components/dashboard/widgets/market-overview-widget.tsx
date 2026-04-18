"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Link from "next/link";

interface MarketMover {
  symbol: string;
  change: number;
  price?: number;
}

export function MarketOverviewWidget() {
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/screener");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        const results = data.results ?? [];

        // Sort by change percentage (derived from price data if available)
        const withChange = results
          .filter((r: { symbol: string; price: number; change?: number }) => r.price > 0)
          .map((r: { symbol: string; price: number; change?: number }) => ({
            symbol: r.symbol,
            change: r.change ?? 0,
            price: r.price,
          }));

        const sorted = [...withChange].sort(
          (a: MarketMover, b: MarketMover) => b.change - a.change
        );
        setGainers(sorted.slice(0, 5));
        setLosers(sorted.slice(-5).reverse());
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" rounded="md" />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" rounded="md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load market data
      </p>
    );
  }

  if (gainers.length === 0 && losers.length === 0) {
    return (
      <div className="py-5 text-center">
        <TrendingUp className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No screener data yet</p>
        <Link
          href="/dashboard/screener"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          Run a scan
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {/* Gainers */}
        <div>
          <div className="mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-bullish" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-bullish">Gainers</span>
          </div>
          <div className="space-y-1">
            {gainers.map((g) => (
              <div
                key={g.symbol}
                className="flex items-center justify-between rounded-[8px] px-2 py-1
                  bg-bullish/5 hover:bg-bullish/10 transition-colors"
              >
                <span className="font-mono text-[12px] font-medium text-text-primary">
                  {g.symbol}
                </span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1.5 rounded-full bg-bullish"
                    style={{ width: `${Math.min(Math.abs(g.change) * 4, 40)}px` }}
                  />
                  <span className="text-xs font-mono text-bullish">
                    +{g.change.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Losers */}
        <div>
          <div className="mb-1.5 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-bearish" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-bearish">Losers</span>
          </div>
          <div className="space-y-1">
            {losers.map((l) => (
              <div
                key={l.symbol}
                className="flex items-center justify-between rounded-[8px] px-2 py-1
                  bg-bearish/5 hover:bg-bearish/10 transition-colors"
              >
                <span className="font-mono text-[12px] font-medium text-text-primary">
                  {l.symbol}
                </span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1.5 rounded-full bg-bearish"
                    style={{ width: `${Math.min(Math.abs(l.change) * 4, 40)}px` }}
                  />
                  <span className="text-xs font-mono text-bearish">
                    {l.change.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/dashboard/screener"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        View Screener <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
