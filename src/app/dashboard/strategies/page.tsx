"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Plus, Trash2, X, Zap, RefreshCw } from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import type { SymbolStrategy } from "@/types";
import { STRATEGY_PRESETS, PRESET_LABELS, type PresetName } from "@/lib/strategy-presets";

const PRESET_OPTIONS = [
  { value: "custom", label: "Custom" },
  ...Object.entries(PRESET_LABELS).map(([key, val]) => ({
    value: key,
    label: val.label,
  })),
  { value: "auto", label: "Auto (ATR-tuned)" },
];

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<SymbolStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [symbol, setSymbol] = useState("");
  const [preset, setPreset] = useState("custom");
  const [stopLoss, setStopLoss] = useState(2);
  const [takeProfit, setTakeProfit] = useState(3);
  const [trailingStop, setTrailingStop] = useState(1.5);
  const [holdPeriod, setHoldPeriod] = useState(20);
  const [notes, setNotes] = useState("");
  const [atrTuned, setAtrTuned] = useState(false);
  const [lastAtr, setLastAtr] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [atrLoading, setAtrLoading] = useState(false);

  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/symbol-strategies");
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies ?? []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  function handlePresetChange(value: string) {
    setPreset(value);
    if (value === "auto") {
      handleAutoTune();
      return;
    }
    if (value && value in STRATEGY_PRESETS) {
      const p = STRATEGY_PRESETS[value as PresetName];
      setStopLoss(parseFloat((p.stopLossPct * 100).toFixed(1)));
      setTakeProfit(parseFloat((p.takeProfitPct * 100).toFixed(1)));
      setTrailingStop(parseFloat((p.trailingStopPct * 100).toFixed(1)));
      setHoldPeriod(p.holdPeriod);
      setAtrTuned(false);
      setLastAtr(null);
    }
  }

  async function handleAutoTune() {
    if (!symbol.trim()) {
      setError("Enter a symbol first to auto-tune");
      return;
    }
    setAtrLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/strategy-params/${encodeURIComponent(symbol.toUpperCase())}?mode=auto`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error
            ? `Auto-tune failed: ${data.error}`
            : `Auto-tune failed (HTTP ${res.status}). The symbol may not have enough price history.`
        );
        return;
      }
      const data = await res.json();
      setStopLoss(parseFloat((data.params.stopLossPct * 100).toFixed(1)));
      setTakeProfit(parseFloat((data.params.takeProfitPct * 100).toFixed(1)));
      setTrailingStop(parseFloat((data.params.trailingStopPct * 100).toFixed(1)));
      setHoldPeriod(data.params.holdPeriod);
      setAtrTuned(true);
      setLastAtr(data.atr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      setError(`Auto-tune failed: ${msg}.`);
    } finally {
      setAtrLoading(false);
    }
  }

  async function handleSave() {
    if (!symbol.trim()) {
      setError("Symbol is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/symbol-strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          presetName: preset === "custom" ? null : preset || null,
          stopLossPct: stopLoss / 100,
          takeProfitPct: takeProfit / 100,
          trailingStopPct: trailingStop / 100,
          holdPeriod,
          atrTuned,
          lastAtr,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error
            ? `Couldn't save: ${data.error}`
            : `Couldn't save (HTTP ${res.status}). Try again, or check if you're still signed in.`
        );
        return;
      }
      setShowAdd(false);
      resetForm();
      await loadStrategies();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      setError(`Couldn't save: ${msg}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch("/api/symbol-strategies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadStrategies();
    } catch {
      // Silent
    }
  }

  function resetForm() {
    setSymbol("");
    setPreset("custom");
    setStopLoss(2);
    setTakeProfit(3);
    setTrailingStop(1.5);
    setHoldPeriod(20);
    setNotes("");
    setAtrTuned(false);
    setLastAtr(null);
    setError("");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Execution"
        title="Strategies"
        description="Define and assign signal templates with risk parameters for backtesting and live evaluation."
        actions={
          <Button onClick={() => { setShowAdd(!showAdd); resetForm(); }}>
            {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span className="hidden sm:inline">{showAdd ? "Cancel" : "Assign Strategy"}</span>
          </Button>
        }
        stats={[
          { label: "Assignments", value: String(strategies.length) },
          { label: "ATR-Tuned", value: String(strategies.filter((s) => s.atrTuned).length), tone: "brand" },
          { label: "Unique Symbols", value: String(new Set(strategies.map((s) => s.symbol)).size) },
          { label: "Avg Stop Loss", value: strategies.length > 0 ? `${(strategies.reduce((sum, s) => sum + s.stopLossPct * 100, 0) / strategies.length).toFixed(1)}%` : "--" },
        ]}
      />

      {/* Add/Edit Form */}
      {showAdd && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Assign Strategy to Symbol</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                label="Symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
              <Select
                label="Preset"
                options={PRESET_OPTIONS}
                value={preset}
                onChange={(value) => handlePresetChange(value)}
                placeholder="Select preset..."
              />
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={handleAutoTune}
                  loading={atrLoading}
                  disabled={!symbol.trim()}
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">ATR Tune</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                label="Stop Loss %"
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
                step={0.5}
                min={0.1}
                max={50}
              />
              <Input
                label="Trailing Stop %"
                type="number"
                value={trailingStop}
                onChange={(e) => setTrailingStop(Number(e.target.value))}
                step={0.5}
                min={0.1}
                max={50}
              />
              <Input
                label="Take Profit %"
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
                step={0.5}
                min={0.1}
                max={100}
              />
              <Input
                label="Hold Period"
                type="number"
                value={holdPeriod}
                onChange={(e) => setHoldPeriod(Number(e.target.value))}
                min={1}
                max={100}
              />
            </div>

            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., volatile stock, needs wider stops"
            />

            {atrTuned && lastAtr !== null && (
              <p className="text-xs text-text-muted">
                ATR-tuned: ATR = ${lastAtr.toFixed(2)}
              </p>
            )}

            {error && <p className="text-sm text-bearish">{error}</p>}

            <Button onClick={handleSave} loading={saving}>
              Save Assignment
            </Button>
          </div>
        </Card>
      )}

      {/* Strategy List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : strategies.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <Shield className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">No strategies assigned</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Assign a strategy to a symbol to customize risk parameters for backtesting and trading.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-display font-bold text-lg">{s.symbol}</span>
                  {s.presetName && (
                    <Badge>{PRESET_LABELS[s.presetName as PresetName]?.label ?? s.presetName}</Badge>
                  )}
                  {s.atrTuned && (
                    <Badge variant="bullish">ATR</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm font-mono text-text-secondary">
                  <span>SL {(s.stopLossPct * 100).toFixed(1)}%</span>
                  <span>TS {(s.trailingStopPct * 100).toFixed(1)}%</span>
                  <span>TP {(s.takeProfitPct * 100).toFixed(1)}%</span>
                  <span>Hold {s.holdPeriod}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(s.id)}
                    className="min-h-[44px] min-w-[44px] text-text-muted hover:text-bearish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {s.notes && (
                <p className="text-xs text-text-muted mt-2">{s.notes}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
