"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Plus, X, Play, FlaskConical } from "lucide-react";

interface StrategyRule {
  id: string;
  indicator: string;
  condition: string;
  value: number;
}

interface BacktestResult {
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  trades: { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; pnl: number; pnlPct: number }[];
}

const INDICATORS: Record<string, { label: string; conditions: { value: string; label: string }[]; hasValue: boolean; defaultValue: number }> = {
  RSI: { label: "RSI (14)", conditions: [{ value: "crosses_below", label: "Crosses Below" }, { value: "crosses_above", label: "Crosses Above" }], hasValue: true, defaultValue: 30 },
  EMA_CROSS: { label: "EMA Crossover", conditions: [{ value: "fast_above_slow", label: "Fast Crosses Above Slow" }, { value: "fast_below_slow", label: "Fast Crosses Below Slow" }], hasValue: false, defaultValue: 0 },
  MACD_CROSS: { label: "MACD", conditions: [{ value: "histogram_positive", label: "Histogram Turns Positive" }, { value: "histogram_negative", label: "Histogram Turns Negative" }], hasValue: false, defaultValue: 0 },
  PRICE_VS_SMA: { label: "Price vs SMA", conditions: [{ value: "above_sma50", label: "Price Above SMA 50" }, { value: "below_sma50", label: "Price Below SMA 50" }, { value: "above_sma200", label: "Price Above SMA 200" }, { value: "below_sma200", label: "Price Below SMA 200" }], hasValue: false, defaultValue: 0 },
  VOLUME_SPIKE: { label: "Volume Spike", conditions: [{ value: "above_avg", label: "Volume Above Average" }], hasValue: true, defaultValue: 2.0 },
  BOLLINGER: { label: "Bollinger Bands", conditions: [{ value: "touches_lower", label: "Price Touches Lower Band" }, { value: "touches_upper", label: "Price Touches Upper Band" }], hasValue: false, defaultValue: 0 },
};

function uid() {
  return crypto.randomUUID();
}

export default function StrategyBuilderPage() {
  const [name, setName] = useState("RSI Reversal");
  const [symbol, setSymbol] = useState("AAPL");
  const [entryRules, setEntryRules] = useState<StrategyRule[]>([
    { id: uid(), indicator: "RSI", condition: "crosses_below", value: 30 },
  ]);
  const [exitRules, setExitRules] = useState<StrategyRule[]>([
    { id: uid(), indicator: "RSI", condition: "crosses_above", value: 70 },
  ]);
  const [stopLoss, setStopLoss] = useState(5);
  const [takeProfit, setTakeProfit] = useState(10);
  const [holdPeriod, setHoldPeriod] = useState(14);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRule(type: "entry" | "exit") {
    const rule: StrategyRule = { id: uid(), indicator: "RSI", condition: "crosses_below", value: 30 };
    if (type === "entry") setEntryRules([...entryRules, rule]);
    else setExitRules([...exitRules, rule]);
  }

  function removeRule(type: "entry" | "exit", id: string) {
    if (type === "entry") setEntryRules(entryRules.filter((r) => r.id !== id));
    else setExitRules(exitRules.filter((r) => r.id !== id));
  }

  function updateRule(type: "entry" | "exit", id: string, field: string, value: string | number) {
    const update = (rules: StrategyRule[]) =>
      rules.map((r) => {
        if (r.id !== id) return r;
        if (field === "indicator") {
          const ind = INDICATORS[value as string];
          return { ...r, indicator: value as string, condition: ind.conditions[0].value, value: ind.defaultValue };
        }
        return { ...r, [field]: value };
      });
    if (type === "entry") setEntryRules(update(entryRules));
    else setExitRules(update(exitRules));
  }

  async function runBacktest() {
    if (!symbol.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          days: 365,
          holdPeriod,
          stopLoss: stopLoss / 100,
          takeProfit: takeProfit / 100,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Backtest failed");
        return;
      }
      const data = await res.json();
      setResult({
        totalReturn: data.totalReturn ?? data.totalReturnPct ?? 0,
        winRate: data.winRate ?? 0,
        maxDrawdown: data.maxDrawdown ?? 0,
        sharpeRatio: data.sharpeRatio ?? 0,
        totalTrades: data.totalTrades ?? data.trades?.length ?? 0,
        trades: (data.trades ?? []).slice(0, 20),
      });
    } catch {
      setError("Backtest request failed");
    } finally {
      setLoading(false);
    }
  }

  function RuleBuilder({ rules, type }: { rules: StrategyRule[]; type: "entry" | "exit" }) {
    return (
      <div className="space-y-2">
        {rules.map((rule) => {
          const ind = INDICATORS[rule.indicator];
          return (
            <div key={rule.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 rounded-lg bg-bg-surface border border-border/50">
              <select
                value={rule.indicator}
                onChange={(e) => updateRule(type, rule.id, "indicator", e.target.value)}
                className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary min-h-[36px]"
              >
                {Object.entries(INDICATORS).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <select
                value={rule.condition}
                onChange={(e) => updateRule(type, rule.id, "condition", e.target.value)}
                className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary min-h-[36px]"
              >
                {ind?.conditions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {ind?.hasValue && (
                <input
                  type="number"
                  value={rule.value}
                  onChange={(e) => updateRule(type, rule.id, "value", parseFloat(e.target.value) || 0)}
                  className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary font-mono w-20 min-h-[36px]"
                />
              )}
              <button onClick={() => removeRule(type, rule.id)} className="p-1 text-text-muted hover:text-bearish transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        <Button variant="ghost" size="sm" onClick={() => addRule(type)}>
          <Plus className="w-3.5 h-3.5" /> Add Rule
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Strategy Lab"
        title="Strategy Builder"
        description="Compose entry and exit rules visually from available indicators, then backtest your strategy."
        stats={[
          { label: "Entry Rules", value: String(entryRules.length) },
          { label: "Exit Rules", value: String(exitRules.length) },
          { label: "Stop Loss", value: `${stopLoss}%` },
          { label: "Take Profit", value: `${takeProfit}%` },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Builder */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-text-muted" />
                Strategy Config
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Strategy Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" />
            </div>
          </Card>

          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Entry Rules</CardTitle>
            </CardHeader>
            <RuleBuilder rules={entryRules} type="entry" />
          </Card>

          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Exit Rules</CardTitle>
            </CardHeader>
            <RuleBuilder rules={exitRules} type="exit" />
          </Card>

          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Risk Management</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Stop Loss %" type="number" value={String(stopLoss)} onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)} />
              <Input label="Take Profit %" type="number" value={String(takeProfit)} onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)} />
              <Input label="Max Hold (days)" type="number" value={String(holdPeriod)} onChange={(e) => setHoldPeriod(parseInt(e.target.value) || 14)} />
            </div>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          <Button onClick={runBacktest} loading={loading} className="w-full">
            <Play className="w-4 h-4" />
            Run Backtest on {symbol || "..."}
          </Button>

          {error && (
            <Card className="border border-bearish/20 bg-bearish/5">
              <p className="text-sm text-bearish">{error}</p>
            </Card>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Return", value: `${result.totalReturn >= 0 ? "+" : ""}${(result.totalReturn * 100).toFixed(1)}%`, tone: result.totalReturn >= 0 ? "text-bullish" : "text-bearish" },
                  { label: "Win Rate", value: `${(result.winRate * 100).toFixed(0)}%`, tone: result.winRate >= 0.5 ? "text-bullish" : "text-bearish" },
                  { label: "Max Drawdown", value: `${(result.maxDrawdown * 100).toFixed(1)}%`, tone: "text-bearish" },
                  { label: "Total Trades", value: String(result.totalTrades), tone: "text-text-primary" },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">{stat.label}</div>
                    <div className={`mt-1 text-xl font-mono font-semibold ${stat.tone}`}>{stat.value}</div>
                  </Card>
                ))}
              </div>

              {result.trades.length > 0 && (
                <Card>
                  <CardHeader className="p-0 pb-3">
                    <CardTitle>Trade Log</CardTitle>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-text-muted text-left">
                          <th className="pb-2 pr-3 font-medium">Entry</th>
                          <th className="pb-2 pr-3 font-medium">Exit</th>
                          <th className="pb-2 pr-3 font-medium text-right">In</th>
                          <th className="pb-2 pr-3 font-medium text-right">Out</th>
                          <th className="pb-2 font-medium text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-1.5 pr-3 font-mono text-xs text-text-secondary">{t.entryDate?.slice(0, 10)}</td>
                            <td className="py-1.5 pr-3 font-mono text-xs text-text-secondary">{t.exitDate?.slice(0, 10)}</td>
                            <td className="py-1.5 pr-3 text-right font-mono text-xs">${t.entryPrice?.toFixed(2)}</td>
                            <td className="py-1.5 pr-3 text-right font-mono text-xs">${t.exitPrice?.toFixed(2)}</td>
                            <td className={`py-1.5 text-right font-mono text-xs font-medium ${(t.pnlPct ?? t.pnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                              {((t.pnlPct ?? t.pnl ?? 0) * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}

          {!result && !error && (
            <Card>
              <div className="text-center py-8">
                <FlaskConical className="w-10 h-10 mx-auto text-text-muted mb-3" />
                <p className="text-sm text-text-secondary">Configure your strategy and run a backtest to see results.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
