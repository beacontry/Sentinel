"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ArrowRight } from "lucide-react";
import Link from "next/link";

interface PnlData {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  tradesCount: number;
}

export function PnlWidget() {
  const [pnl, setPnl] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trader/dashboard");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setPnl(data.todayPnl ?? null);
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
        <Skeleton className="h-10 w-3/4" rounded="md" />
        <Skeleton className="h-5 w-1/2" rounded="md" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        Unable to load P&L
      </p>
    );
  }

  if (!pnl) {
    return (
      <div className="py-5 text-center">
        <DollarSign className="mx-auto mb-2 h-7 w-7 text-text-muted" />
        <p className="text-sm text-text-muted">No trading data today</p>
        <Link
          href="/dashboard/trader"
          className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
        >
          View trader
        </Link>
      </div>
    );
  }

  const isPositive = pnl.totalPnl >= 0;

  return (
    <div>
      <div className="py-1 text-center">
        <p
          className={`font-display text-[2rem] font-bold leading-none tracking-tight ${
            isPositive ? "text-bullish" : "text-bearish"
          }`}
        >
          {isPositive ? "+" : ""}${pnl.totalPnl.toFixed(2)}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-text-muted">
          Today&apos;s P&L
        </p>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Realized</p>
          <p
            className={`font-mono text-[13px] font-medium ${
              pnl.realizedPnl >= 0 ? "text-bullish" : "text-bearish"
            }`}
          >
            ${pnl.realizedPnl.toFixed(2)}
          </p>
        </div>
        <div className="rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Unrealized</p>
          <p
            className={`font-mono text-[13px] font-medium ${
              pnl.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
            }`}
          >
            ${pnl.unrealizedPnl.toFixed(2)}
          </p>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {pnl.tradesCount} trade{pnl.tradesCount !== 1 ? "s" : ""} today
      </p>

      <Link
        href="/dashboard/pnl-calendar"
        className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase
          tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
      >
        P&L Calendar <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
