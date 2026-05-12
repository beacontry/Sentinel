"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { PnlCalendarGrid } from "@/components/dashboard/pnl-calendar-grid";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Trophy,
  BarChart3,
} from "lucide-react";
import type { PnlCalendarDay } from "@/types";

interface DayTrade {
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  pnl: number | null;
  fillTime: string;
}

type Source = "portfolio" | "trader" | "both";

interface Summary {
  totalPnl: number;
  profitDays: number;
  lossDays: number;
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
}

const SOURCE_OPTIONS: { label: string; value: Source }[] = [
  { label: "Portfolio", value: "portfolio" },
  { label: "Trader", value: "trader" },
  { label: "Both", value: "both" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function PnlCalendarPage() {
  const [days, setDays] = useState<PnlCalendarDay[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [source, setSource] = useState<Source>("both");
  const [loading, setLoading] = useState(true);

  // Day drill-down modal state
  const [openDay, setOpenDay] = useState<PnlCalendarDay | null>(null);
  const [dayTrades, setDayTrades] = useState<DayTrade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  // Fetch trades whenever a day modal opens. Uses the existing trader-trades
  // endpoint with a date filter; falls back to client-side filtering if the
  // endpoint doesn't support filtering yet.
  useEffect(() => {
    if (!openDay) return;
    let cancelled = false;
    setLoadingTrades(true);
    setDayTrades([]);
    fetch(`/api/trader/trades?date=${encodeURIComponent(openDay.date)}&limit=200`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const rows: DayTrade[] = (data.trades ?? []).filter(
          (t: DayTrade) => t.fillTime?.startsWith(openDay.date)
        );
        setDayTrades(rows);
      })
      .catch(() => {
        /* non-critical */
      })
      .finally(() => {
        if (!cancelled) setLoadingTrades(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openDay]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/pnl-calendar?source=${source}&days=365`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setDays(data.days ?? []);
          setSummary(data.summary ?? null);
        }
      } catch {
        // Calendar will be empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [source]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.journal} />
      <PageIntro
        eyebrow="Record"
        title="P&L Calendar"
        description="Visualize your daily trading outcomes as a heatmap to spot patterns and streaks."
        actions={
          <div className="flex items-center gap-1">
            {SOURCE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={source === opt.value ? "primary" : "outline"}
                size="sm"
                onClick={() => setSource(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        }
        stats={[
          {
            label: "Total P&L",
            value: summary ? `${summary.totalPnl >= 0 ? "+" : ""}$${summary.totalPnl.toFixed(2)}` : "--",
            tone: summary ? (summary.totalPnl >= 0 ? "bullish" : "bearish") : "neutral",
          },
          { label: "Profit Days", value: summary ? String(summary.profitDays) : "--", tone: "bullish" },
          { label: "Loss Days", value: summary ? String(summary.lossDays) : "--", tone: "bearish" },
          { label: "Trading Days", value: String(days.length) },
        ]}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : days.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <CalendarDays className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            No P&L data yet
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Start trading in your portfolio or connect the IBKR Trading Agent
            to see your daily P&L here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary stat cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-accent" />
                  <span className="text-xs text-text-muted">Total P&L</span>
                </div>
                <p className={`text-xl font-display font-bold ${
                  summary.totalPnl >= 0 ? "text-bullish" : "text-bearish"
                }`}>
                  {summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(2)}
                </p>
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-bullish" />
                  <span className="text-xs text-text-muted">Profitable Days</span>
                </div>
                <p className="text-xl font-display font-bold text-bullish">
                  {summary.profitDays}
                </p>
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-bearish" />
                  <span className="text-xs text-text-muted">Losing Days</span>
                </div>
                <p className="text-xl font-display font-bold text-bearish">
                  {summary.lossDays}
                </p>
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-warning" />
                  <span className="text-xs text-text-muted">Best Day</span>
                </div>
                {summary.bestDay ? (
                  <>
                    <p className="text-xl font-display font-bold text-bullish">
                      +${summary.bestDay.pnl.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {formatDate(summary.bestDay.date)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">--</p>
                )}
              </Card>
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-bearish" />
                  <span className="text-xs text-text-muted">Worst Day</span>
                </div>
                {summary.worstDay ? (
                  <>
                    <p className="text-xl font-display font-bold text-bearish">
                      ${summary.worstDay.pnl.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {formatDate(summary.worstDay.date)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-muted">--</p>
                )}
              </Card>
            </div>
          )}

          {/* Calendar heatmap */}
          <Card>
            <PnlCalendarGrid
              days={days}
              onDayClick={(d) => {
                if (d.tradesCount > 0) setOpenDay(d);
              }}
            />
            <p className="mt-3 text-[11px] text-text-muted text-center">
              Click any day with activity to see that day&apos;s trades.
            </p>
          </Card>
        </>
      )}

      {/* Day drill-down */}
      <Modal open={openDay !== null} onClose={() => setOpenDay(null)} className="max-w-2xl">
        <ModalHeader>
          <ModalTitle>
            {openDay && new Date(openDay.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </ModalTitle>
        </ModalHeader>
        {openDay && (
          <div className="px-5 pb-2 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-bg-elevated px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">P&L</div>
                <div
                  className={`font-mono text-base font-semibold ${
                    openDay.pnl >= 0 ? "text-bullish" : "text-bearish"
                  }`}
                >
                  {openDay.pnl >= 0 ? "+" : ""}${openDay.pnl.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-bg-elevated px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Trades</div>
                <div className="font-mono text-base text-text-primary">{openDay.tradesCount}</div>
              </div>
              <div className="rounded-lg bg-bg-elevated px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Avg / Trade</div>
                <div
                  className={`font-mono text-base ${
                    openDay.pnl >= 0 ? "text-bullish" : "text-bearish"
                  }`}
                >
                  {openDay.tradesCount > 0
                    ? `$${(openDay.pnl / openDay.tradesCount).toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>

            {loadingTrades ? (
              <p className="text-sm text-text-muted py-6 text-center">Loading trades…</p>
            ) : dayTrades.length === 0 ? (
              <p className="text-sm text-text-muted py-6 text-center">
                No trade detail available for this day.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Action</th>
                      <th className="pb-2 pr-3 font-medium">Symbol</th>
                      <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                      <th className="pb-2 pr-3 font-medium text-right">Price</th>
                      <th className="pb-2 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {dayTrades.map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 text-text-muted">
                          {new Date(t.fillTime).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-1.5 pr-3">
                          <Badge
                            variant={t.action.toUpperCase().includes("BUY") ? "bullish" : "bearish"}
                          >
                            {t.action.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-3">
                          <SymbolLink symbol={t.symbol} className="text-text-primary" stopPropagation />
                        </td>
                        <td className="py-1.5 pr-3 text-right">{t.quantity}</td>
                        <td className="py-1.5 pr-3 text-right">${t.price.toFixed(2)}</td>
                        <td
                          className={`py-1.5 text-right ${
                            t.pnl == null ? "text-text-muted" : t.pnl >= 0 ? "text-bullish" : "text-bearish"
                          }`}
                        >
                          {t.pnl == null
                            ? "—"
                            : `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
