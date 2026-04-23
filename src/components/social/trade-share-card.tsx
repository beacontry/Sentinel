"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SharedTrade {
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  pnl?: number | null;
  pnlPercent?: number | null;
  strategy?: string | null;
  timestamp: string;
}

interface TradeShareCardProps {
  trade: SharedTrade;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

export function TradeShareCard({ trade }: TradeShareCardProps) {
  const isProfit = (trade.pnl ?? 0) >= 0;
  const hasPnl = trade.pnl != null;

  return (
    <div
      className="mt-2 p-3 rounded-lg border border-border bg-bg-elevated"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm text-text-primary">
            {trade.symbol}
          </span>
          <Badge variant={trade.action === "BUY" ? "bullish" : "bearish"}>
            {trade.action}
          </Badge>
          {trade.strategy && (
            <Badge variant="neutral" className="text-[10px]">
              {trade.strategy}
            </Badge>
          )}
        </div>
        {hasPnl && (
          <div className="flex items-center gap-1">
            {isProfit ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-bullish" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-bearish" />
            )}
            <span
              className={`font-mono text-sm font-semibold ${
                isProfit ? "text-bullish" : "text-bearish"
              }`}
            >
              {isProfit ? "+" : ""}
              {formatCurrency(trade.pnl!)}
            </span>
            {trade.pnlPercent != null && (
              <span
                className={`font-mono text-xs ${
                  isProfit ? "text-bullish" : "text-bearish"
                }`}
              >
                ({isProfit ? "+" : ""}
                {trade.pnlPercent.toFixed(1)}%)
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>
          {trade.quantity} shares @ {formatCurrency(trade.entryPrice)}
        </span>
        {trade.exitPrice != null && (
          <span>Exit @ {formatCurrency(trade.exitPrice)}</span>
        )}
        <span>
          {new Date(trade.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
