"use client";

import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { TestTube, TrendingUp, TrendingDown } from "lucide-react";

interface BacktestResult {
  symbol: string;
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  trades: Array<{
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    returnPct: number;
    signal: string;
    exitReason: string;
  }>;
}

interface IntelligenceBacktestTabProps {
  symbol: string;
}

export function IntelligenceBacktestTab({ symbol }: IntelligenceBacktestTabProps) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchBacktest() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(
          `/api/backtest/${encodeURIComponent(symbol)}?days=90&holdPeriod=20`
        );
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setResult(data);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBacktest();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton width="16px" height="16px" rounded="sm" />
          <Skeleton width="120px" height="14px" rounded="sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="52px" rounded="lg" />
          ))}
        </div>
        <Skeleton width="100%" height="100px" rounded="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        Failed to run backtest for {symbol}
      </div>
    );
  }

  if (!result || result.totalTrades === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-6">
        <TestTube className="w-8 h-8 mx-auto mb-2 text-text-muted" />
        No signal trades found in the last 90 days for {symbol}
      </div>
    );
  }

  const isPositiveReturn = result.totalReturn > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TestTube className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Quick Backtest (90d)
          </span>
        </div>
        <Badge
          variant={isPositiveReturn ? "bullish" : "bearish"}
          className="text-[10px] font-mono"
        >
          {isPositiveReturn ? "+" : ""}{result.totalReturn.toFixed(2)}%
        </Badge>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatCard
          label="Total Trades"
          value={`${result.totalTrades}`}
          valueClass="text-text-primary"
        />
        <StatCard
          label="Win Rate"
          value={`${(result.winRate * 100).toFixed(1)}%`}
          valueClass={result.winRate >= 0.5 ? "text-bullish" : "text-bearish"}
        />
        <StatCard
          label="Avg Return"
          value={`${result.avgReturn >= 0 ? "+" : ""}${result.avgReturn.toFixed(2)}%`}
          valueClass={result.avgReturn >= 0 ? "text-bullish" : "text-bearish"}
        />
        <StatCard
          label="Total Return"
          value={`${isPositiveReturn ? "+" : ""}${result.totalReturn.toFixed(2)}%`}
          valueClass={isPositiveReturn ? "text-bullish" : "text-bearish"}
        />
        <StatCard
          label="Max Drawdown"
          value={`${result.maxDrawdown.toFixed(2)}%`}
          valueClass="text-bearish"
        />
        {result.sharpeRatio !== null && (
          <StatCard
            label="Sharpe Ratio"
            value={result.sharpeRatio.toFixed(2)}
            valueClass={result.sharpeRatio > 1 ? "text-bullish" : result.sharpeRatio > 0 ? "text-text-primary" : "text-bearish"}
          />
        )}
      </div>

      {/* Recent trades */}
      {result.trades.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
            Recent Trades
          </p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {result.trades.slice(0, 8).map((trade, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-1.5 rounded bg-bg-elevated text-xs"
              >
                <div className="flex items-center gap-2">
                  {trade.returnPct >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-bullish" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-bearish" />
                  )}
                  <span className="text-text-secondary font-mono text-[10px]">
                    {trade.entryDate.slice(5)}
                  </span>
                  <Badge variant="neutral" className="text-[9px] px-1 py-0">
                    {trade.signal}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-[10px] ${
                      trade.returnPct >= 0 ? "text-bullish" : "text-bearish"
                    }`}
                  >
                    {trade.returnPct >= 0 ? "+" : ""}{trade.returnPct.toFixed(2)}%
                  </span>
                  <span className="text-[9px] text-text-muted">
                    {trade.exitReason}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
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
