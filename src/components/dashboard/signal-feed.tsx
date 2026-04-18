"use client";

import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Radio } from "lucide-react";

export interface SignalFeedItem {
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  confidence: number;
  price: number;
  change?: number;
}

interface SignalFeedProps {
  signals: SignalFeedItem[];
  selectedSymbol: string | null;
  onSelectSignal: (symbol: string) => void;
  loading?: boolean;
}

const signalColor: Record<SignalFeedItem["signal"], string> = {
  STRONG_BUY: "bg-bullish",
  BUY: "bg-bullish",
  HOLD: "bg-warning",
  SELL: "bg-bearish",
  STRONG_SELL: "bg-bearish",
};

const signalLabel: Record<SignalFeedItem["signal"], string> = {
  STRONG_BUY: "Strong Buy",
  BUY: "Buy",
  HOLD: "Hold",
  SELL: "Sell",
  STRONG_SELL: "Strong Sell",
};

const signalBadgeVariant: Record<
  SignalFeedItem["signal"],
  "bullish" | "bearish" | "neutral"
> = {
  STRONG_BUY: "bullish",
  BUY: "bullish",
  HOLD: "neutral",
  SELL: "bearish",
  STRONG_SELL: "bearish",
};

export function SignalFeed({
  signals,
  selectedSymbol,
  onSelectSignal,
  loading,
}: SignalFeedProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Signals
          </span>
        </div>
        <Badge variant="default" className="font-mono">
          {signals.length}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && signals.length === 0 ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton width="8px" height="8px" rounded="full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton width="48px" height="14px" rounded="sm" />
                  <Skeleton width="64px" height="10px" rounded="sm" />
                </div>
                <Skeleton width="32px" height="14px" rounded="sm" />
              </div>
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-text-muted">No signals yet</p>
            <p className="text-[10px] text-text-muted mt-1">
              Add symbols to analyze
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {signals.map((item) => {
              const isSelected = selectedSymbol === item.symbol;

              return (
                <button
                  key={item.symbol}
                  onClick={() => onSelectSignal(item.symbol)}
                  className={`w-full min-h-[60px] rounded-xl border px-3 py-3 text-left transition-all duration-150
                    ${
                      isSelected
                        ? "border-accent/30 bg-accent/5 shadow-sm"
                        : "border-transparent hover:border-border hover:bg-bg-elevated"
                    }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${signalColor[item.signal]}`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-bold text-sm ${
                          isSelected ? "text-accent" : "text-text-primary"
                        }`}
                      >
                        {item.symbol}
                      </span>
                      <Badge
                        variant={signalBadgeVariant[item.signal]}
                        className="text-[10px] px-1.5 py-0.5"
                      >
                        {signalLabel[item.signal]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs text-text-secondary">
                        ${item.price.toFixed(2)}
                      </span>
                      {item.change !== undefined && (
                        <span
                          className={`font-mono text-[10px] ${
                            item.change >= 0 ? "text-bullish" : "text-bearish"
                          }`}
                        >
                          {item.change >= 0 ? "+" : ""}
                          {item.change.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-xs text-text-secondary shrink-0">
                    {Math.round(item.confidence * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
