"use client";

import { useState, useRef } from "react";
import { Send, Hash, BarChart3, X, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeShareCard, type SharedTrade } from "@/components/social/trade-share-card";

interface ComposeBoxProps {
  onPost: (post: {
    id: string;
    content: string;
    symbol: string | null;
    createdAt: string;
    userId: string;
    authorName: string;
    likeCount: number;
    commentCount: number;
    liked: boolean;
  }) => void;
}

interface RecentTrade {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  fillPrice: number | null;
  fillTime: string | null;
  pnl: number | null;
  status: string;
  createdAt: string;
}

const MAX_CHARS = 500;

export function ComposeBox({ onPost }: ComposeBoxProps) {
  const [content, setContent] = useState("");
  const [symbol, setSymbol] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Trade attachment
  const [showTradePicker, setShowTradePicker] = useState(false);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [attachedTrade, setAttachedTrade] = useState<SharedTrade | null>(null);

  const charCount = content.length;
  const overLimit = charCount > MAX_CHARS;

  async function loadRecentTrades() {
    if (loadingTrades) return;
    setLoadingTrades(true);
    try {
      const res = await fetch("/api/trader/dashboard");
      if (res.ok) {
        const data = await res.json();
        // Filter to filled trades with fill data
        const filled = (data.trades ?? [])
          .filter((t: RecentTrade) => t.status === "FILLED" && t.fillPrice)
          .slice(0, 10);
        setRecentTrades(filled);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingTrades(false);
    }
  }

  function handleAttachTrade(trade: RecentTrade) {
    setAttachedTrade({
      symbol: trade.symbol,
      action: trade.action as "BUY" | "SELL",
      quantity: trade.quantity,
      entryPrice: trade.fillPrice ?? 0,
      pnl: trade.pnl,
      pnlPercent: trade.pnl && trade.fillPrice
        ? (trade.pnl / (trade.fillPrice * trade.quantity)) * 100
        : null,
      timestamp: trade.fillTime ?? trade.createdAt,
    });
    setShowTradePicker(false);

    // Auto-tag symbol if not already set
    if (!symbol) {
      setSymbol(trade.symbol.toUpperCase());
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || overLimit || posting) return;

    setPosting(true);
    setError("");

    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          symbol: symbol.trim() || undefined,
          sharedTrade: attachedTrade || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post");
        return;
      }

      const data = await res.json();
      onPost(data.post);
      setContent("");
      setSymbol("");
      setAttachedTrade(null);
      textareaRef.current?.focus();
    } catch {
      setError("Network error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind? Use $NVDA to mention tickers, [[screener]] to link pages..."
          rows={3}
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2.5
            text-sm text-text-primary placeholder:text-text-muted
            transition-colors duration-150 resize-y
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />

        {/* Attached trade preview */}
        {attachedTrade && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setAttachedTrade(null)}
              className="absolute top-2 right-2 p-1 rounded-full bg-bg-hover
                text-text-muted hover:text-text-primary transition-colors cursor-pointer z-10"
              aria-label="Remove trade"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <TradeShareCard trade={attachedTrade} />
          </div>
        )}

        {/* Trade picker */}
        {showTradePicker && (
          <div className="rounded-lg border border-border bg-bg-elevated p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-text-secondary">
                Recent Filled Trades
              </p>
              <button
                type="button"
                onClick={() => setShowTradePicker(false)}
                className="text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {loadingTrades ? (
              <p className="text-xs text-text-muted py-2">Loading trades...</p>
            ) : recentTrades.length === 0 ? (
              <p className="text-xs text-text-muted py-2">
                No recent filled trades found.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {recentTrades.map((trade) => (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => handleAttachTrade(trade)}
                    className="w-full flex items-center justify-between p-2 rounded-lg
                      hover:bg-bg-hover transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-text-primary">
                        {trade.symbol}
                      </span>
                      <Badge
                        variant={trade.action === "BUY" ? "bullish" : "bearish"}
                        className="text-[10px]"
                      >
                        {trade.action}
                      </Badge>
                      <span className="text-xs text-text-muted">
                        {trade.quantity} shares
                      </span>
                    </div>
                    {trade.pnl != null && (
                      <span
                        className={`font-mono text-xs ${
                          trade.pnl >= 0 ? "text-bullish" : "text-bearish"
                        }`}
                      >
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                <Hash className="h-4 w-4" />
              </div>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="Symbol"
                className="w-28 rounded-lg border border-border bg-bg-elevated pl-9 pr-3 py-2
                  text-sm text-text-primary placeholder:text-text-muted
                  transition-colors duration-150
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                  min-h-[44px]"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!showTradePicker) {
                  loadRecentTrades();
                }
                setShowTradePicker(!showTradePicker);
              }}
              className="gap-1.5"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Share Trade</span>
            </Button>
            <span
              className={`text-xs ${
                overLimit ? "text-bearish" : "text-text-muted"
              }`}
            >
              {charCount}/{MAX_CHARS}
            </span>
          </div>
          <Button
            type="submit"
            size="md"
            disabled={!content.trim() || overLimit || posting}
            loading={posting}
          >
            <Send className="h-4 w-4" />
            Post
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Info className="w-3 h-3" />
          <span>
            <span className="font-mono text-accent/80">$NVDA</span> links to analysis
            &middot; <span className="font-mono text-text-secondary">[[screener]]</span> links to app pages
          </span>
        </div>
        {error && <p className="text-xs text-bearish">{error}</p>}
      </form>
    </Card>
  );
}
