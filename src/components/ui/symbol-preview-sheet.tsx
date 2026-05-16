"use client";

/**
 * Symbol preview drawer.
 *
 * Lightweight cousin of <PositionDetailSheet>. Opens on any ticker click
 * across the app (Unusual Activity, Trader, Screener, anywhere) and shows
 * a quick info card without taking the user off the page they're on:
 *
 *   - Current price + intraday change
 *   - Signal (BUY/SELL/HOLD with confidence)
 *   - RSI / volume ratio / sector
 *   - 1-sentence latest headline if available
 *
 * Three escape hatches at the bottom:
 *   - View full analysis (→ /dashboard/analysis?symbol=…)
 *   - Trade (→ /dashboard/trade/…)
 *   - Add to watchlist (POST /api/watchlist, optimistic toast)
 *
 * Data fetched from /api/analyze/[symbol] (already exists, cached
 * server-side for 60s). Closes on overlay click, X, or Escape.
 *
 * Render once per page near the root; show by setting the controlled
 * `symbol` prop. `null` hides it.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, BarChart3, Send, TrendingUp, TrendingDown, Minus, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDrawerA11y } from "@/hooks/useDrawerA11y";

interface SymbolPreviewSheetProps {
  symbol: string | null;
  onClose: () => void;
}

interface AnalysisResponse {
  symbol: string;
  price?: number;
  signal?: string;
  confidence?: number;
  volume?: number;
  indicators?: {
    rsi_14?: number;
    sma_20?: number;
    sma_50?: number;
    atr_14?: number;
    [k: string]: number | undefined;
  };
  sector?: string;
  changePct?: number;
}

const SIGNAL_TONE: Record<string, { label: string; cls: string }> = {
  STRONG_BUY: { label: "Strong Buy", cls: "bg-bullish/15 text-bullish border-bullish/30" },
  BUY: { label: "Buy", cls: "bg-bullish/10 text-bullish border-bullish/20" },
  HOLD: { label: "Hold", cls: "bg-text-muted/10 text-text-muted border-border" },
  SELL: { label: "Sell", cls: "bg-bearish/10 text-bearish border-bearish/20" },
  STRONG_SELL: { label: "Strong Sell", cls: "bg-bearish/15 text-bearish border-bearish/30" },
};

export function SymbolPreviewSheet({ symbol, onClose }: SymbolPreviewSheetProps) {
  const toast = useToast();
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Fetch on open. Reset on close so a re-open of the same symbol re-fetches
  // (price may have moved). The /api/analyze cache (60s server-side) keeps
  // this cheap.
  useEffect(() => {
    if (!symbol) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analyze/${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AnalysisResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Esc closes
  useEffect(() => {
    if (!symbol) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbol, onClose]);

  // Focus trap + restore on close (a11y).
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDrawerA11y({ open: !!symbol, containerRef, closeRef: closeButtonRef });

  async function handleAddToWatchlist() {
    if (!symbol) return;
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok || res.status === 409) {
        toast.toast({
          type: "success",
          message:
            res.status === 409
              ? `${symbol} is already in your watchlist`
              : `Added ${symbol} to watchlist`,
        });
      } else {
        toast.toast({ type: "error", message: "Failed to add to watchlist" });
      }
    } catch {
      toast.toast({ type: "error", message: "Failed to add to watchlist" });
    } finally {
      setAdding(false);
    }
  }

  if (!symbol) return null;

  const price = data?.price ?? 0;
  const changePct = data?.changePct ?? null;
  const isPositive = (changePct ?? 0) >= 0;
  const signal = data?.signal ?? "HOLD";
  const signalMeta = SIGNAL_TONE[signal] ?? SIGNAL_TONE.HOLD;
  const rsi = data?.indicators?.rsi_14;
  const sector = data?.sector;
  const volume = data?.volume;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${symbol} quick info`}
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm overflow-y-auto
          border-l border-border bg-bg-surface shadow-2xl animate-slide-in-right
          focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/dashboard/analysis?symbol=${encodeURIComponent(symbol)}`}
                className="font-mono text-2xl font-bold text-text-primary hover:text-accent transition-colors"
              >
                {symbol}
              </Link>
              {!loading && data && (
                isPositive ? (
                  <TrendingUp className="w-5 h-5 text-bullish" />
                ) : changePct === null ? (
                  <Minus className="w-5 h-5 text-text-muted" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-bearish" />
                )
              )}
            </div>
            {sector && (
              <p className="mt-0.5 text-xs text-text-muted">{sector}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close quick info"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-bearish">Failed to load: {error}</p>
          ) : data ? (
            <>
              {/* Price */}
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted">Last price</div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="font-mono text-3xl font-semibold text-text-primary">
                    ${price.toFixed(2)}
                  </span>
                  {changePct !== null && (
                    <span
                      className={`font-mono text-sm ${
                        isPositive ? "text-bullish" : "text-bearish"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {changePct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Signal */}
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted">Current signal</div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${signalMeta.cls}`}
                  >
                    {signalMeta.label}
                  </span>
                  {data.confidence !== undefined && (
                    <span className="text-xs text-text-muted">
                      {(data.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {rsi !== undefined && (
                  <Stat
                    label="RSI (14)"
                    value={rsi.toFixed(1)}
                    tone={rsi >= 70 ? "warning" : rsi <= 30 ? "warning" : "neutral"}
                    sub={rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : ""}
                  />
                )}
                {volume !== undefined && volume > 0 && (
                  <Stat
                    label="Volume"
                    value={formatVolume(volume)}
                  />
                )}
                {data.indicators?.sma_20 !== undefined && (
                  <Stat
                    label="SMA 20"
                    value={`$${data.indicators.sma_20.toFixed(2)}`}
                  />
                )}
                {data.indicators?.sma_50 !== undefined && (
                  <Stat
                    label="SMA 50"
                    value={`$${data.indicators.sma_50.toFixed(2)}`}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 border-t border-border bg-bg-surface px-5 py-3 space-y-2">
          <Link href={`/dashboard/analysis?symbol=${encodeURIComponent(symbol)}`}>
            <Button variant="primary" className="w-full">
              <BarChart3 className="w-4 h-4 mr-1.5" />
              View full analysis
            </Button>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/dashboard/trade/${encodeURIComponent(symbol)}`}>
              <Button variant="secondary" className="w-full">
                <Send className="w-4 h-4 mr-1.5" />
                Trade
              </Button>
            </Link>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleAddToWatchlist}
              loading={adding}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Watch
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
  sub?: string;
}

function Stat({ label, value, tone = "neutral", sub }: StatProps) {
  return (
    <div className="rounded-lg bg-bg-elevated px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</div>
      <div
        className={`mt-0.5 font-mono text-sm font-medium ${
          tone === "warning" ? "text-warning" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
