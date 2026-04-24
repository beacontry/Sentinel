"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { FileBarChart } from "lucide-react";

interface PerformanceData {
  overall: { totalSignals: number; correctSignals: number; accuracy: number; avgReturn: number };
  byType: { signalType: string; count: number; correct: number; accuracy: number; avgReturn: number }[];
  bySymbol: { symbol: string; count: number; correct: number; accuracy: number; avgReturn: number }[];
  weekly: { week: string; count: number; correct: number; winRate: number }[];
}

interface Trade {
  symbol: string;
  action: string;
  fillPrice: number;
  fillTime: string;
  pnl: number | null;
  signal: string;
  status: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ReportsPage() {
  const [perf, setPerf] = useState<PerformanceData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function load() {
      const [perfRes, traderRes] = await Promise.allSettled([
        fetch("/api/performance"),
        fetch("/api/trader/dashboard"),
      ]);
      if (perfRes.status === "fulfilled" && perfRes.value.ok) setPerf(await perfRes.value.json());
      if (traderRes.status === "fulfilled" && traderRes.value.ok) {
        const data = await traderRes.value.json();
        setTrades((data.trades ?? []).filter((t: Trade) => t.status === "FILLED"));
      }
      setLoading(false);
    }
    load();
  }, []);

  // Compute analytics from trades
  const analytics = useMemo(() => {
    if (trades.length === 0) return null;

    const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnl ?? 0) < 0);
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length) : 0;
    const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
    const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const bestTrade = Math.max(...trades.map((t) => t.pnl ?? 0));
    const worstTrade = Math.min(...trades.map((t) => t.pnl ?? 0));

    // Win/loss streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentStreak = 0;
    let streakType: "win" | "loss" | null = null;
    for (const t of trades) {
      const isWin = (t.pnl ?? 0) > 0;
      if (isWin && streakType === "win") { currentStreak++; }
      else if (!isWin && streakType === "loss") { currentStreak++; }
      else { currentStreak = 1; streakType = isWin ? "win" : "loss"; }
      if (streakType === "win" && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
      if (streakType === "loss" && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
    }

    // By day of week
    const byDay: Record<number, { count: number; wins: number; pnl: number }> = {};
    for (let d = 0; d < 7; d++) byDay[d] = { count: 0, wins: 0, pnl: 0 };
    for (const t of trades) {
      if (!t.fillTime) continue;
      const day = new Date(t.fillTime).getDay();
      byDay[day].count++;
      if ((t.pnl ?? 0) > 0) byDay[day].wins++;
      byDay[day].pnl += t.pnl ?? 0;
    }

    // By hour
    const byHour: Record<number, { count: number; wins: number }> = {};
    for (const t of trades) {
      if (!t.fillTime) continue;
      const hour = new Date(t.fillTime).getHours();
      if (!byHour[hour]) byHour[hour] = { count: 0, wins: 0 };
      byHour[hour].count++;
      if ((t.pnl ?? 0) > 0) byHour[hour].wins++;
    }

    return {
      totalTrades: trades.length, winRate, avgWin, avgLoss,
      expectancy, profitFactor, bestTrade, worstTrade,
      maxWinStreak, maxLossStreak, byDay, byHour,
    };
  }, [trades]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.journal} />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!perf && !analytics) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.journal} />
        <PageIntro eyebrow="Analytics" title="Performance Reports" description="Deep analytics on your trading performance." />
        <EmptyState
          icon={<FileBarChart className="w-10 h-10" />}
          title="No trading data"
          description="Complete some trades to generate performance reports."
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.journal} />
      <PageIntro
        eyebrow="Analytics"
        title="Performance Reports"
        description="Deep analytics on your trading performance across multiple dimensions."
        stats={[
          { label: "Win Rate", value: analytics ? `${(analytics.winRate * 100).toFixed(0)}%` : `${((perf?.overall.accuracy ?? 0) * 100).toFixed(0)}%`, tone: (analytics?.winRate ?? perf?.overall.accuracy ?? 0) >= 0.5 ? "bullish" : "bearish" },
          { label: "Expectancy", value: analytics ? `$${analytics.expectancy.toFixed(0)}` : "--", tone: (analytics?.expectancy ?? 0) > 0 ? "bullish" : "bearish" },
          { label: "Profit Factor", value: analytics ? (analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2)) : "--", tone: "brand" },
          { label: "Win Streak", value: analytics ? String(analytics.maxWinStreak) : "--", tone: "bullish" },
        ]}
      />

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "signal", label: "By Signal" },
          { id: "time", label: "By Time" },
          { id: "symbol", label: "By Symbol" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <TabPanel active={activeTab === "overview"}>
        {analytics && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Trades", value: String(analytics.totalTrades), color: "text-text-primary" },
                { label: "Win Rate", value: `${(analytics.winRate * 100).toFixed(0)}%`, color: analytics.winRate >= 0.5 ? "text-bullish" : "text-bearish" },
                { label: "Avg Win", value: `$${analytics.avgWin.toFixed(0)}`, color: "text-bullish" },
                { label: "Avg Loss", value: `$${analytics.avgLoss.toFixed(0)}`, color: "text-bearish" },
                { label: "Expectancy", value: `$${analytics.expectancy.toFixed(0)}`, color: analytics.expectancy > 0 ? "text-bullish" : "text-bearish" },
                { label: "Profit Factor", value: analytics.profitFactor === Infinity ? "∞" : analytics.profitFactor.toFixed(2), color: "text-accent" },
                { label: "Best Trade", value: `$${analytics.bestTrade.toFixed(0)}`, color: "text-bullish" },
                { label: "Worst Trade", value: `$${analytics.worstTrade.toFixed(0)}`, color: "text-bearish" },
              ].map((s) => (
                <Card key={s.label}>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{s.label}</div>
                  <div className={`mt-1 text-xl font-mono font-semibold ${s.color}`}>{s.value}</div>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="p-0 pb-3"><CardTitle>Win / Loss Streaks</CardTitle></CardHeader>
              <div className="flex gap-6">
                <div>
                  <div className="text-[11px] text-text-muted uppercase tracking-[0.08em]">Longest Win</div>
                  <div className="text-2xl font-mono font-semibold text-bullish">{analytics.maxWinStreak}</div>
                </div>
                <div>
                  <div className="text-[11px] text-text-muted uppercase tracking-[0.08em]">Longest Loss</div>
                  <div className="text-2xl font-mono font-semibold text-bearish">{analytics.maxLossStreak}</div>
                </div>
              </div>
            </Card>

            {/* Weekly accuracy */}
            {perf && perf.weekly.length > 0 && (
              <Card>
                <CardHeader className="p-0 pb-3"><CardTitle>Weekly Win Rate</CardTitle></CardHeader>
                <div className="flex items-end gap-1 h-[100px]">
                  {perf.weekly.slice(-20).map((w, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t ${w.winRate >= 0.5 ? "bg-bullish/60" : "bg-bearish/60"}`}
                        style={{ height: `${w.winRate * 100}%` }}
                        title={`${w.week}: ${(w.winRate * 100).toFixed(0)}%`}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </TabPanel>

      <TabPanel active={activeTab === "signal"}>
        {perf && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Signal</th>
                    <th className="pb-2 pr-4 font-medium text-right">Count</th>
                    <th className="pb-2 pr-4 font-medium text-right">Win Rate</th>
                    <th className="pb-2 font-medium text-right">Avg Return</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.byType.map((t) => (
                    <tr key={t.signalType} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-text-primary">{t.signalType}</td>
                      <td className="py-2 pr-4 text-right font-mono">{t.count}</td>
                      <td className={`py-2 pr-4 text-right font-mono ${t.accuracy >= 0.6 ? "text-bullish" : t.accuracy >= 0.4 ? "text-warning" : "text-bearish"}`}>
                        {(t.accuracy * 100).toFixed(0)}%
                      </td>
                      <td className={`py-2 text-right font-mono ${t.avgReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {(t.avgReturn * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </TabPanel>

      <TabPanel active={activeTab === "time"}>
        {analytics && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="p-0 pb-3"><CardTitle>By Day of Week</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-left">
                      <th className="pb-2 pr-4 font-medium">Day</th>
                      <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                      <th className="pb-2 pr-4 font-medium text-right">Win Rate</th>
                      <th className="pb-2 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((d) => {
                      const data = analytics.byDay[d];
                      const wr = data.count > 0 ? data.wins / data.count : 0;
                      return (
                        <tr key={d} className="border-b border-border/50">
                          <td className="py-2 pr-4 text-text-primary">{DAYS[d]}</td>
                          <td className="py-2 pr-4 text-right font-mono">{data.count}</td>
                          <td className={`py-2 pr-4 text-right font-mono ${wr >= 0.5 ? "text-bullish" : "text-bearish"}`}>
                            {data.count > 0 ? `${(wr * 100).toFixed(0)}%` : "--"}
                          </td>
                          <td className={`py-2 text-right font-mono ${data.pnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                            {data.count > 0 ? `$${data.pnl.toFixed(0)}` : "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader className="p-0 pb-3"><CardTitle>By Hour</CardTitle></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-muted text-left">
                      <th className="pb-2 pr-4 font-medium">Hour</th>
                      <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                      <th className="pb-2 font-medium text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analytics.byHour)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([hour, data]) => {
                        const wr = data.count > 0 ? data.wins / data.count : 0;
                        return (
                          <tr key={hour} className="border-b border-border/50">
                            <td className="py-2 pr-4 text-text-primary font-mono">{String(hour).padStart(2, "0")}:00</td>
                            <td className="py-2 pr-4 text-right font-mono">{data.count}</td>
                            <td className={`py-2 text-right font-mono ${wr >= 0.5 ? "text-bullish" : "text-bearish"}`}>
                              {(wr * 100).toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </TabPanel>

      <TabPanel active={activeTab === "symbol"}>
        {perf && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Symbol</th>
                    <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                    <th className="pb-2 pr-4 font-medium text-right">Win Rate</th>
                    <th className="pb-2 font-medium text-right">Avg Return</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.bySymbol.map((s) => (
                    <tr key={s.symbol} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono font-medium text-text-primary">{s.symbol}</td>
                      <td className="py-2 pr-4 text-right font-mono">{s.count}</td>
                      <td className={`py-2 pr-4 text-right font-mono ${s.accuracy >= 0.5 ? "text-bullish" : "text-bearish"}`}>
                        {(s.accuracy * 100).toFixed(0)}%
                      </td>
                      <td className={`py-2 text-right font-mono ${s.avgReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {(s.avgReturn * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </TabPanel>
    </div>
  );
}
