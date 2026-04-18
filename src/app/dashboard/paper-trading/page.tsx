"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  FlaskConical,
  Plus,
  Play,
  Trash2,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";

interface PaperConfig {
  id: string;
  name: string;
  strategyConfig: {
    preset: string;
    symbol: string;
    days: number;
  };
  riskConfig: {
    stopLossPct: number;
    takeProfitPct: number;
    trailingStopPct: number;
    holdPeriod: number;
  };
  createdAt: string;
}

interface RunResult {
  totalReturn: number;
  winRate: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

const PRESET_OPTIONS = [
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
  { value: "day_trade", label: "Day Trade" },
  { value: "swing", label: "Swing" },
];

const PRESET_DEFAULTS: Record<string, { stopLoss: number; takeProfit: number; trailing: number; hold: number }> = {
  conservative: { stopLoss: 1.5, takeProfit: 2.0, trailing: 1.0, hold: 30 },
  moderate: { stopLoss: 2.0, takeProfit: 3.0, trailing: 1.5, hold: 20 },
  aggressive: { stopLoss: 3.0, takeProfit: 5.0, trailing: 2.5, hold: 15 },
  day_trade: { stopLoss: 1.0, takeProfit: 1.5, trailing: 0.8, hold: 1 },
  swing: { stopLoss: 2.5, takeProfit: 6.0, trailing: 2.0, hold: 40 },
};

export default function PaperTradingPage() {
  const [configs, setConfigs] = useState<PaperConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [preset, setPreset] = useState("moderate");
  const [stopLoss, setStopLoss] = useState("2.0");
  const [takeProfit, setTakeProfit] = useState("3.0");
  const [trailingStop, setTrailingStop] = useState("1.5");
  const [holdPeriod, setHoldPeriod] = useState("20");

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/paper-trading");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setConfigs(data.configs ?? []);
    } catch {
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Update risk params when preset changes
  useEffect(() => {
    const defaults = PRESET_DEFAULTS[preset];
    if (defaults) {
      setStopLoss(String(defaults.stopLoss));
      setTakeProfit(String(defaults.takeProfit));
      setTrailingStop(String(defaults.trailing));
      setHoldPeriod(String(defaults.hold));
    }
  }, [preset]);

  async function handleCreate() {
    if (!name.trim() || !symbol.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/paper-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          strategyConfig: {
            preset,
            symbol: symbol.toUpperCase().trim(),
            days: 90,
          },
          riskConfig: {
            stopLossPct: Number(stopLoss) / 100,
            takeProfitPct: Number(takeProfit) / 100,
            trailingStopPct: Number(trailingStop) / 100,
            holdPeriod: Number(holdPeriod),
          },
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setName("");
        setSymbol("");
        setPreset("moderate");
        fetchConfigs();
      }
    } catch {
      // Error handled silently
    } finally {
      setCreating(false);
    }
  }

  async function handleRun(configId: string) {
    setRunningId(configId);
    try {
      const res = await fetch(`/api/paper-trading/${configId}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Run failed");
      const data = await res.json();
      setResults((prev) => ({ ...prev, [configId]: data.result }));
    } catch {
      // Error handled silently
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(configId: string) {
    setDeletingId(configId);
    try {
      const res = await fetch(`/api/paper-trading/${configId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfigs((prev) => prev.filter((c) => c.id !== configId));
        const newResults = { ...results };
        delete newResults[configId];
        setResults(newResults);
      }
    } catch {
      // Error handled silently
    } finally {
      setDeletingId(null);
    }
  }

  const completedRuns = Object.keys(results).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.portfolio} />
      <PageIntro
        eyebrow="Simulation Lab"
        title="Paper Trading"
        description="Stage strategy presets, run controlled test loops, and compare their risk profile before the bot ever touches capital."
        actions={(
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New</span> Configuration
          </Button>
        )}
        stats={[
          { label: "Configs", value: loading ? "Syncing" : configs.length, tone: "brand" },
          { label: "Completed tests", value: completedRuns },
          { label: "Test window", value: "90 days" },
        ]}
      />

      {/* Config List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" rounded="lg" />
          ))}
        </div>
      ) : configs.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="w-12 h-12" />}
          title="No Configurations"
          description="Create a paper trading configuration to test strategies with backtesting."
          action={{ label: "New Configuration", onClick: () => setShowModal(true) }}
        />
      ) : (
        <div className="space-y-4">
          {configs.map((config) => {
            const result = results[config.id];
            const isRunning = runningId === config.id;
            const isDeleting = deletingId === config.id;

            return (
              <Card key={config.id}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {config.name}
                      </h3>
                      <Badge>{config.strategyConfig.preset}</Badge>
                      <Badge variant="neutral">
                        {config.strategyConfig.symbol}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-text-muted">
                      <span>SL: {(config.riskConfig.stopLossPct * 100).toFixed(1)}%</span>
                      <span>TP: {(config.riskConfig.takeProfitPct * 100).toFixed(1)}%</span>
                      <span>Trail: {(config.riskConfig.trailingStopPct * 100).toFixed(1)}%</span>
                      <span>Hold: {config.riskConfig.holdPeriod}d</span>
                      <span>
                        Created{" "}
                        {new Date(config.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRun(config.id)}
                      loading={isRunning}
                      disabled={isRunning}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Run Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      loading={isDeleting}
                      disabled={isDeleting}
                      className="text-bearish hover:bg-bearish/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Results */}
                {result && (
                  <div className="mt-4 pt-4 border-t border-border animate-fade-in">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex items-center gap-2">
                        {result.totalReturn >= 0 ? (
                          <TrendingUp className="w-4 h-4 text-bullish" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-bearish" />
                        )}
                        <div>
                          <p className="text-xs text-text-muted">Return</p>
                          <p
                            className={`text-sm font-bold ${
                              result.totalReturn >= 0
                                ? "text-bullish"
                                : "text-bearish"
                            }`}
                          >
                            {result.totalReturn >= 0 ? "+" : ""}
                            {result.totalReturn.toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-accent" />
                        <div>
                          <p className="text-xs text-text-muted">Win Rate</p>
                          <p className="text-sm font-bold text-text-primary">
                            {(result.winRate * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-text-muted">Trades</p>
                        <p className="text-sm font-medium text-text-primary">
                          {result.totalTrades}{" "}
                          <span className="text-bullish">({result.winCount}W</span>
                          {" / "}
                          <span className="text-bearish">{result.lossCount}L)</span>
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-text-muted">Max Drawdown</p>
                        <p className="text-sm font-medium text-bearish">
                          -{result.maxDrawdown.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <ModalHeader>
          <ModalTitle>New Paper Trading Configuration</ModalTitle>
        </ModalHeader>

        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="My Strategy Test"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            label="Symbol"
            placeholder="AAPL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={10}
          />

          <Select
            label="Strategy Preset"
            options={PRESET_OPTIONS}
            value={preset}
            onChange={(value) => setPreset(value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Stop Loss %"
              type="number"
              step="0.1"
              min="0.5"
              max="20"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
            <Input
              label="Take Profit %"
              type="number"
              step="0.1"
              min="0.5"
              max="50"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
            />
            <Input
              label="Trailing Stop %"
              type="number"
              step="0.1"
              min="0.5"
              max="20"
              value={trailingStop}
              onChange={(e) => setTrailingStop(e.target.value)}
            />
            <Input
              label="Hold Period (days)"
              type="number"
              step="1"
              min="1"
              max="100"
              value={holdPeriod}
              onChange={(e) => setHoldPeriod(e.target.value)}
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            loading={creating}
            disabled={!name.trim() || !symbol.trim()}
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
