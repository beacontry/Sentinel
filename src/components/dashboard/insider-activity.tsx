"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";

interface InsiderTransaction {
  name: string;
  type: "buy" | "sell" | "gift" | "other";
  shares: number;
  price: number;
  date: string;
}

interface InsiderSummary {
  netDirection: "buying" | "selling";
  netAmount: number;
  totalBuyShares: number;
  totalSellShares: number;
  totalBuyValue: number;
  totalSellValue: number;
}

interface InsiderActivityProps {
  symbol: string;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function truncateName(name: string, max: number = 20): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "\u2026";
}

export function InsiderActivity({ symbol }: InsiderActivityProps) {
  const [transactions, setTransactions] = useState<InsiderTransaction[]>([]);
  const [summary, setSummary] = useState<InsiderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(false);

    fetch(`/api/insider/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((json) => {
        setTransactions(json.transactions ?? []);
        setSummary(json.summary ?? null);
      })
      .catch(() => {
        setError(true);
        setTransactions([]);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton width="70%" height="12px" rounded="sm" />
        <Skeleton width="100%" height="24px" rounded="md" />
        <Skeleton width="100%" height="24px" rounded="md" />
        <Skeleton width="100%" height="24px" rounded="md" />
      </div>
    );
  }

  if (error || transactions.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        No recent insider activity
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary */}
      {summary && (
        <div className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
          summary.netDirection === "buying"
            ? "bg-bullish/10 text-bullish"
            : "bg-bearish/10 text-bearish"
        }`}>
          Net insider {summary.netDirection}: {formatCurrency(summary.netAmount)}
        </div>
      )}

      {/* Transaction list (last 5 to keep compact) */}
      <div className="space-y-1">
        {transactions.slice(0, 5).map((t, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-2 py-1.5 rounded-md bg-bg-elevated text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant={t.type === "buy" ? "bullish" : t.type === "sell" ? "bearish" : "neutral"}
                className="text-[9px] px-1.5 py-0.5 shrink-0"
              >
                {t.type.toUpperCase()}
              </Badge>
              <span className="text-text-secondary truncate">
                {truncateName(t.name)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="font-mono text-text-primary">
                {t.shares.toLocaleString()}
              </span>
              {t.price > 0 && (
                <span className="text-text-muted font-mono">
                  @${t.price.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {transactions.length > 5 && (
        <p className="text-[10px] text-text-muted text-center">
          +{transactions.length - 5} more transactions
        </p>
      )}
    </div>
  );
}
