"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { TrendingDown } from "lucide-react";

interface PnlDay {
  date: string;
  pnl: number;
}

interface DrawdownPeriod {
  startDate: string;
  troughDate: string;
  recoveryDate: string | null;
  depth: number;
  durationDays: number;
  recoveryDays: number | null;
}

const INITIAL_CAPITAL = 100000;

export default function DrawdownPage() {
  const [pnlDays, setPnlDays] = useState<PnlDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/pnl-calendar");
        if (res.ok) {
          const data = await res.json();
          setPnlDays(
            (data.days ?? data ?? []).map((d: { date: string; pnl: number }) => ({ date: d.date, pnl: d.pnl }))
              .sort((a: PnlDay, b: PnlDay) => a.date.localeCompare(b.date))
          );
        }
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, []);

  // Compute equity curve and drawdown
  const { equity, drawdowns, maxDD, currentDD, periods } = useMemo(() => {
    if (pnlDays.length === 0) return { equity: [], drawdowns: [], maxDD: 0, currentDD: 0, periods: [] };

    const eq: { date: string; value: number }[] = [];
    const dd: { date: string; drawdown: number }[] = [];
    let cumulative = INITIAL_CAPITAL;
    let peak = INITIAL_CAPITAL;
    let maxDrawdown = 0;

    for (const day of pnlDays) {
      cumulative += day.pnl;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak > 0 ? ((peak - cumulative) / peak) * 100 : 0;
      eq.push({ date: day.date, value: cumulative });
      dd.push({ date: day.date, drawdown });
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const current = dd.length > 0 ? dd[dd.length - 1].drawdown : 0;

    // Find drawdown periods > 2%
    const ddPeriods: DrawdownPeriod[] = [];
    let inDD = false;
    let start = "";
    let trough = "";
    let troughDepth = 0;

    for (let i = 0; i < dd.length; i++) {
      if (!inDD && dd[i].drawdown > 2) {
        inDD = true;
        start = dd[i].date;
        trough = dd[i].date;
        troughDepth = dd[i].drawdown;
      } else if (inDD) {
        if (dd[i].drawdown > troughDepth) {
          trough = dd[i].date;
          troughDepth = dd[i].drawdown;
        }
        if (dd[i].drawdown < 0.5) {
          const startIdx = pnlDays.findIndex((d) => d.date === start);
          const troughIdx = pnlDays.findIndex((d) => d.date === trough);
          ddPeriods.push({
            startDate: start,
            troughDate: trough,
            recoveryDate: dd[i].date,
            depth: troughDepth,
            durationDays: troughIdx - startIdx + 1,
            recoveryDays: i - troughIdx,
          });
          inDD = false;
          troughDepth = 0;
        }
      }
    }
    // Open drawdown
    if (inDD) {
      const startIdx = pnlDays.findIndex((d) => d.date === start);
      const troughIdx = pnlDays.findIndex((d) => d.date === trough);
      ddPeriods.push({
        startDate: start,
        troughDate: trough,
        recoveryDate: null,
        depth: troughDepth,
        durationDays: troughIdx - startIdx + 1,
        recoveryDays: null,
      });
    }

    ddPeriods.sort((a, b) => b.depth - a.depth);

    return { equity: eq, drawdowns: dd, maxDD: maxDrawdown, currentDD: current, periods: ddPeriods };
  }, [pnlDays]);

  const longestDD = periods.reduce((max, p) => Math.max(max, p.durationDays + (p.recoveryDays ?? 0)), 0);
  const avgRecovery = (() => {
    const recoverable = periods.filter((p) => p.recoveryDays !== null);
    if (recoverable.length === 0) return 0;
    return Math.round(recoverable.reduce((s, p) => s + (p.recoveryDays ?? 0), 0) / recoverable.length);
  })();

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.journal} />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (pnlDays.length === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.journal} />
        <PageIntro eyebrow="Risk Analytics" title="Drawdown Analyzer" description="Visualize underwater periods and recovery patterns." />
        <EmptyState
          icon={<TrendingDown className="w-10 h-10" />}
          title="No trading history"
          description="Complete some trades to analyze drawdowns and equity curve."
        />
      </div>
    );
  }

  const peakEquity = Math.max(...equity.map((e) => e.value));
  const minEquity = Math.min(...equity.map((e) => e.value));
  const equityRange = peakEquity - minEquity || 1;
  const maxDDDepth = Math.max(...drawdowns.map((d) => d.drawdown), 1);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.journal} />
      <PageIntro
        eyebrow="Risk Analytics"
        title="Drawdown Analyzer"
        description="Visualize underwater periods and recovery patterns in your trading equity curve."
        stats={[
          { label: "Max Drawdown", value: `${maxDD.toFixed(1)}%`, tone: "bearish" },
          { label: "Current DD", value: `${currentDD.toFixed(1)}%`, tone: currentDD > 2 ? "bearish" : "bullish" },
          { label: "Avg Recovery", value: `${avgRecovery}d` },
          { label: "Longest DD", value: `${longestDD}d`, tone: "bearish" },
        ]}
      />

      {/* Equity curve */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Equity Curve</CardTitle>
            <span className="text-xs text-text-muted font-mono">Peak: ${peakEquity.toLocaleString()}</span>
          </div>
        </CardHeader>
        <div className="flex items-end gap-px h-[180px]">
          {equity.map((e, i) => {
            const height = ((e.value - minEquity) / equityRange) * 100;
            const isAbove = e.value >= INITIAL_CAPITAL;
            return (
              <div
                key={i}
                className={`flex-1 min-w-[2px] rounded-t transition-all ${isAbove ? "bg-bullish/60" : "bg-bearish/60"}`}
                style={{ height: `${Math.max(height, 1)}%` }}
                title={`${e.date}: $${e.value.toLocaleString()}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-text-muted font-mono">
          <span>{equity[0]?.date}</span>
          <span>{equity[equity.length - 1]?.date}</span>
        </div>
      </Card>

      {/* Underwater chart */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Underwater Chart</CardTitle>
        </CardHeader>
        <div className="flex items-start gap-px h-[120px]">
          {drawdowns.map((d, i) => {
            const height = (d.drawdown / maxDDDepth) * 100;
            const intensity = Math.min(d.drawdown / 10, 1);
            return (
              <div
                key={i}
                className="flex-1 min-w-[2px] rounded-b"
                style={{
                  height: `${Math.max(height, 0)}%`,
                  backgroundColor: `oklch(0.55 ${0.05 + intensity * 0.15} 25)`,
                }}
                title={`${d.date}: -${d.drawdown.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-text-muted font-mono">
          <span>0%</span>
          <span>-{maxDDDepth.toFixed(1)}%</span>
        </div>
      </Card>

      {/* Drawdown periods */}
      {periods.length > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Drawdown Periods</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Start</th>
                  <th className="pb-2 pr-4 font-medium">Trough</th>
                  <th className="pb-2 pr-4 font-medium">Recovery</th>
                  <th className="pb-2 pr-4 font-medium text-right">Depth</th>
                  <th className="pb-2 pr-4 font-medium text-right">Duration</th>
                  <th className="pb-2 font-medium text-right">Recovery Time</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => (
                  <tr key={i} className={`border-b border-border/50 ${i === 0 ? "bg-bearish/5" : ""}`}>
                    <td className="py-2 pr-4 text-text-muted">{i + 1}</td>
                    <td className="py-2 pr-4 font-mono text-text-secondary">{p.startDate}</td>
                    <td className="py-2 pr-4 font-mono text-text-secondary">{p.troughDate}</td>
                    <td className="py-2 pr-4 font-mono text-text-secondary">{p.recoveryDate ?? "Open"}</td>
                    <td className="py-2 pr-4 text-right font-mono text-bearish">-{p.depth.toFixed(1)}%</td>
                    <td className="py-2 pr-4 text-right font-mono">{p.durationDays}d</td>
                    <td className="py-2 text-right font-mono">{p.recoveryDays !== null ? `${p.recoveryDays}d` : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
