"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Target, TrendingUp, TrendingDown } from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";

interface PerformanceData {
  overall: {
    totalSignals: number;
    correctSignals: number;
    accuracy: number;
    avgReturn: number;
  };
  byType: Array<{
    signalType: string;
    count: number;
    correct: number;
    accuracy: number;
    avgReturn: number;
  }>;
  bySymbol: Array<{
    symbol: string;
    count: number;
    correct: number;
    accuracy: number;
    avgReturn: number;
  }>;
  weekly: Array<{
    week: string;
    count: number;
    correct: number;
    winRate: number;
  }>;
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/performance");
        if (res.ok) setData(await res.json());
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.overall.totalSignals === 0) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.journal} />
        <PageIntro
          eyebrow="Record"
          title="Performance"
          description="Track signal accuracy, win rates, and returns across symbols and signal types."
        />
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            No performance data yet
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Run analyses and wait 24 hours for accuracy data to be collected.
          </p>
        </div>
      </div>
    );
  }

  const o = data.overall;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.journal} />
      <PageIntro
        eyebrow="Record"
        title="Performance"
        description="Track signal accuracy, win rates, and returns across symbols and signal types."
        stats={[
          { label: "Win Rate", value: `${Math.round(o.accuracy * 100)}%`, tone: o.accuracy >= 0.5 ? "bullish" : "bearish" },
          { label: "Total Signals", value: String(o.totalSignals) },
          { label: "Avg Return", value: `${o.avgReturn >= 0 ? "+" : ""}${o.avgReturn.toFixed(2)}%`, tone: o.avgReturn >= 0 ? "bullish" : "bearish" },
          { label: "Correct", value: `${o.correctSignals} / ${o.totalSignals}`, tone: "bullish" },
        ]}
      />

      {/* Overall stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-accent" />
            <span className="text-xs text-text-muted">Win Rate</span>
          </div>
          <p className={`text-xl font-display font-bold ${o.accuracy >= 0.5 ? "text-bullish" : "text-bearish"}`}>
            {Math.round(o.accuracy * 100)}%
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span className="text-xs text-text-muted">Total Signals</span>
          </div>
          <p className="text-xl font-display font-bold">{o.totalSignals}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            {o.avgReturn >= 0 ? (
              <TrendingUp className="w-4 h-4 text-bullish" />
            ) : (
              <TrendingDown className="w-4 h-4 text-bearish" />
            )}
            <span className="text-xs text-text-muted">Avg Return</span>
          </div>
          <p className={`text-xl font-display font-bold ${o.avgReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
            {o.avgReturn >= 0 ? "+" : ""}{o.avgReturn.toFixed(2)}%
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-accent" />
            <span className="text-xs text-text-muted">Correct</span>
          </div>
          <p className="text-xl font-display font-bold text-bullish">
            {o.correctSignals} / {o.totalSignals}
          </p>
        </Card>
      </div>

      {/* By signal type */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Accuracy by Signal Type</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {data.byType.map((t) => (
            <div key={t.signalType} className="flex items-center gap-3">
              <Badge
                variant={
                  t.signalType.includes("BUY")
                    ? "bullish"
                    : t.signalType.includes("SELL")
                      ? "bearish"
                      : "neutral"
                }
              >
                {t.signalType}
              </Badge>
              <div className="flex-1">
                <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${t.accuracy >= 0.5 ? "bg-bullish" : "bg-bearish"}`}
                    style={{ width: `${t.accuracy * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-mono text-text-secondary w-16 text-right">
                {Math.round(t.accuracy * 100)}%
              </span>
              <span className="text-xs text-text-muted w-12 text-right">
                ({t.count})
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* By symbol */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Top Performing Symbols</CardTitle>
        </CardHeader>
        {data.bySymbol.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium text-right">Signals</th>
                  <th className="pb-2 pr-4 font-medium text-right">Win Rate</th>
                  <th className="pb-2 font-medium text-right">Avg Return</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {data.bySymbol.map((s) => (
                  <tr key={s.symbol} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{s.symbol}</td>
                    <td className="py-2 pr-4 text-right">{s.count}</td>
                    <td className={`py-2 pr-4 text-right ${s.accuracy >= 0.5 ? "text-bullish" : "text-bearish"}`}>
                      {Math.round(s.accuracy * 100)}%
                    </td>
                    <td className={`py-2 text-right ${s.avgReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {s.avgReturn >= 0 ? "+" : ""}{s.avgReturn.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Weekly trend */}
      {data.weekly.length > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Weekly Win Rate Trend</CardTitle>
          </CardHeader>
          <div className="flex items-end gap-1 h-32">
            {data.weekly.map((w) => (
              <div
                key={w.week}
                className="flex-1 flex flex-col items-center justify-end gap-1"
              >
                <span className="text-[9px] font-mono text-text-muted">
                  {Math.round(w.winRate * 100)}%
                </span>
                <div
                  className={`w-full rounded-t ${w.winRate >= 0.5 ? "bg-bullish/70" : "bg-bearish/70"}`}
                  style={{ height: `${Math.max(w.winRate * 100, 4)}%` }}
                />
                <span className="text-[8px] text-text-muted truncate w-full text-center">
                  {new Date(w.week).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
