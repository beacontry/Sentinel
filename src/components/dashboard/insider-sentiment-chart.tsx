"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import { Users, TrendingUp, TrendingDown } from "lucide-react";

interface SentimentEntry {
  year: number;
  month: number;
  change: number;
  mspr: number;
}

interface InsiderTransaction {
  name: string;
  type: "buy" | "sell" | "gift" | "other";
  shares: number;
  price: number;
  date: string;
  rawType: string;
}

interface InsiderSummary {
  netDirection: "buying" | "selling";
  netAmount: number;
  totalBuyShares: number;
  totalSellShares: number;
  totalBuyValue: number;
  totalSellValue: number;
}

interface InsiderSentimentChartProps {
  symbol: string;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function InsiderSentimentChart({ symbol }: InsiderSentimentChartProps) {
  const [sentiment, setSentiment] = useState<SentimentEntry[]>([]);
  const [transactions, setTransactions] = useState<InsiderTransaction[]>([]);
  const [summary, setSummary] = useState<InsiderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    async function fetchInsider() {
      setLoading(true);
      try {
        const res = await fetch(`/api/insider/${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setConfigured(data.configured !== false);
          setSentiment(data.sentiment ?? []);
          setTransactions(data.transactions ?? []);
          setSummary(data.summary ?? null);
        }
      } catch {
        // Non-critical data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInsider();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton width="16px" height="16px" rounded="sm" />
          <Skeleton width="120px" height="14px" rounded="sm" />
        </div>
        <Skeleton width="100%" height="80px" rounded="lg" />
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="28px" rounded="sm" />
          ))}
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-xs py-3">
        <Users className="w-3.5 h-3.5" />
        <span>Set FINNHUB_API_KEY to enable insider data</span>
      </div>
    );
  }

  // Compute 6-month MSPR summary
  const recentSentiment = sentiment.slice(-6);
  const avgMspr =
    recentSentiment.length > 0
      ? recentSentiment.reduce((sum, e) => sum + e.mspr, 0) / recentSentiment.length
      : 0;
  const isNetBuying = avgMspr > 0;

  // Compute max MSPR for scaling bars
  const maxAbsMspr = Math.max(
    ...sentiment.map((e) => Math.abs(e.mspr)),
    0.01
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Insider Sentiment
          </span>
        </div>
        {sentiment.length > 0 && (
          <Badge
            variant={isNetBuying ? "bullish" : "bearish"}
            className="text-[10px]"
          >
            {isNetBuying ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            Net {isNetBuying ? "Buying" : "Selling"}
          </Badge>
        )}
      </div>

      {/* MSPR bar chart */}
      {sentiment.length > 0 ? (
        <div className="px-3 py-3 rounded-lg bg-bg-elevated">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
            Monthly Share Purchase Ratio (MSPR)
          </p>
          <div className="flex items-end gap-1" style={{ height: "64px" }}>
            {sentiment.slice(-12).map((entry, idx) => {
              const height = Math.max(
                4,
                (Math.abs(entry.mspr) / maxAbsMspr) * 56
              );
              const isPositive = entry.mspr >= 0;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  <div
                    className={`w-full rounded-sm transition-all duration-300 ${
                      isPositive ? "bg-bullish/60" : "bg-bearish/60"
                    }`}
                    style={{ height: `${height}px` }}
                    title={`${MONTH_NAMES[entry.month - 1]} ${entry.year}: MSPR ${entry.mspr.toFixed(3)}`}
                  />
                </div>
              );
            })}
          </div>
          {/* Month labels */}
          <div className="flex gap-1 mt-1">
            {sentiment.slice(-12).map((entry, idx) => (
              <div
                key={idx}
                className="flex-1 text-center text-[9px] text-text-muted font-mono"
              >
                {MONTH_NAMES[entry.month - 1]}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-muted text-center py-3 bg-bg-elevated rounded-lg">
          No MSPR data available
        </div>
      )}

      {/* 6-month summary */}
      {recentSentiment.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-bg-elevated">
          <p className="text-xs text-text-secondary leading-relaxed">
            Insiders are net{" "}
            <span
              className={`font-medium ${
                isNetBuying ? "text-bullish" : "text-bearish"
              }`}
            >
              {isNetBuying ? "buying" : "selling"}
            </span>{" "}
            over the last {recentSentiment.length} months (avg MSPR:{" "}
            <span className="font-mono">{avgMspr.toFixed(3)}</span>)
          </p>
        </div>
      )}

      {/* Recent transactions */}
      {transactions.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
            Recent Transactions
          </p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {transactions.slice(0, 8).map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-1.5 rounded bg-bg-elevated text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      t.type === "buy"
                        ? "bg-bullish"
                        : t.type === "sell"
                          ? "bg-bearish"
                          : "bg-text-muted"
                    }`}
                  />
                  <span className="text-text-secondary truncate">
                    {t.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-[10px] ${
                      t.type === "buy"
                        ? "text-bullish"
                        : t.type === "sell"
                          ? "text-bearish"
                          : "text-text-muted"
                    }`}
                  >
                    {t.type === "buy" ? "+" : t.type === "sell" ? "-" : ""}
                    {t.shares.toLocaleString()}
                  </span>
                  <span className="text-text-muted text-[10px]">
                    {t.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net summary */}
      {summary && (
        <div className="flex gap-3 text-xs">
          <div className="flex-1 px-3 py-2 rounded-lg bg-bg-elevated text-center">
            <p className="text-[10px] text-text-muted mb-0.5">Net Buys</p>
            <p className="font-mono text-bullish">
              {summary.totalBuyShares.toLocaleString()} shares
            </p>
          </div>
          <div className="flex-1 px-3 py-2 rounded-lg bg-bg-elevated text-center">
            <p className="text-[10px] text-text-muted mb-0.5">Net Sells</p>
            <p className="font-mono text-bearish">
              {summary.totalSellShares.toLocaleString()} shares
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
