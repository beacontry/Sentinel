"use client";

// Position detail side-sheet. Right-anchored drawer that opens when a user
// clicks a position row on the Trader page (or elsewhere). Shows:
//   - Header: symbol, current price, P&L (respecting global format pref)
//   - Stats grid: qty, entry, current, stop, market value, cost basis
//   - Signal history that opened the position (from /api/trader/signals)
//   - Actions: jump to chart, jump to trade ticket, close position, edit stop
//
// Closes on overlay click, X button, or Escape.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Send,
  Activity,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";
import { useDrawerA11y } from "@/hooks/useDrawerA11y";

interface PositionLike {
  symbol: string;
  quantity?: number;
  entryPrice?: number;
  currentPrice?: number;
  stopPrice?: number | null;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  marketValue?: number;
}

interface SignalLike {
  id: string;
  signal: string;
  symbol: string;
  price?: number;
  confidence?: number;
  traderTimestamp?: string;
  actedOn?: boolean;
}

interface PositionDetailSheetProps {
  symbol: string | null;
  position: PositionLike | null;
  /** Pre-loaded signal history from the parent (trader dashboard data). */
  signals: SignalLike[];
  onClose: () => void;
  /** Optional: pass the trader page's existing onClose-position handler. */
  onClosePosition?: (symbol: string) => Promise<void> | void;
  /** Engine running? Used to gate the "Close" action. */
  engineRunning: boolean;
}

export function PositionDetailSheet({
  symbol,
  position,
  signals,
  onClose,
  onClosePosition,
  engineRunning,
}: PositionDetailSheetProps) {
  const { pnlFormat } = useDisplayPrefs();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  // Drawer a11y refs — useDrawerA11y handles focus trap + restore on
  // close; aria-modal is set statically on the container below.
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc closes the sheet
  useEffect(() => {
    if (!symbol) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbol, onClose]);

  useDrawerA11y({ open: !!symbol, containerRef, closeRef: closeButtonRef });

  // Filter the parent's signals down to this symbol, newest first
  const symbolSignals = symbol
    ? signals
        .filter((s) => s.symbol === symbol)
        .sort((a, b) => {
          if (!a.traderTimestamp || !b.traderTimestamp) return 0;
          return new Date(b.traderTimestamp).getTime() - new Date(a.traderTimestamp).getTime();
        })
        .slice(0, 10)
    : [];

  if (!symbol || !position) return null;

  const pnl = position.unrealizedPnl ?? 0;
  const isPositive = pnl >= 0;
  const costBasis = (position.entryPrice ?? 0) * (position.quantity ?? 0);
  const marketValue =
    position.marketValue ?? (position.currentPrice ?? 0) * (position.quantity ?? 0);

  async function handleClose() {
    if (!onClosePosition || !position) return;
    if (engineRunning) {
      toast.toast({
        type: "warning",
        message: "Stop the engine to manually close positions.",
      });
      return;
    }
    setClosing(true);
    try {
      await onClosePosition(symbol!);
      onClose();
    } finally {
      setClosing(false);
    }
  }

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
        aria-label={`${symbol} position details`}
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto
          border-l border-border bg-bg-surface shadow-2xl animate-slide-in-right
          focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/analysis?symbol=${encodeURIComponent(symbol)}`}
                className="font-mono text-2xl font-bold text-text-primary hover:text-accent transition-colors"
              >
                {symbol}
              </Link>
              {isPositive ? (
                <TrendingUp className="w-5 h-5 text-bullish" />
              ) : (
                <TrendingDown className="w-5 h-5 text-bearish" />
              )}
            </div>
            <div className={`mt-1 font-mono text-base ${isPositive ? "text-bullish" : "text-bearish"}`}>
              {formatPnl(pnl, costBasis, pnlFormat)}
            </div>
            {pnlFormat === "dollar" && costBasis > 0 && (
              <div className="text-[10px] text-text-muted">
                ({((pnl / costBasis) * 100).toFixed(2)}%)
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"
            aria-label="Close position details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stat grid */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <StatTile label="Quantity" value={`${position.quantity ?? 0}`} />
          <StatTile label="Entry" value={`$${(position.entryPrice ?? 0).toFixed(2)}`} />
          <StatTile label="Current" value={`$${(position.currentPrice ?? 0).toFixed(2)}`} />
          <StatTile
            label="Stop"
            value={position.stopPrice ? `$${position.stopPrice.toFixed(2)}` : "—"}
            icon={<Shield className="w-3 h-3" />}
          />
          <StatTile label="Cost basis" value={`$${costBasis.toFixed(2)}`} />
          <StatTile label="Market value" value={`$${marketValue.toFixed(2)}`} />
        </div>

        {/* Signal history */}
        <div className="px-5 pb-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Signal history
            </span>
          </div>
          {symbolSignals.length === 0 ? (
            <p className="text-xs text-text-muted py-3 text-center">No recent signals for this symbol.</p>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {symbolSignals.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-bg-elevated px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={
                        s.signal.includes("BUY")
                          ? "bullish"
                          : s.signal.includes("SELL")
                          ? "bearish"
                          : "neutral"
                      }
                      className="text-[10px]"
                    >
                      {s.signal}
                    </Badge>
                    {s.actedOn && (
                      <Badge variant="default" className="text-[9px]">ACTED</Badge>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-text-muted shrink-0">
                    {s.price && <span className="font-mono">${s.price.toFixed(2)}</span>}
                    {s.confidence != null && (
                      <span className="ml-1.5">{Math.round(s.confidence * 100)}%</span>
                    )}
                    {s.traderTimestamp && (
                      <div className="font-mono opacity-60">{formatRelative(s.traderTimestamp)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 border-t border-border bg-bg-surface px-5 py-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/dashboard/analysis?symbol=${encodeURIComponent(symbol)}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm
                text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors min-h-[40px]"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Chart
            </Link>
            <Link
              href={`/dashboard/trade/${encodeURIComponent(symbol)}`}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm
                text-accent hover:bg-accent/20 transition-colors min-h-[40px]"
            >
              <Send className="w-3.5 h-3.5" />
              Trade
            </Link>
          </div>
          {onClosePosition && (
            <Button
              variant="destructive"
              size="md"
              className="w-full"
              disabled={engineRunning || closing}
              loading={closing}
              onClick={handleClose}
              title={engineRunning ? "Stop the engine first to manually close" : "Sell all shares at market"}
            >
              Close position
            </Button>
          )}
          {engineRunning && (
            <p className="text-[11px] text-text-muted text-center">
              Stop the engine on the Trader page to manually close positions.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-bg-elevated px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
        {icon}
        {label}
      </div>
      <div className="font-mono text-sm font-medium text-text-primary mt-0.5">
        {value}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  } catch {
    return "";
  }
}
