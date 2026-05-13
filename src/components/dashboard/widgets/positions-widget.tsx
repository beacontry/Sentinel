"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { Briefcase, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";

/**
 * Position shape returned by /api/trader/dashboard. The API has been
 * normalized on `entryPrice` / `currentPrice` (not `averageCost` /
 * `marketPrice` — that mismatch crashed the widget mid-rearrange).
 *
 * `qty` is the canonical field; `quantity` is included as an alias
 * for backwards-compat on a few other callers. Use either.
 *
 * Every numeric field is marked optional + defaulted because the API
 * can omit fields when broker data is partially stale (cached path
 * vs live broker path return slightly different shapes). Defensive
 * rendering > crash.
 */
interface Position {
  symbol: string;
  qty?: number;
  quantity?: number;
  entryPrice?: number;
  currentPrice?: number;
  unrealizedPnl?: number;
}

export function PositionsWidget() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { pnlFormat } = useDisplayPrefs();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trader/dashboard");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setPositions(data.positions ?? []);
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
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" rounded="lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load positions
      </p>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-6">
        <Briefcase className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">No open positions</p>
        <Link
          href="/dashboard/trader"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View trader
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1.5">
        {positions.slice(0, 6).map((pos) => {
          // Defensive defaults: the API has two code paths (live vs cached)
          // and historically returned slightly different field names. Default
          // everything to 0 so a missing field renders as $0.00 instead of
          // crashing on .toFixed(undefined).
          const qty = pos.qty ?? pos.quantity ?? 0;
          const entryPrice = pos.entryPrice ?? 0;
          const currentPrice = pos.currentPrice ?? 0;
          const unrealizedPnl = pos.unrealizedPnl ?? 0;
          const isPositive = unrealizedPnl >= 0;
          return (
            <div
              key={pos.symbol}
              className="flex items-center justify-between px-3 py-2 rounded-lg
                bg-bg-elevated hover:bg-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <SymbolLink symbol={pos.symbol} className="text-sm font-medium">
                  {pos.symbol}
                </SymbolLink>
                <Badge variant="neutral">
                  {qty} shr
                </Badge>
              </div>
              <span
                className={`text-sm font-mono font-medium ${
                  isPositive ? "text-bullish" : "text-bearish"
                }`}
                title={`Entry $${entryPrice.toFixed(2)} → Now $${currentPrice.toFixed(2)}`}
              >
                {formatPnl(
                  unrealizedPnl,
                  entryPrice * qty,
                  pnlFormat
                )}
              </span>
            </div>
          );
        })}
        {positions.length > 6 && (
          <p className="text-xs text-text-muted text-center pt-1">
            +{positions.length - 6} more positions
          </p>
        )}
      </div>

      <Link
        href="/dashboard/trader"
        className="flex items-center justify-center gap-1 text-xs text-accent
          hover:text-accent-hover pt-3 transition-colors min-h-[44px]"
      >
        View Trader <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
