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

// How many transactions to show before the "+N more" expand affordance.
// Was 5 — dropped to 3 to keep the Signal-Details right panel compact
// when Market Context is expanded. Most insider activity rows convey
// the trend at a glance via the summary chip above; the per-name detail
// is the deep-dive view, gated behind one click.
const COLLAPSED_LIMIT = 3;

export function InsiderActivity({ symbol }: InsiderActivityProps) {
  const [transactions, setTransactions] = useState<InsiderTransaction[]>([]);
  const [summary, setSummary] = useState<InsiderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

      {/* Transaction list — collapsed to 3 by default, expand via the
       * "+N more" link below the list. Caps at 25 even when expanded so
       * a noisy insider page doesn't blow out the panel height. */}
      <div className="space-y-1">
        {transactions.slice(0, expanded ? 25 : COLLAPSED_LIMIT).map((t, i) => (
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

      {transactions.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="block w-full text-[10px] text-accent text-center hover:underline focus-visible:underline focus:outline-none"
        >
          {expanded
            ? "Show less"
            : `+${transactions.length - COLLAPSED_LIMIT} more transaction${transactions.length - COLLAPSED_LIMIT === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
