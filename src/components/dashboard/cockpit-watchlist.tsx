"use client";

import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Clock, Eye, X } from "lucide-react";

interface CockpitWatchlistProps {
  symbols: string[];
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  analyses: Record<string, { signal: string; confidence: number; timestamp: string }>;
  loading: boolean;
}

const signalBadgeVariant: Record<string, "bullish" | "bearish" | "neutral"> = {
  STRONG_BUY: "bullish",
  BUY: "bullish",
  HOLD: "neutral",
  SELL: "bearish",
  STRONG_SELL: "bearish",
};

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function CockpitWatchlist({
  symbols,
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
  analyses,
  loading,
}: CockpitWatchlistProps) {
  const recentActivity = symbols
    .filter((s) => analyses[s])
    .map((s) => ({
      symbol: s,
      signal: analyses[s].signal,
      confidence: analyses[s].confidence,
      time: analyses[s].timestamp,
    }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 6);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Watchlist
          </span>
        </div>
        <Badge variant="default" className="font-mono">
          {symbols.length}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && symbols.length === 0 ? (
          <div className="p-2 space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="28px" rounded="sm" />
            ))}
          </div>
        ) : symbols.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <p className="text-[10px] text-text-muted">No symbols</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {symbols.map((sym) => {
              const a = analyses[sym];
              const isSelected = selectedSymbol === sym;
              return (
                <div
                  key={sym}
                  className={`group flex min-h-[46px] items-center justify-between rounded-[18px] border px-3 py-2 transition-colors
                    ${isSelected ? "border-accent/30 bg-accent/10" : "border-transparent hover:border-border hover:bg-bg-elevated"} cursor-pointer`}
                  onClick={() => onSelectSymbol(sym)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono text-xs font-medium ${
                        isSelected ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      {sym}
                    </span>
                    {a && (
                      <Badge
                        variant={signalBadgeVariant[a.signal] ?? "neutral"}
                        className="text-[9px] px-1 py-0"
                      >
                        {Math.round(a.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSymbol(sym);
                    }}
                    className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-[12px] p-1 text-text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-bearish/10 hover:text-bearish"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recentActivity.length > 0 && (
        <div className="shrink-0 border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2">
            <Clock className="w-3 h-3 text-text-muted" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Recent
            </span>
          </div>
          <div className="space-y-1 px-2 pb-2">
            {recentActivity.map((item) => (
              <button
                key={item.symbol + item.time}
                onClick={() => onSelectSymbol(item.symbol)}
                className="flex min-h-[34px] w-full items-center justify-between rounded-[14px] px-2.5 py-1 text-[10px] transition-colors hover:bg-bg-elevated"
              >
                <span className="font-mono text-text-secondary">
                  {item.symbol}
                </span>
                <span className="text-text-muted">{timeAgo(item.time)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
