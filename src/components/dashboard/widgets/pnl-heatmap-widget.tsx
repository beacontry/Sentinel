"use client";

// Per-symbol realized P&L heatmap. Shows which symbols actually contribute
// to or detract from the user's bottom line. Source: /api/performance/
// attribution (aggregates SELL + manual_close fills from trader_trades).
//
// Widget vs the bigger AttributionCard on /dashboard/performance:
// the page card shows the top 10 with proportional bars + win-rate
// inline; the widget surfaces just the headline top 4-5 with $ + %.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { SymbolLink } from "@/components/ui/symbol-link";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";

interface AttributionRow {
  symbol: string;
  pnl: number;
  tradeCount: number;
  winCount: number;
  pctOfTotal: number;
}

interface AttributionData {
  totalPnl: number;
  rows: AttributionRow[];
}

export function PnlHeatmapWidget() {
  const { pnlFormat } = useDisplayPrefs();
  const [data, setData] = useState<AttributionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/performance/attribution")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const json = await res.json();
        setData(json);
      })
      .catch(() => {
        /* non-critical */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" rounded="lg" />
        ))}
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="py-5 text-center">
        <TrendingUp className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No closed trades yet</p>
        <Link
          href="/dashboard/performance"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View performance
        </Link>
      </div>
    );
  }

  const top = data.rows.slice(0, 5);
  const maxAbs = top.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Top contributors
        </span>
        <span
          className={`font-mono text-xs font-semibold ${
            data.totalPnl >= 0 ? "text-bullish" : "text-bearish"
          }`}
        >
          {formatPnl(data.totalPnl, undefined, pnlFormat)}
        </span>
      </div>
      <div className="space-y-1">
        {top.map((r) => {
          const widthPct = maxAbs === 0 ? 0 : (Math.abs(r.pnl) / maxAbs) * 100;
          const isPositive = r.pnl >= 0;
          return (
            <div
              key={r.symbol}
              className="grid grid-cols-[50px_1fr_auto] gap-2 items-center text-xs"
            >
              <SymbolLink symbol={r.symbol} className="font-medium text-[12px]" />
              <div className="relative h-5 rounded-md bg-bg-elevated overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${
                    isPositive ? "bg-bullish/30" : "bg-bearish/30"
                  } transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span
                className={`font-mono text-[11px] font-medium ${
                  isPositive ? "text-bullish" : "text-bearish"
                }`}
              >
                {formatPnl(r.pnl, undefined, pnlFormat)}
              </span>
            </div>
          );
        })}
      </div>
      <Link
        href="/dashboard/performance"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        Full attribution <ArrowRight className="w-3 h-3" />
      </Link>
      {data.totalPnl >= 0 && (
        <p className="text-[10px] text-text-muted text-center mt-1">
          <TrendingUp className="inline w-3 h-3 mr-0.5" />
          Lifetime realized
        </p>
      )}
      {data.totalPnl < 0 && (
        <p className="text-[10px] text-text-muted text-center mt-1">
          <TrendingDown className="inline w-3 h-3 mr-0.5" />
          Lifetime realized
        </p>
      )}
    </div>
  );
}
