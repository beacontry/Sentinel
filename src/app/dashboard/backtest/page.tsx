"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { FlaskConical, TrendingUp, TrendingDown, Target, BarChart3, Save, FolderOpen, X, Trash2, Shield, Zap } from "lucide-react";
import type { BacktestResult } from "@/lib/backtester";
import type { SavedStrategy } from "@/types";
import { BacktestChart } from "@/components/dashboard/backtest-chart";
import { STRATEGY_PRESETS, PRESET_LABELS, type PresetName } from "@/lib/strategy-presets";

const EXIT_REASON_LABELS: Record<string, { label: string; color: string }> = {
  stop_loss: { label: "Stop Loss", color: "text-bearish" },
  trailing_stop: { label: "Trail Stop", color: "text-warning" },
  take_profit: { label: "Take Profit", color: "text-bullish" },
  sell_signal: { label: "Sell Signal", color: "text-accent" },
  hold_expired: { label: "Hold Expired", color: "text-text-secondary" },
  end_of_data: { label: "End of Data", color: "text-text-muted" },
};

// Only presets that are runnable by the live engine (EngineMode in trading-engine.ts).
const ENGINE_PRESET_KEYS: PresetName[] = [
  "conservative", "moderate", "aggressive", "optimized",
  "intraday", "tactical", "tactical-smart",
];

const BASE_PRESET_OPTIONS = [
  { value: "custom", label: "Custom" },
  ...ENGINE_PRESET_KEYS.map((key) => ({
    value: key,
    label: `${PRESET_LABELS[key].label} — ${PRESET_LABELS[key].description}`,
  })),
  { value: "auto", label: "Auto (ATR-tuned)" },
];

export default function BacktestPage() {
  const [symbol, setSymbol] = useState("");
  const [days, setDays] = useState(90);
  const [rangeMode, setRangeMode] = useState<"days" | "range">("days");
  // Default range: prior calendar year
  const defaultRange = (() => {
    const now = new Date();
    const yr = now.getUTCFullYear() - 1;
    return { start: `${yr}-01-01`, end: `${yr}-12-31` };
  })();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [holdPeriod, setHoldPeriod] = useState(20);
  const [stopLoss, setStopLoss] = useState(2);
  const [takeProfit, setTakeProfit] = useState(3);
  const [trailingStop, setTrailingStop] = useState(1.5);
  const [preset, setPreset] = useState("custom");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategySource, setStrategySource] = useState<string | null>(null);
  const [atrLoading, setAtrLoading] = useState(false);

  // Strategy save/load state
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showLoadList, setShowLoadList] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const symbolDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Symbol strategy assignments (from Strategies page)
  const [symbolAssignments, setSymbolAssignments] = useState<{ id: string; symbol: string; presetName: string | null; stopLossPct: number; takeProfitPct: number; trailingStopPct: number; holdPeriod: number }[]>([]);

  // Build dynamic preset options from saved strategies + assignments
  const presetOptions = [
    ...BASE_PRESET_OPTIONS,
    ...((strategies.length > 0 || symbolAssignments.length > 0)
      ? [
          { value: "_divider", label: "" },
          ...strategies.map((s) => ({
            value: `saved:${s.id}`,
            label: `${s.name} (${s.config.symbol})`,
          })),
          ...symbolAssignments.map((a) => ({
            value: `assign:${a.id}`,
            label: `${a.symbol} ${a.presetName ? `(${a.presetName})` : "(custom)"}`,
          })),
        ]
      : []),
  ];

  const loadStrategies = useCallback(async () => {
    try {
      const [stratRes, assignRes] = await Promise.all([
        fetch("/api/strategies"),
        fetch("/api/symbol-strategies"),
      ]);
      if (stratRes.ok) {
        const data = await stratRes.json();
        setStrategies(data.strategies ?? []);
      }
      if (assignRes.ok) {
        const data = await assignRes.json();
        setSymbolAssignments(data.strategies ?? []);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  // Auto-load symbol strategy on symbol change
  function handleSymbolChange(value: string) {
    const upper = value.toUpperCase();
    setSymbol(upper);
    setStrategySource(null);

    if (symbolDebounceRef.current) clearTimeout(symbolDebounceRef.current);
    if (upper.length < 1 || upper.length > 10) return;

    symbolDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/strategy-params/${encodeURIComponent(upper)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.params) {
          setStopLoss(parseFloat((data.params.stopLossPct * 100).toFixed(1)));
          setTakeProfit(parseFloat((data.params.takeProfitPct * 100).toFixed(1)));
          setTrailingStop(parseFloat((data.params.trailingStopPct * 100).toFixed(1)));
          setHoldPeriod(data.params.holdPeriod);
          setStrategySource(data.source);
          if (data.presetName) setPreset(data.presetName);
        }
      } catch {
        // Silent — use current values
      }
    }, 600);
  }

  function handlePresetChange(value: string) {
    if (value === "_divider") return;
    setPreset(value);
    setStrategySource(null);
    if (value === "auto") {
      handleAutoTune();
      return;
    }
    // Load from saved strategy
    if (value.startsWith("saved:")) {
      const id = value.slice(6);
      const s = strategies.find((st) => st.id === id);
      if (s) {
        setSymbol(s.config.symbol);
        setDays(s.config.days);
        setHoldPeriod(s.config.holdPeriod);
        if (s.config.stopLoss != null) setStopLoss(s.config.stopLoss);
        if (s.config.takeProfit != null) setTakeProfit(s.config.takeProfit);
        if (s.config.trailingStop != null) setTrailingStop(s.config.trailingStop);
        setStrategySource(`Loaded from "${s.name}"`);
        setResult(null);
      }
      return;
    }
    // Load from symbol assignment
    if (value.startsWith("assign:")) {
      const id = value.slice(7);
      const a = symbolAssignments.find((sa) => sa.id === id);
      if (a) {
        setSymbol(a.symbol);
        setStopLoss(parseFloat((a.stopLossPct * 100).toFixed(1)));
        setTakeProfit(parseFloat((a.takeProfitPct * 100).toFixed(1)));
        setTrailingStop(parseFloat((a.trailingStopPct * 100).toFixed(1)));
        setHoldPeriod(a.holdPeriod);
        setStrategySource(`Loaded from ${a.symbol} assignment`);
        setResult(null);
      }
      return;
    }
    if (value && value in STRATEGY_PRESETS) {
      const p = STRATEGY_PRESETS[value as PresetName];
      setStopLoss(parseFloat((p.stopLossPct * 100).toFixed(1)));
      setTakeProfit(parseFloat((p.takeProfitPct * 100).toFixed(1)));
      setTrailingStop(parseFloat((p.trailingStopPct * 100).toFixed(1)));
      setHoldPeriod(p.holdPeriod);
    }
  }

  async function handleAutoTune() {
    if (!symbol.trim()) {
      setError("Enter a symbol first to auto-tune");
      return;
    }
    setAtrLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy-params/${encodeURIComponent(symbol)}?mode=auto`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "ATR computation failed");
        return;
      }
      const data = await res.json();
      setStopLoss(parseFloat((data.params.stopLossPct * 100).toFixed(1)));
      setTakeProfit(parseFloat((data.params.takeProfitPct * 100).toFixed(1)));
      setTrailingStop(parseFloat((data.params.trailingStopPct * 100).toFixed(1)));
      setHoldPeriod(data.params.holdPeriod);
      setStrategySource(`ATR: $${data.atr.toFixed(2)} (${(data.atrPct * 100).toFixed(1)}% of price)`);
    } catch {
      setError("ATR computation failed");
    } finally {
      setAtrLoading(false);
    }
  }

  async function handleRun() {
    if (!symbol.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        holdPeriod: String(holdPeriod),
        stopLoss: String(stopLoss / 100),
        takeProfit: String(takeProfit / 100),
        trailingStop: String(trailingStop / 100),
      });
      if (rangeMode === "range") {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.set("days", String(days));
      }
      const res = await fetch(
        `/api/backtest/${encodeURIComponent(symbol.toUpperCase())}?${params}`
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Backtest failed");
        return;
      }
      setResult(await res.json());
    } catch {
      setError("Backtest failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveStrategy() {
    if (!saveName.trim() || !symbol.trim()) {
      setSaveError("Name and symbol are required");
      return;
    }
    setSaveLoading(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          description: saveDesc || undefined,
          config: {
            symbol: symbol.toUpperCase(),
            days,
            holdPeriod,
            stopLoss,
            takeProfit,
            trailingStop,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Save failed");
        return;
      }
      const data = await res.json();
      if (result && data.strategy) {
        await fetch("/api/strategies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: data.strategy.id,
            lastRunAt: new Date().toISOString(),
            lastResult: result,
          }),
        });
      }
      setShowSaveForm(false);
      setSaveName("");
      setSaveDesc("");
      await loadStrategies();
    } catch {
      setSaveError("Save failed");
    } finally {
      setSaveLoading(false);
    }
  }

  function handleLoadStrategy(strategy: SavedStrategy) {
    const config = strategy.config;
    setSymbol(config.symbol);
    setDays(config.days);
    setHoldPeriod(config.holdPeriod);
    if (config.stopLoss != null) setStopLoss(config.stopLoss);
    if (config.takeProfit != null) setTakeProfit(config.takeProfit);
    if (config.trailingStop != null) setTrailingStop(config.trailingStop);
    setShowLoadList(false);
    setResult(null);
    setStrategySource(null);
  }

  async function handleDeleteStrategy(id: string) {
    try {
      await fetch("/api/strategies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadStrategies();
    } catch {
      // Silent
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Strategy Lab"
        title="Backtest"
        description="Pressure-test a strategy, refine the exits, and keep the strongest parameter sets close to the desk."
        stats={[
          { label: "Saved Playbooks", value: strategies.length },
          { label: "Current Symbol", value: symbol || "None", tone: symbol ? "brand" : "neutral" },
          { label: "Preset", value: preset === "custom" ? "Custom" : preset, tone: preset !== "custom" ? "brand" : "neutral" },
          { label: "Mode", value: result ? "Results Loaded" : "Ready", tone: result ? "bullish" : "neutral" },
        ]}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 ">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setShowLoadList(!showLoadList); setShowSaveForm(false); }}
          >
            <FolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Load</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => { setShowSaveForm(!showSaveForm); setShowLoadList(false); }}
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/* Save Strategy Form */}
      {showSaveForm && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Save Strategy</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSaveForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              label="Strategy Name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="My AAPL Strategy"
            />
            <Input
              label="Description (optional)"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
              placeholder="90-day with 20-bar hold"
            />
            <div className="flex items-end">
              <Button onClick={handleSaveStrategy} loading={saveLoading}>
                Save
              </Button>
            </div>
          </div>
          {!symbol.trim() && (
            <p className="mt-2 text-sm text-text-muted">
              Enter a symbol in the backtest config before saving.
            </p>
          )}
          {saveError && (
            <p className="mt-2 text-sm text-bearish">{saveError}</p>
          )}
        </Card>
      )}

      {/* Load Strategy List */}
      {showLoadList && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Saved Strategies ({strategies.length})</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowLoadList(false)}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          {strategies.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">
              No saved strategies yet
            </p>
          ) : (
            <div className="space-y-2">
              {strategies.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg
                    bg-bg-elevated border border-border hover:border-border-hover transition-colors"
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => handleLoadStrategy(s)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-text-primary">{s.name}</span>
                      <Badge>{s.config.symbol}</Badge>
                      <span className="text-xs text-text-muted">
                        {s.config.days}d / {s.config.holdPeriod}bar
                      </span>
                    </div>
                    {s.description && (
                      <p className="text-xs text-text-secondary mt-0.5">{s.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadStrategy(s)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteStrategy(s.id)}
                      className="text-text-muted hover:text-bearish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Controls */}
      <Card>
        <div className="flex flex-col gap-4">
          {/* Row 1: Symbol, Range mode + window, Hold Period, Run */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              label="Symbol"
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              placeholder="AAPL"
            />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">Window</span>
              <div className="inline-flex rounded-lg border border-border bg-bg-secondary p-0.5">
                <button
                  type="button"
                  onClick={() => setRangeMode("days")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${rangeMode === "days" ? "bg-bg-elevated text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                >
                  Last N days
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("range")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${rangeMode === "range" ? "bg-bg-elevated text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                >
                  Date range
                </button>
              </div>
            </div>
            {rangeMode === "days" ? (
              <Input
                label="Days"
                type="number"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                placeholder="90"
              />
            ) : (
              <>
                <Input
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </>
            )}
            <Input
              label="Hold Period (bars)"
              type="number"
              value={holdPeriod}
              onChange={(e) => { setHoldPeriod(Number(e.target.value)); setPreset("custom"); }}
              placeholder="20"
            />
            <div className="flex items-end">
              <Button onClick={handleRun} loading={loading}>
                <FlaskConical className="w-4 h-4" />
                Run Backtest
              </Button>
            </div>
          </div>
          {/* Row 2: Preset + Risk parameters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <Select
              label="Strategy Preset"
              options={presetOptions}
              value={preset}
              onChange={(value) => handlePresetChange(value)}
            />
            <div className="flex items-center gap-1.5 text-xs text-text-muted self-center sm:self-end pb-2">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <Input
              label="Stop Loss %"
              type="number"
              value={stopLoss}
              onChange={(e) => { setStopLoss(Number(e.target.value)); setPreset("custom"); }}
              step={0.5}
              min={0.5}
              max={20}
            />
            <Input
              label="Trail Stop %"
              type="number"
              value={trailingStop}
              onChange={(e) => { setTrailingStop(Number(e.target.value)); setPreset("custom"); }}
              step={0.5}
              min={0.5}
              max={20}
            />
            <Input
              label="Take Profit %"
              type="number"
              value={takeProfit}
              onChange={(e) => { setTakeProfit(Number(e.target.value)); setPreset("custom"); }}
              step={0.5}
              min={0.5}
              max={50}
            />
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleAutoTune}
                loading={atrLoading}
                disabled={!symbol.trim()}
              >
                <Zap className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Source indicator */}
          {strategySource && (
            <p className="text-xs text-text-muted">
              {strategySource === "assignment" ? "Loaded from symbol assignment" :
               strategySource === "risk_profile" ? "Derived from your risk profile + ATR" :
               strategySource === "default" ? "Using default (moderate)" :
               strategySource}
            </p>
          )}
        </div>
        {error && (
          <p className="mt-3 text-sm text-bearish">{error}</p>
        )}
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Total Return"
              value={`${result.totalReturn >= 0 ? "+" : ""}${result.totalReturn.toFixed(1)}%`}
              color={result.totalReturn >= 0 ? "text-bullish" : "text-bearish"}
              icon={result.totalReturn >= 0 ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Win Rate"
              value={`${Math.round(result.winRate * 100)}%`}
              color={result.winRate >= 0.5 ? "text-bullish" : "text-bearish"}
              icon={Target}
            />
            <StatCard
              label="Trades"
              value={result.totalTrades.toString()}
              color="text-accent"
              icon={BarChart3}
            />
            <StatCard
              label="Wins / Losses"
              value={`${result.winCount} / ${result.lossCount}`}
              color="text-text-primary"
              icon={Target}
            />
            <StatCard
              label="Max Drawdown"
              value={`-${result.maxDrawdown.toFixed(1)}%`}
              color="text-bearish"
              icon={TrendingDown}
            />
            <StatCard
              label="Sharpe Ratio"
              value={result.sharpeRatio.toFixed(2)}
              color={result.sharpeRatio > 1 ? "text-bullish" : "text-warning"}
              icon={BarChart3}
            />
          </div>

          {/* Equity Curve */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Equity Curve</CardTitle>
            </CardHeader>
            <BacktestChart equityCurve={result.equityCurve} />
          </Card>

          {/* Trade Table */}
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Trade History ({result.trades.length})</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Signal</th>
                    <th className="pb-2 pr-4 font-medium text-right">Shares</th>
                    <th className="pb-2 pr-4 font-medium text-right">Entry</th>
                    <th className="pb-2 pr-4 font-medium text-right">Exit</th>
                    <th className="pb-2 pr-4 font-medium">Exit Reason</th>
                    <th className="pb-2 font-medium text-right">Return</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.trades.map((trade, i) => {
                    const reason = EXIT_REASON_LABELS[trade.exitReason] ?? {
                      label: trade.exitReason,
                      color: "text-text-muted",
                    };
                    return (
                      <tr
                        key={i}
                        className="border-b border-border hover:bg-bg-elevated transition-colors"
                      >
                        <td className="py-2 pr-4 text-text-secondary">
                          {new Date(trade.entryDate).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={
                              trade.signal.includes("BUY") ? "bullish" : "bearish"
                            }
                          >
                            {trade.signal}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right text-text-secondary">
                          {trade.shares}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          ${trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          ${trade.exitPrice.toFixed(2)}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs font-sans ${reason.color}`}>
                            {reason.label}
                          </span>
                        </td>
                        <td
                          className={`py-2 text-right ${trade.returnPct >= 0 ? "text-bullish" : "text-bearish"}`}
                        >
                          {trade.returnPct >= 0 ? "+" : ""}
                          {trade.returnPct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Save prompt after results */}
          {!showSaveForm && (
            <div className="flex items-center justify-center gap-3 py-2">
              <span className="text-sm text-text-muted">Like this config?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowSaveForm(true); setShowLoadList(false); }}
              >
                <Save className="w-3.5 h-3.5" />
                Save Strategy
              </Button>
            </div>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <FlaskConical className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            Run a backtest
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Enter a symbol to auto-load its strategy, or pick a preset.
            Uses the same risk rules as the live trader.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className={`text-lg font-display font-bold ${color}`}>{value}</p>
    </Card>
  );
}
