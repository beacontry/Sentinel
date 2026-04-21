"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

// ── Types ───────────────────────────────────────────────────────────

interface OptimizationRun {
  id: string;
  status: string;
  universe: string;
  populationSize: number;
  generations: number;
  trainPct: number;
  currentGeneration: number;
  totalSymbols: number;
  symbolsFetched: number;
  bestParams: Record<string, number> | null;
  bestTrainReturn: number | null;
  bestTestReturn: number | null;
  baselineTrainReturn: number | null;
  baselineTestReturn: number | null;
  trainSharpe: number | null;
  testSharpe: number | null;
  trainMaxDrawdown: number | null;
  testMaxDrawdown: number | null;
  bestFitness?: number;
  liveParams?: Record<string, number>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  error: string | null;
}

interface Generation {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
  bestParams: Record<string, number>;
}

interface SymbolResult {
  symbol: string;
  totalReturn: number;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  tradeCount: number | null;
  trainReturn: number | null;
  testReturn: number | null;
}

interface RunDetail {
  run: OptimizationRun;
  generations: Generation[];
  symbolResults: SymbolResult[];
}

// ── Component ───────────────────────────────────────────────────────

export default function OptimizerPage() {
  const [runs, setRuns] = useState<OptimizationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [symbolSort, setSymbolSort] = useState<"return" | "sharpe" | "drawdown">("return");
  const [symbolOrder, setSymbolOrder] = useState<"desc" | "asc">("desc");
  const [showAllSymbols, setShowAllSymbols] = useState(false);

  // Mode comparison
  const [comparison, setComparison] = useState<{ mode: string; label: string; totalReturn: number; finalValue: number; maxDrawdown: number; sharpe: number; trades: number; timeInMarket: number }[] | null>(null);
  const [comparingModes, setComparingModes] = useState(false);

  // Config form
  const [popSize, setPopSize] = useState(30);
  const [gens, setGens] = useState(25);
  const [trainPct, setTrainPct] = useState(60);
  const [universe, setUniverse] = useState<"top50" | "sp500">("top50");

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/optimize");
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs);
    } catch {
      // Silently fail — will retry on next poll
    }
  }, []);

  const fetchRunDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/optimize/${id}`);
      if (!res.ok) return;
      const data: RunDetail = await res.json();
      setSelectedRun(data);
    } catch {
      // Silently fail
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRuns().then(() => setLoading(false));
  }, [fetchRuns]);

  // Poll active runs
  useEffect(() => {
    const hasActive = runs.some((r) =>
      ["pending", "fetching_data", "optimizing"].includes(r.status)
    );
    if (!hasActive) return;

    const interval = setInterval(() => {
      fetchRuns();
      if (selectedRun && ["pending", "fetching_data", "optimizing"].includes(selectedRun.run.status)) {
        fetchRunDetail(selectedRun.run.id);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runs, selectedRun, fetchRuns, fetchRunDetail]);

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          populationSize: popSize,
          generations: gens,
          trainPct,
          universe,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to start");
        return;
      }
      const data = await res.json();
      setShowConfig(false);
      await fetchRuns();
      fetchRunDetail(data.runId);
    } finally {
      setStarting(false);
    }
  }

  function selectRun(run: OptimizationRun) {
    fetchRunDetail(run.id);
  }

  const activeRun = runs.find((r) =>
    ["pending", "fetching_data", "optimizing"].includes(r.status)
  );

  // Sort symbol results
  const sortedSymbols = selectedRun?.symbolResults
    ? [...selectedRun.symbolResults].sort((a, b) => {
        const mult = symbolOrder === "desc" ? -1 : 1;
        switch (symbolSort) {
          case "return":
            return mult * (a.totalReturn - b.totalReturn);
          case "sharpe":
            return mult * ((a.sharpeRatio ?? 0) - (b.sharpeRatio ?? 0));
          case "drawdown":
            return mult * ((a.maxDrawdown ?? 0) - (b.maxDrawdown ?? 0));
          default:
            return 0;
        }
      })
    : [];

  const displayedSymbols = showAllSymbols ? sortedSymbols : sortedSymbols.slice(0, 50);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategy Optimizer</h1>
          <p className="text-sm text-text-secondary">
            Genetic algorithm optimization across the S&P 500
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRuns()}
            className="min-h-[44px]"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => setShowConfig(!showConfig)}
            disabled={!!activeRun}
            className="min-h-[44px]"
          >
            <Play className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">New</span> Run
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              setComparingModes(true);
              try {
                const res = await fetch("/api/optimize/compare");
                if (res.ok) {
                  const data = await res.json();
                  setComparison(data.results);
                }
              } finally {
                setComparingModes(false);
              }
            }}
            disabled={comparingModes}
            className="min-h-[44px]"
          >
            {comparingModes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            <span className="hidden sm:inline">Compare</span> Modes
          </Button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <Card>
          <div className="p-4 space-y-4">
            <h3 className="text-sm font-semibold">Optimization Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted block mb-1">
                  Population Size
                </label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={popSize}
                  onChange={(e) => setPopSize(Number(e.target.value))}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono min-h-[44px]"
                />
                <p className="text-[11px] text-text-muted mt-1">Strategies per generation</p>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted block mb-1">
                  Generations
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={gens}
                  onChange={(e) => setGens(Number(e.target.value))}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono min-h-[44px]"
                />
                <p className="text-[11px] text-text-muted mt-1">Evolution iterations</p>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted block mb-1">
                  Train / Test Split
                </label>
                <input
                  type="number"
                  min={40}
                  max={80}
                  value={trainPct}
                  onChange={(e) => setTrainPct(Number(e.target.value))}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono min-h-[44px]"
                />
                <p className="text-[11px] text-text-muted mt-1">{trainPct}% train / {100 - trainPct}% test</p>
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted block mb-1">
                  Universe
                </label>
                <select
                  value={universe}
                  onChange={(e) => setUniverse(e.target.value as "top50" | "sp500")}
                  className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm min-h-[44px]"
                >
                  <option value="top50">Top 50 (~3 min)</option>
                  <option value="sp500">Full S&P 500 (~30 min)</option>
                </select>
                <p className="text-[11px] text-text-muted mt-1">{universe === "sp500" ? "~495 stocks" : "50 most liquid"}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowConfig(false)} className="min-h-[44px]">
                Cancel
              </Button>
              <Button onClick={handleStart} loading={starting} className="min-h-[44px]">
                <Zap className="h-4 w-4 mr-2" />
                Start Optimization
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Mode Comparison Results */}
      {comparison && (
        <Card>
          <CardHeader>
            <CardTitle>Mode Comparison — $10,000 over 5 Years</CardTitle>
          </CardHeader>
          <div className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Mode</th>
                    <th className="pb-2 pr-4 font-medium text-right">Return</th>
                    <th className="pb-2 pr-4 font-medium text-right">Final Value</th>
                    <th className="pb-2 pr-4 font-medium text-right">Max DD</th>
                    <th className="pb-2 pr-4 font-medium text-right">Sharpe</th>
                    <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                    <th className="pb-2 font-medium text-right">Time in Market</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {comparison.map((r) => (
                    <tr key={r.mode} className={`border-b border-border/50 ${r.mode === "spy" ? "bg-bg-elevated" : ""}`}>
                      <td className="py-2 pr-4 font-sans font-medium">
                        {r.label}
                        {r.mode === "spy" && <Badge variant="neutral" className="ml-2">Benchmark</Badge>}
                      </td>
                      <td className={`py-2 pr-4 text-right ${r.totalReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn}%
                      </td>
                      <td className="py-2 pr-4 text-right">${r.finalValue.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right text-bearish">-{r.maxDrawdown}%</td>
                      <td className="py-2 pr-4 text-right text-text-secondary">{r.sharpe}</td>
                      <td className="py-2 pr-4 text-right text-text-secondary">{r.trades}</td>
                      <td className="py-2 text-right text-text-secondary">{r.timeInMarket}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Active Run Progress */}
      {activeRun && (
        <ActiveRunCard
          run={activeRun}
          detail={selectedRun?.run.id === activeRun.id ? selectedRun : null}
          onClick={() => selectRun(activeRun)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run History */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Run History</h2>
          {runs.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-10 w-10" />}
              title="No optimization runs"
              description="Start your first run to optimize strategy parameters across the S&P 500"
            />
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <Card
                  key={run.id}
                  hover
                  className={`cursor-pointer transition-colors ${
                    selectedRun?.run.id === run.id ? "border-accent/50" : ""
                  }`}
                  onClick={() => selectRun(run)}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={run.status} />
                      <span className="text-[11px] text-text-muted">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {run.bestTrainReturn !== null && (
                      <div className="flex items-center gap-3 mt-2">
                        <div>
                          <span className="text-[11px] text-text-muted">Train</span>
                          <p className={`text-sm font-mono ${run.bestTrainReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                            {run.bestTrainReturn.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] text-text-muted">Test</span>
                          <p className={`text-sm font-mono ${(run.bestTestReturn ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                            {run.bestTestReturn?.toFixed(1) ?? "—"}%
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Run Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedRun ? (
            <RunDetailView
              detail={selectedRun}
              sortedSymbols={displayedSymbols}
              totalSymbols={sortedSymbols.length}
              showAllSymbols={showAllSymbols}
              onToggleShowAll={() => setShowAllSymbols(!showAllSymbols)}
              symbolSort={symbolSort}
              symbolOrder={symbolOrder}
              onSortChange={(sort) => {
                if (sort === symbolSort) {
                  setSymbolOrder(symbolOrder === "desc" ? "asc" : "desc");
                } else {
                  setSymbolSort(sort);
                  setSymbolOrder("desc");
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center min-h-[300px] text-text-muted text-sm">
              Select a run to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "complete":
      return <Badge variant="bullish">Complete</Badge>;
    case "failed":
      return <Badge variant="bearish">Failed</Badge>;
    case "optimizing":
      return <Badge variant="warning">Optimizing</Badge>;
    case "fetching_data":
      return <Badge variant="warning">Fetching Data</Badge>;
    default:
      return <Badge variant="neutral">Pending</Badge>;
  }
}

function ActiveRunCard({
  run,
  detail,
  onClick,
}: {
  run: OptimizationRun;
  detail: RunDetail | null;
  onClick: () => void;
}) {
  const isFetching = run.status === "fetching_data";
  const fetchPct =
    run.totalSymbols > 0
      ? Math.round((run.symbolsFetched / run.totalSymbols) * 100)
      : 0;
  const genPct =
    run.generations > 0
      ? Math.round((run.currentGeneration / run.generations) * 100)
      : 0;

  return (
    <Card className="border-accent/30 bg-accent/5 cursor-pointer" onClick={onClick}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            <span className="text-sm font-semibold">
              {isFetching ? "Fetching Market Data" : "Optimizing Strategy"}
            </span>
          </div>
          <StatusBadge status={run.status} />
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          {isFetching ? (
            <>
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>Downloading 5Y daily bars</span>
                <span className="font-mono">{run.symbolsFetched} / {run.totalSymbols}</span>
              </div>
              <div className="h-2 bg-bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${fetchPct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>Generation {run.currentGeneration} / {run.generations}</span>
                {run.bestFitness !== undefined && run.bestFitness > 0 && (
                  <span className="font-mono text-bullish">
                    Best: {run.bestFitness.toFixed(1)}% avg return
                  </span>
                )}
              </div>
              <div className="h-2 bg-bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${genPct}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function RunDetailView({
  detail,
  sortedSymbols,
  totalSymbols,
  showAllSymbols,
  onToggleShowAll,
  symbolSort,
  symbolOrder,
  onSortChange,
}: {
  detail: RunDetail;
  sortedSymbols: SymbolResult[];
  totalSymbols: number;
  showAllSymbols: boolean;
  onToggleShowAll: () => void;
  symbolSort: string;
  symbolOrder: string;
  onSortChange: (sort: "return" | "sharpe" | "drawdown") => void;
}) {
  const { run, generations } = detail;
  const isComplete = run.status === "complete";

  const bestParams = (run.bestParams ?? run.liveParams) as Record<string, number> | null;

  return (
    <div className="space-y-4">
      {/* Stats overview */}
      {isComplete && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Optimized Return"
              value={`${run.bestTrainReturn?.toFixed(1) ?? "—"}%`}
              subtext="Avg across S&P 500 (train)"
              tone={run.bestTrainReturn && run.bestTrainReturn > 0 ? "positive" : "negative"}
              icon={TrendingUp}
            />
            <StatCard
              label="Test Return"
              value={`${run.bestTestReturn?.toFixed(1) ?? "—"}%`}
              subtext="Out-of-sample validation"
              tone={run.bestTestReturn && run.bestTestReturn > 0 ? "positive" : "negative"}
              icon={Target}
            />
            <StatCard
              label="Baseline Return"
              value={`${run.baselineTrainReturn?.toFixed(1) ?? "—"}%`}
              subtext="Moderate preset (train)"
              tone={run.baselineTrainReturn && run.baselineTrainReturn > 0 ? "positive" : "negative"}
              icon={BarChart3}
            />
            <StatCard
              label="Improvement"
              value={
                run.bestTrainReturn != null && run.baselineTrainReturn != null
                  ? `${(run.bestTrainReturn - run.baselineTrainReturn).toFixed(1)}%`
                  : "—"
              }
              subtext="Over baseline (train)"
              tone={
                run.bestTrainReturn != null && run.baselineTrainReturn != null && run.bestTrainReturn > run.baselineTrainReturn
                  ? "positive"
                  : "negative"
              }
              icon={Zap}
            />
          </div>

          {/* Extra metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Train Sharpe"
              value={run.trainSharpe?.toFixed(2) ?? "—"}
              tone="neutral"
              icon={Activity}
            />
            <StatCard
              label="Test Sharpe"
              value={run.testSharpe?.toFixed(2) ?? "—"}
              tone="neutral"
              icon={Activity}
            />
            <StatCard
              label="Train Max DD"
              value={`${run.trainMaxDrawdown?.toFixed(1) ?? "—"}%`}
              tone="negative"
              icon={TrendingDown}
            />
            <StatCard
              label="Test Max DD"
              value={`${run.testMaxDrawdown?.toFixed(1) ?? "—"}%`}
              tone="negative"
              icon={TrendingDown}
            />
          </div>
        </>
      )}

      {/* Optimized Parameters */}
      {bestParams && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Optimized Parameters</CardTitle>
              {isComplete && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-[36px]"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/optimize/save-preset", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ runId: run.id }),
                      });
                      if (res.ok) {
                        alert("Saved as active Optimized preset. Engine will use these parameters.");
                      } else {
                        const data = await res.json();
                        alert(data.error || "Failed to save");
                      }
                    } catch {
                      alert("Failed to save preset");
                    }
                  }}
                >
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  Save as Optimized
                </Button>
              )}
            </div>
          </CardHeader>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <ParamDisplay label="Stop Loss" value={`${(bestParams.stopLossPct * 100).toFixed(1)}%`} />
              <ParamDisplay label="Take Profit" value={`${(bestParams.takeProfitPct * 100).toFixed(1)}%`} />
              <ParamDisplay label="Trailing Stop" value={`${(bestParams.trailingStopPct * 100).toFixed(1)}%`} />
              <ParamDisplay label="Hold Period" value={`${Math.round(bestParams.holdPeriod)} bars`} />
              {bestParams.positionPct != null && (
                <ParamDisplay label="Position Size" value={`${(bestParams.positionPct * 100).toFixed(0)}%`} />
              )}
              {bestParams.rsiOversold != null && (
                <ParamDisplay label="RSI Oversold" value={`${Math.round(bestParams.rsiOversold)}`} />
              )}
              {bestParams.rsiOverbought != null && (
                <ParamDisplay label="RSI Overbought" value={`${Math.round(bestParams.rsiOverbought)}`} />
              )}
              {bestParams.emaFast != null && (
                <ParamDisplay label="EMA Fast" value={`${Math.round(bestParams.emaFast)}`} />
              )}
              {bestParams.emaSlow != null && (
                <ParamDisplay label="EMA Slow" value={`${Math.round(bestParams.emaSlow)}`} />
              )}
              {bestParams.maxPositions != null && (
                <ParamDisplay label="Max Positions" value={`${Math.round(bestParams.maxPositions)}`} />
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Convergence chart */}
      {generations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convergence</CardTitle>
          </CardHeader>
          <div className="px-4 pb-4">
            <ConvergenceChart generations={generations} />
          </div>
        </Card>
      )}

      {/* Per-symbol results */}
      {sortedSymbols.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Per-Symbol Results ({totalSymbols} symbols)</CardTitle>
            </div>
          </CardHeader>
          <div className="px-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="pb-2 pr-4 font-medium">Symbol</th>
                    <th
                      className="pb-2 pr-4 font-medium text-right cursor-pointer hover:text-text-primary"
                      onClick={() => onSortChange("return")}
                    >
                      Total Return {symbolSort === "return" ? (symbolOrder === "desc" ? "↓" : "↑") : ""}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">Train</th>
                    <th className="pb-2 pr-4 font-medium text-right">Test</th>
                    <th
                      className="pb-2 pr-4 font-medium text-right cursor-pointer hover:text-text-primary"
                      onClick={() => onSortChange("sharpe")}
                    >
                      Sharpe {symbolSort === "sharpe" ? (symbolOrder === "desc" ? "↓" : "↑") : ""}
                    </th>
                    <th
                      className="pb-2 pr-4 font-medium text-right cursor-pointer hover:text-text-primary"
                      onClick={() => onSortChange("drawdown")}
                    >
                      Max DD {symbolSort === "drawdown" ? (symbolOrder === "desc" ? "↓" : "↑") : ""}
                    </th>
                    <th className="pb-2 pr-4 font-medium text-right">Win Rate</th>
                    <th className="pb-2 font-medium text-right">Trades</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {sortedSymbols.map((s) => (
                    <tr key={s.symbol} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-sans font-medium">{s.symbol}</td>
                      <td className={`py-2 pr-4 text-right ${s.totalReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.totalReturn.toFixed(1)}%
                      </td>
                      <td className={`py-2 pr-4 text-right ${(s.trainReturn ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.trainReturn?.toFixed(1) ?? "—"}%
                      </td>
                      <td className={`py-2 pr-4 text-right ${(s.testReturn ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {s.testReturn?.toFixed(1) ?? "—"}%
                      </td>
                      <td className="py-2 pr-4 text-right text-text-secondary">
                        {s.sharpeRatio?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-right text-bearish">
                        {s.maxDrawdown?.toFixed(1) ?? "—"}%
                      </td>
                      <td className="py-2 pr-4 text-right text-text-secondary">
                        {s.winRate != null ? `${(s.winRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2 text-right text-text-secondary">
                        {s.tradeCount ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalSymbols > 50 && (
              <button
                onClick={onToggleShowAll}
                className="mt-3 text-sm text-accent hover:text-accent-hover flex items-center gap-1"
              >
                {showAllSymbols ? (
                  <>
                    <ChevronUp className="h-4 w-4" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" /> Show all {totalSymbols} symbols
                  </>
                )}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Error */}
      {run.error && (
        <Card className="border-bearish/30">
          <div className="p-4">
            <p className="text-sm text-bearish">{run.error}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function ParamDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {label}
      </span>
      <p className="text-lg font-mono font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function ConvergenceChart({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) return null;

  const maxFitness = Math.max(...generations.map((g) => g.bestFitness));
  const minFitness = Math.min(...generations.map((g) => g.worstFitness));
  const range = maxFitness - minFitness || 1;

  const width = 100;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  function x(i: number) {
    return padding.left + (i / Math.max(generations.length - 1, 1)) * chartW;
  }
  function y(val: number) {
    return padding.top + chartH - ((val - minFitness) / range) * chartH;
  }

  const bestLine = generations.map((g, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(g.bestFitness).toFixed(1)}`).join(" ");
  const avgLine = generations.map((g, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(g.avgFitness).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const yPos = padding.top + chartH * (1 - pct);
          const val = minFitness + range * pct;
          return (
            <g key={pct}>
              <line
                x1={padding.left} y1={yPos} x2={width - padding.right} y2={yPos}
                stroke="var(--color-border)" strokeWidth="0.3" strokeDasharray="1,1"
              />
              <text x={padding.left - 2} y={yPos + 1} textAnchor="end" className="fill-text-muted" style={{ fontSize: 3 }}>
                {val.toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Avg line */}
        <path d={avgLine} fill="none" stroke="var(--color-text-muted)" strokeWidth="0.5" opacity={0.5} />

        {/* Best line */}
        <path d={bestLine} fill="none" stroke="var(--color-accent)" strokeWidth="0.8" />

        {/* X-axis label */}
        <text x={width / 2} y={height - 2} textAnchor="middle" className="fill-text-muted" style={{ fontSize: 3 }}>
          Generation
        </text>
      </svg>
      <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px] bg-accent inline-block rounded" /> Best
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-[2px] bg-text-muted inline-block rounded opacity-50" /> Average
        </span>
      </div>
    </div>
  );
}
