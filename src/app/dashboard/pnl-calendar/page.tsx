"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
            <PnlCalendarGrid days={days} />
          </Card>
        </>
      )}
    </div>
  );
}
