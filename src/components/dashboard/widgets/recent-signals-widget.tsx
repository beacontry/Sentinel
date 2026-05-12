"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { Zap, ArrowRight } from "lucide-react";
import Link from "next/link";

interface RecentSignal {
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  confidence: number;
  price: number;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RecentSignalsWidget() {
  const [signals, setSignals] = useState<RecentSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/screener");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        const results = data.results ?? [];

        // Take the 5 most recent with actionable signals
        const actionable = results
          .filter(
            (r: RecentSignal) =>
              r.signal && r.signal !== "HOLD"
          )
          .slice(0, 5)
          .map((r: RecentSignal & { scannedAt?: string }) => ({
            symbol: r.symbol,
            signal: r.signal,
            confidence: r.confidence,
            price: r.price,
            createdAt: r.scannedAt ?? r.createdAt ?? new Date().toISOString(),
          }));

        setSignals(actionable);
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
          <Skeleton key={i} className="h-9 w-full" rounded="md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load signals
      </p>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="py-5 text-center">
        <Zap className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No recent signals</p>
        <Link
          href="/dashboard/screener"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          Run screener
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1">
        {signals.map((sig, i) => (
          <div
            key={`${sig.symbol}-${i}`}
            className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5
              bg-bg-elevated hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <SymbolLink symbol={sig.symbol} className="text-[13px] font-medium">
                {sig.symbol}
              </SymbolLink>
              <SignalBadge signal={sig.signal} />
            </div>
            <div className="flex flex-col items-end gap-0.5 text-right leading-none">
              <span className="font-mono text-[12px] text-text-secondary">
                ${sig.price.toFixed(2)}
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
                {timeAgo(sig.createdAt)}
              </span>
            </div>
          </div>
        ))}
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
