"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "../ui/skeleton";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";

interface Metrics {
  peRatio: number | null;
  eps: number | null;
  beta: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  revenuePerShare: number | null;
  currentRatio: number | null;
  grossMargin: number | null;
  netProfitMargin: number | null;
  roeTTM: number | null;
  debtToEquity: number | null;
  bookValuePerShare: number | null;
  priceSalesRatio: number | null;
  priceBookRatio: number | null;
}

interface FundamentalsPanelProps {
  symbol: string;
  currentPrice?: number;
}

function formatValue(val: number | null, suffix = "", decimals = 2): string {
  if (val === null || val === undefined) return "--";
  return `${val.toFixed(decimals)}${suffix}`;
}

function getMarginColor(val: number | null): string {
  if (val === null) return "text-text-muted";
  if (val >= 20) return "text-bullish";
  if (val >= 10) return "text-warning";
  return "text-bearish";
}

function getPeColor(val: number | null): string {
  if (val === null) return "text-text-muted";
  if (val < 0) return "text-bearish";
  if (val < 15) return "text-bullish";
  if (val < 30) return "text-text-primary";
  return "text-warning";
}

export function FundamentalsPanel({ symbol, currentPrice }: FundamentalsPanelProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchFundamentals() {
      setLoading(true);
      try {
        const res = await fetch(`/api/fundamentals/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setConfigured(data.configured !== false);
          setMetrics(data.metrics ?? null);
        }
      } catch {
        // Non-critical data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFundamentals();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton width="16px" height="16px" rounded="sm" />
          <Skeleton width="100px" height="14px" rounded="sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="52px" rounded="lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-xs py-3">
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Set FINNHUB_API_KEY to enable fundamentals</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-xs text-text-muted text-center py-3">
        No fundamental data available
      </div>
    );
  }

  // 52-week position indicator
  let weekPosition: number | null = null;
  if (metrics.weekHigh52 !== null && metrics.weekLow52 !== null && currentPrice) {
    const range = metrics.weekHigh52 - metrics.weekLow52;
    if (range > 0) {
      weekPosition = ((currentPrice - metrics.weekLow52) / range) * 100;
      weekPosition = Math.max(0, Math.min(100, weekPosition));
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Fundamentals
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {/* P/E Ratio */}
        <MetricCard
          label="P/E Ratio"
          value={formatValue(metrics.peRatio)}
          valueClass={getPeColor(metrics.peRatio)}
        />

        {/* EPS */}
        <MetricCard
          label="EPS (TTM)"
          value={metrics.eps !== null ? `$${metrics.eps.toFixed(2)}` : "--"}
          valueClass={metrics.eps !== null && metrics.eps > 0 ? "text-bullish" : metrics.eps !== null ? "text-bearish" : "text-text-muted"}
        />

        {/* Beta */}
        <MetricCard
          label="Beta"
          value={formatValue(metrics.beta)}
          valueClass={metrics.beta !== null && metrics.beta > 1.5 ? "text-warning" : "text-text-primary"}
        />

        {/* Dividend Yield */}
        <MetricCard
          label="Div Yield"
          value={formatValue(metrics.dividendYield, "%")}
          valueClass={metrics.dividendYield !== null && metrics.dividendYield > 0 ? "text-bullish" : "text-text-muted"}
        />

        {/* Gross Margin */}
        <MetricCard
          label="Gross Margin"
          value={formatValue(metrics.grossMargin, "%")}
          valueClass={getMarginColor(metrics.grossMargin)}
        />

        {/* Net Profit Margin */}
        <MetricCard
          label="Net Margin"
          value={formatValue(metrics.netProfitMargin, "%")}
          valueClass={getMarginColor(metrics.netProfitMargin)}
        />

        {/* Revenue/Share */}
        <MetricCard
          label="Rev/Share"
          value={metrics.revenuePerShare !== null ? `$${metrics.revenuePerShare.toFixed(2)}` : "--"}
          valueClass="text-text-primary"
        />

        {/* ROE */}
        <MetricCard
          label="ROE (TTM)"
          value={formatValue(metrics.roeTTM, "%")}
          valueClass={metrics.roeTTM !== null && metrics.roeTTM > 15 ? "text-bullish" : metrics.roeTTM !== null && metrics.roeTTM > 0 ? "text-text-primary" : "text-bearish"}
        />

        {/* P/S Ratio */}
        <MetricCard
          label="P/S Ratio"
          value={formatValue(metrics.priceSalesRatio)}
          valueClass="text-text-primary"
        />
      </div>

      {/* 52-Week Range */}
      {metrics.weekHigh52 !== null && metrics.weekLow52 !== null && (
        <div className="px-3 py-2.5 rounded-lg bg-bg-elevated">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-text-muted">52W Range</span>
            <span className="font-mono text-text-secondary">
              ${metrics.weekLow52.toFixed(2)} -- ${metrics.weekHigh52.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 bg-bg-surface rounded-full overflow-hidden">
            {/* Gradient bar */}
            <div className="absolute inset-0 bg-gradient-to-r from-bearish via-warning to-bullish opacity-40 rounded-full" />
            {/* Current position */}
            {weekPosition !== null && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full border-2 border-bg-elevated shadow-sm"
                style={{ left: `calc(${weekPosition}% - 6px)` }}
                title={currentPrice ? `Current: $${currentPrice.toFixed(2)}` : undefined}
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span className="text-bearish flex items-center gap-0.5">
              <TrendingDown className="w-3 h-3" />
              Low
            </span>
            <span className="text-bullish flex items-center gap-0.5">
              High
              <TrendingUp className="w-3 h-3" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="px-3 py-2 rounded-lg bg-bg-elevated">
      <p className="text-[10px] text-text-muted uppercase tracking-wider leading-none mb-1">
        {label}
      </p>
      <p className={`font-mono text-sm font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}
