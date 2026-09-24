"use client";

import Link from "next/link";
import { Sparkles, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { OrderStatusChip, StatusChip } from "@/components/ui/status-chip";
import { SignedValue } from "@/components/ui/signed-value";
import { PostMortemButton } from "@/components/trader/post-mortem-button";
import type { PnlFormat } from "@/lib/format-pnl";
import type { SignalType } from "@/types";
import type { TraderSignal, TraderTrade } from "./types";
import { timeAgo } from "./types";

/**
 * The trader page's two feeds, as lists inside their cards: rows are
 * separated by hairlines rather than drawn as a card per row. Rendering
 * only; the page owns the AI summary request.
 */

/**
 * `fill`: from xl up the list takes whatever height its column leaves
 * (flex-1 from a zero basis) instead of stopping at 400px, so the side
 * column ends level with the main one rather than above an empty strip.
 * The parent must be a flex column; 240px is the floor when the other
 * side panels already fill the row.
 */
export function RecentSignals({ signals, fill = false }: { signals: TraderSignal[]; fill?: boolean }) {
  if (signals.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-text-muted">No signals yet</p>
        <p className="mt-1 text-xs text-text-muted">
          Signals appear here once the engine scans your watchlist. Start the engine above, or browse the{" "}
          <Link href="/dashboard/screener" className="text-accent hover:underline">Screener</Link>{" "}
          for ideas.
        </p>
      </div>
    );
  }
  return (
    <ul
      className={`max-h-[400px] divide-y divide-[var(--color-hairline-inner)] overflow-y-auto ${
        fill ? "xl:max-h-none xl:min-h-60 xl:flex-1 xl:basis-0" : ""
      }`}
    >
      {signals.map((s) => (
        <li key={s.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
          <SignalBadge signal={s.signal as SignalType} />
          <SymbolLink symbol={s.symbol} className="text-sm font-medium" />
          <span className="font-mono text-xs text-text-muted tabular-nums">${(s.price ?? 0).toFixed(2)}</span>
          {s.actedOn && <StatusChip tone="accent">Acted</StatusChip>}
          <span className="ml-auto text-xs text-text-muted">{timeAgo(s.traderTimestamp)}</span>
        </li>
      ))}
    </ul>
  );
}

interface RecentTradesProps {
  trades: TraderTrade[];
  pnlFormat: PnlFormat;
  summarizing: Set<string>;
  summaries: Record<string, string>;
  onSummarize: (tradeId: string) => void;
}

export function RecentTrades({ trades, pnlFormat, summarizing, summaries, onSummarize }: RecentTradesProps) {
  if (trades.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-text-muted">No trades yet</p>
        <p className="mt-1 text-xs text-text-muted">
          Trades show here after the engine fires a BUY/SELL on a signal. New to this?{" "}
          <Link href="/dashboard/education" className="text-accent hover:underline">Browse the Education hub →</Link>
        </p>
      </div>
    );
  }
  return (
    <ul className="max-h-[500px] divide-y divide-[var(--color-hairline-inner)] overflow-y-auto">
      {trades.map((t) => {
        const summary = summaries[t.id] || t.aiSummary;
        const busy = summarizing.has(t.id);
        // Percent basis is the ENTRY cost, not the exit proceeds: cost =
        // proceeds − realized P&L = entryPrice × qty. A missing fill price
        // (cost ≤ 0) falls back to dollars.
        const costBasis = t.pnl != null ? (t.fillPrice ?? 0) * t.quantity - t.pnl : 0;
        const buy = t.action === "BUY";
        return (
          <li key={t.id} className="py-2">
            {/* Phone: two rows (what and the result; then status, age and
                actions). From md up the row wrappers dissolve (contents)
                and every cell lands in one column grid, so figures line up
                down the list. */}
            <div className="flex flex-col gap-1.5 md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_7.5rem_14rem] md:items-center md:gap-x-3">
              <div className="flex items-center gap-3 md:contents">
                <div className="flex min-w-0 flex-1 items-center gap-2 md:order-1">
                  <StatusChip tone={buy ? "bullish" : "bearish"} icon={buy ? "▲" : "▼"}>
                    {t.action}
                  </StatusChip>
                  <SymbolLink symbol={t.symbol} className="text-sm font-medium" />
                  <span className="truncate font-mono text-xs text-text-muted tabular-nums">{t.quantity} sh</span>
                </div>
                <div className="shrink-0 text-right text-sm md:order-4">
                  {t.pnl != null ? (
                    <SignedValue value={t.pnl} basis={costBasis > 0 ? costBasis : undefined} format={pnlFormat} />
                  ) : (
                    <>
                      <span aria-hidden="true" className="text-text-muted">—</span>
                      <span className="sr-only">No realized P&L</span>
                    </>
                  )}
                </div>
              </div>
              {/* Wraps on a phone: a closing trade carries two actions,
                  and chip, age, Summary and Post-mortem overran the card by
                  about 18px at 390. The actions then take their own line. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:contents">
                <div className="md:order-2">
                  <OrderStatusChip status={t.status} />
                </div>
                <span className="whitespace-nowrap text-xs text-text-muted md:order-3">{timeAgo(t.traderTimestamp)}</span>
                <div className="ml-auto flex items-center justify-end gap-1 md:order-5 md:ml-0 md:justify-start">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSummarize(t.id)}
                    loading={busy}
                    title="AI summary of this trade"
                    aria-label={summary ? `Refresh the AI summary of ${t.symbol}` : `Summarize the ${t.symbol} trade with AI`}
                  >
                    {!busy && (summary ? <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />)}
                    <span className="text-xs">{summary ? "Refresh" : "Summary"}</span>
                  </Button>
                  <PostMortemButton tradeId={t.id} action={t.action} />
                </div>
              </div>
            </div>
            {summary && (
              <p className="mt-1 rounded-lg bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-secondary">
                <span className="eyebrow mr-2 text-text-muted">Summary</span>
                {summary}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
