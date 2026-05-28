"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";

interface TodayPnl {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  tradesCount: number;
  // Optional — server may include for proper percent calculation
  startEquity?: number;
}
interface LifetimePnl {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  // Current account equity — basis for expressing lifetime P&L as a % of
  // account size. Optional; server omits it when the broker is unreachable.
  equity?: number;
}

export function PnlWidget() {
  const [todayPnl, setTodayPnl] = useState<TodayPnl | null>(null);
  const [lifetimePnl, setLifetimePnl] = useState<LifetimePnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { pnlFormat } = useDisplayPrefs();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trader/dashboard");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setTodayPnl(data.todayPnl ?? null);
        setLifetimePnl(data.lifetimePnl ?? null);
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

  if (!todayPnl) {
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

  // Big number: today's P&L (intraday change + today's realized)
  // Card values: LIFETIME realized (banked) and LIFETIME unrealized (open positions)
  // The breakdown cards used to be today's realized + today's intraday, which was
  // confusing — they always summed to the big number. Lifetime totals give the
  // important context of "what's banked + what's still riding."
  const isPositive = todayPnl.totalPnl >= 0;
  const realized = lifetimePnl?.realizedPnl ?? todayPnl.realizedPnl;
  const unrealized = lifetimePnl?.unrealizedPnl ?? todayPnl.unrealizedPnl;
  // Percent basis only when the server supplies a real denominator. Never
  // fabricate one from |pnl| — that yields a meaningless ±100%. When the
  // basis is undefined, formatPnl() falls back to dollar-only.
  const todayBasis = todayPnl.startEquity; // start-of-day equity
  const lifetimeBasis = lifetimePnl?.equity; // current account equity

  return (
    <div>
      <div className="py-1 text-center">
        <p
          className={`font-display text-[2rem] font-bold leading-none tracking-tight ${
            isPositive ? "text-bullish" : "text-bearish"
          }`}
        >
          {formatPnl(todayPnl.totalPnl, todayBasis, pnlFormat)}
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
              realized >= 0 ? "text-bullish" : "text-bearish"
            }`}
          >
            {formatPnl(realized, lifetimeBasis, pnlFormat)}
          </p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-text-muted/70 mt-0.5">lifetime</p>
        </div>
        <div className="rounded-[10px] bg-bg-elevated px-2 py-1.5 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Unrealized</p>
          <p
            className={`font-mono text-[13px] font-medium ${
              unrealized >= 0 ? "text-bullish" : "text-bearish"
            }`}
          >
            {formatPnl(unrealized, lifetimeBasis, pnlFormat)}
          </p>
          <p className="text-[9px] uppercase tracking-[0.12em] text-text-muted/70 mt-0.5">open positions</p>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {todayPnl.tradesCount} trade{todayPnl.tradesCount !== 1 ? "s" : ""} today
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
