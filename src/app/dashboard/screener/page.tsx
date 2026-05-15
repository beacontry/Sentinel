"use client";

import { useState, useCallback, useEffect } from "react";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import type { SignalType, AnalysisResult } from "@/types";
import {
  ScanSearch,
  Plus,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  TrendingDown,
  TrendingUp,
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Minus,
} from "lucide-react";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

// ─── Types ──────────────────────────────────────────────────────────

interface ScreenerResult {
  symbol: string;
  sector: string;
  signal: SignalType;
  confidence: number;
  price: number;
  volume: number;
  rsi: number | null;
  volumeRatio: number | undefined;
  atr: number | null;
}

interface TraderPushResult {
  symbol: string;
  signal: string;
  confidence: number;
  status: "executed" | "rejected" | "error";
  reason?: string;
  tradeId?: number;
}

interface ScreenerFilter {
  field: "signal" | "rsi_14" | "confidence" | "price" | "volumeRatio" | "sector" | "atr_14";
  operator: "gt" | "lt" | "eq" | "gte" | "lte" | "in";
  value: number | string | string[];
}

type SortField = "symbol" | "sector" | "signal" | "price" | "rsi" | "volumeRatio" | "confidence";
type SortDir = "asc" | "desc";

const FIELD_OPTIONS: { value: ScreenerFilter["field"]; label: string }[] = [
  { value: "signal", label: "Signal" },
  { value: "rsi_14", label: "RSI (14)" },
  { value: "confidence", label: "Confidence" },
  { value: "price", label: "Price" },
  { value: "volumeRatio", label: "Volume Ratio" },
  { value: "sector", label: "Sector" },
  { value: "atr_14", label: "ATR (14)" },
];

const OPERATOR_OPTIONS: { value: ScreenerFilter["operator"]; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "in", label: "in" },
];

const SIGNAL_ORDER: Record<string, number> = {
  STRONG_BUY: 5,
  BUY: 4,
  HOLD: 3,
  SELL: 2,
  STRONG_SELL: 1,
};

// ─── Preset filters ─────────────────────────────────────────────────

interface Preset {
  label: string;
  icon: React.ReactNode;
  filters: ScreenerFilter[];
}

const PRESETS: Preset[] = [
  {
    label: "RSI Oversold (<30)",
    icon: <TrendingDown className="w-4 h-4" />,
    filters: [{ field: "rsi_14", operator: "lt", value: 30 }],
  },
  {
    label: "Strong Buy Signals",
    icon: <TrendingUp className="w-4 h-4" />,
    filters: [{ field: "signal", operator: "in", value: ["STRONG_BUY"] }],
  },
  {
    label: "Unusual Volume (3x+)",
    icon: <BarChart3 className="w-4 h-4" />,
    filters: [{ field: "volumeRatio", operator: "gte", value: 3 }],
  },
  {
    label: "High Confidence (>0.7)",
    icon: <Activity className="w-4 h-4" />,
    filters: [{ field: "confidence", operator: "gt", value: 0.7 }],
  },
];

// ─── Component ──────────────────────────────────────────────────────

export default function ScreenerPage() {
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traderPush, setTraderPush] = useState<TraderPushResult[]>([]);
  const [traderConfigured, setTraderConfigured] = useState(false);

  // Custom filters
  const [filters, setFilters] = useState<ScreenerFilter[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Sort state
  const [sortField, setSortField] = useState<SortField>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Analysis modal state
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Poll cached results
  const pollCache = useCallback(async () => {
    try {
      const res = await fetch("/api/screener");
      if (!res.ok) return;
      const data = await res.json();
      setScanning(data.scanning ?? false);
      if (data.results?.length > 0) {
        setResults(data.results);
        setTotalSymbols(data.count ?? data.results.length);
        setScannedAt(data.scannedAt ?? null);
        setStale(data.stale ?? false);
        setTraderPush(data.traderPush ?? []);
        setTraderConfigured(data.traderConfigured ?? false);
      } else if (data.scannedAt == null) {
        // No scan ever completed — clear stale UI state
        setScannedAt(null);
      }
    } catch {
      // Non-critical polling failure
    }
  }, []);

  // Initial load of cached data
  useEffect(() => {
    pollCache();
  }, [pollCache]);

  // Auto-refresh every 30s
  usePolling(pollCache, POLLING_INTERVALS.screenerCache);

  // ─── Fetch / scan ───────────────────────────────────────────────

  const fetchResults = useCallback(async (filtersToApply: ScreenerFilter[]) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: filtersToApply }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Scan failed");
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setTotalSymbols(data.totalSymbols ?? data.count ?? 0);
      setScannedAt(data.scannedAt ?? null);
      setScanning(data.scanning ?? false);
      setStale(data.stale ?? false);
      setTraderPush(data.traderPush ?? []);
      setTraderConfigured(data.traderConfigured ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = () => {
    setActivePreset(null);
    fetchResults(filters);
  };

  const handlePreset = (preset: Preset) => {
    setActivePreset(preset.label);
    setFilters(preset.filters);
    fetchResults(preset.filters);
  };

  const handleApplyFilters = () => {
    setActivePreset(null);
    fetchResults(filters);
  };

  // ─── Analysis modal ─────────────────────────────────────────────

  const openAnalysis = useCallback(async (symbol: string) => {
    setSelectedSymbol(symbol);
    setAnalysisData(null);
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      // Use same timeframe as screener scan (90 days, daily bars) for consistency
      const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}?days=90&resolution=1d`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Analysis failed");
      }
      const data: AnalysisResult = await res.json();
      setAnalysisData(data);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const closeAnalysis = () => {
    setSelectedSymbol(null);
    setAnalysisData(null);
    setAnalysisError(null);
  };

  // ─── Custom filter management ───────────────────────────────────

  const addFilter = () => {
    if (filters.length >= 10) return;
    setFilters((prev) => [
      ...prev,
      { field: "rsi_14", operator: "lt", value: 30 },
    ]);
  };

  const removeFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<ScreenerFilter>) => {
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  // ─── Sorting ────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "symbol":
        return dir * a.symbol.localeCompare(b.symbol);
      case "sector":
        return dir * a.sector.localeCompare(b.sector);
      case "signal":
        return dir * ((SIGNAL_ORDER[a.signal] ?? 0) - (SIGNAL_ORDER[b.signal] ?? 0));
      case "price":
        return dir * (a.price - b.price);
      case "rsi":
        return dir * ((a.rsi ?? 0) - (b.rsi ?? 0));
      case "volumeRatio":
        return dir * ((a.volumeRatio ?? 0) - (b.volumeRatio ?? 0));
      case "confidence":
        return dir * (a.confidence - b.confidence);
      default:
        return 0;
    }
  });

  // ─── Sort header ────────────────────────────────────────────────

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary
          hover:text-text-primary transition-colors cursor-pointer"
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Market Screener" description="Full-universe market scans + signal ranking. The engine pulls from here." />
      <PageIntro
        eyebrow="Market Scanner"
        title="Screener"
        description={`Scan ${totalSymbols > 0 ? totalSymbols : "~130"} symbols for technical signals, then push the best setups straight into the trading workflow.`}
        actions={
          <>
            {scannedAt && stale && <Badge variant="warning">Stale Cache</Badge>}
            {scannedAt && (
              <Badge variant="default" className="font-mono">
                {new Date(scannedAt).toLocaleTimeString()}
              </Badge>
            )}
            <Button onClick={handleScan} loading={loading}>
              <ScanSearch className="w-4 h-4" />
              <span>Scan Market</span>
            </Button>
          </>
        }
        stats={[
          { label: "Universe", value: totalSymbols > 0 ? totalSymbols : "~130" },
          { label: "Matches", value: results.length },
          { label: "Trader Link", value: traderConfigured ? "Configured" : "Offline", tone: traderConfigured ? "bullish" : "neutral" },
          { label: "Active Filters", value: filters.length || "Presets Only", tone: filters.length ? "brand" : "neutral" },
        ]}
      />

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Filters</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant={activePreset === preset.label ? "primary" : "outline"}
              size="sm"
              onClick={() => handlePreset(preset)}
              disabled={loading}
              className="min-h-[44px]"
            >
              {preset.icon}
              {preset.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* Custom filter builder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Filters</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={addFilter}
            disabled={filters.length >= 10}
            className="min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </CardHeader>

        {filters.length === 0 ? (
          <p className="text-sm text-text-muted">
            No custom filters. Use quick filters above or add your own.
          </p>
        ) : (
          <div className="space-y-2">
            {filters.map((filter, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2"
              >
                {/* Field select */}
                <Select
                  value={filter.field}
                  onChange={(value) =>
                    updateFilter(idx, {
                      field: value as ScreenerFilter["field"],
                    })
                  }
                  options={FIELD_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                />

                {/* Operator select */}
                <Select
                  value={filter.operator}
                  onChange={(value) =>
                    updateFilter(idx, {
                      operator: value as ScreenerFilter["operator"],
                    })
                  }
                  options={OPERATOR_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  className="w-20"
                />

                {/* Value input */}
                <Input
                  value={String(filter.value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Try numeric first, fall back to string
                    const num = parseFloat(raw);
                    updateFilter(idx, {
                      value: !isNaN(num) && raw.trim() !== "" ? num : raw,
                    });
                  }}
                  placeholder="Value"
                  className="w-32 sm:w-40"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFilter(idx)}
                  className="min-h-[44px] text-bearish hover:text-bearish/80"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleApplyFilters}
              disabled={loading}
              className="mt-2 min-h-[44px]"
            >
              Apply Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-bearish/30 bg-bearish/10 p-4 text-sm text-bearish">
          {error}
        </div>
      )}

      {/* Trader push results */}
      {traderPush.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent" />
              Signals Sent to Trader
            </CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {traderPush.map((p, i) => (
              <div
                key={`${p.symbol}-${i}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-elevated text-sm"
              >
                <div className="flex items-center gap-3">
                  {p.status === "executed" ? (
                    <CheckCircle2 className="w-4 h-4 text-bullish" />
                  ) : p.status === "rejected" ? (
                    <XCircle className="w-4 h-4 text-warning" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-bearish" />
                  )}
                  <span className="font-mono font-bold">{p.symbol}</span>
                  <Badge variant={p.signal.includes("BUY") ? "bullish" : "bearish"}>
                    {p.signal.replace("_", " ")}
                  </Badge>
                  <span className="text-text-muted">
                    {Math.round(p.confidence * 100)}%
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={
                      p.status === "executed"
                        ? "text-bullish"
                        : p.status === "rejected"
                          ? "text-warning"
                          : "text-bearish"
                    }
                  >
                    {p.status}
                  </span>
                  {p.reason && (
                    <span className="text-text-muted ml-2 text-xs">
                      ({p.reason})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trader status indicator */}
      {traderConfigured && traderPush.length === 0 && results.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Bot className="w-4 h-4" />
          No signals met trader threshold (confidence &ge; 70%, non-HOLD)
        </div>
      )}

      {/* Results table */}
      {(loading || scanning) && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-sm text-text-secondary">
            {scanning && !loading
              ? "Scan in progress on the server — results will appear shortly."
              : "Scanning symbols... This may take a moment."}
          </p>
        </div>
      ) : results.length === 0 && scannedAt ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <ScanSearch className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="font-display text-lg font-semibold text-text-primary mb-1">
            No matches found
          </p>
          <p className="text-sm text-text-secondary">
            Try adjusting your filters or running a new scan.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <ScanSearch className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="font-display text-lg font-semibold text-text-primary mb-1">
            Ready to scan
          </p>
          <p className="text-sm text-text-secondary">
            Click &quot;Scan Market&quot; or select a quick filter to get
            started.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="text-left px-4 py-3">
                    <SortHeader field="symbol" label="Symbol" />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="sector" label="Sector" />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="signal" label="Signal" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="price" label="Price" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="rsi" label="RSI" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="volumeRatio" label="Vol Ratio" />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="confidence" label="Confidence" />
                  </th>
                  {traderConfigured && (
                    <th className="text-center px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
                        <Bot className="w-3 h-3" /> Trader
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-b border-border hover:bg-bg-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold">
                      <button
                        onClick={() => openAnalysis(r.symbol)}
                        className="text-text-primary hover:text-accent transition-colors cursor-pointer"
                      >
                        {r.symbol}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {r.sector}
                    </td>
                    <td className="px-4 py-3">
                      <SignalBadge signal={r.signal} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      ${r.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={
                          r.rsi !== null
                            ? r.rsi < 30
                              ? "text-bullish"
                              : r.rsi > 70
                                ? "text-bearish"
                                : "text-text-secondary"
                            : "text-text-muted"
                        }
                      >
                        {r.rsi !== null ? r.rsi.toFixed(1) : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={
                          r.volumeRatio !== undefined && r.volumeRatio >= 3
                            ? "text-warning"
                            : "text-text-secondary"
                        }
                      >
                        {r.volumeRatio !== undefined
                          ? `${r.volumeRatio.toFixed(1)}x`
                          : "--"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden max-w-[100px]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              r.confidence >= 0.7
                                ? "bg-bullish"
                                : r.confidence >= 0.4
                                  ? "bg-warning"
                                  : "bg-bearish"
                            }`}
                            style={{ width: `${Math.round(r.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-text-secondary w-10 text-right">
                          {Math.round(r.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    {traderConfigured && (
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const push = traderPush.find((p) => p.symbol === r.symbol);
                          if (!push) return <span className="text-text-muted">--</span>;
                          if (push.status === "executed")
                            return <CheckCircle2 className="w-4 h-4 text-bullish mx-auto" />;
                          if (push.status === "rejected")
                            return (
                              <span title={push.reason}>
                                <XCircle className="w-4 h-4 text-warning mx-auto" />
                              </span>
                            );
                          return (
                            <span title={push.reason}>
                              <AlertCircle className="w-4 h-4 text-bearish mx-auto" />
                            </span>
                          );
                        })()}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {sortedResults.map((r) => (
              <div key={r.symbol} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => openAnalysis(r.symbol)}
                    className="font-mono font-bold text-text-primary text-base hover:text-accent transition-colors cursor-pointer"
                  >
                    {r.symbol}
                  </button>
                  <SignalBadge signal={r.signal} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{r.sector}</span>
                  <span className="font-mono text-text-primary">
                    ${r.price.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">RSI</span>
                  <span
                    className={`font-mono ${
                      r.rsi !== null
                        ? r.rsi < 30
                          ? "text-bullish"
                          : r.rsi > 70
                            ? "text-bearish"
                            : "text-text-secondary"
                        : "text-text-muted"
                    }`}
                  >
                    {r.rsi !== null ? r.rsi.toFixed(1) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Vol Ratio</span>
                  <span
                    className={`font-mono ${
                      r.volumeRatio !== undefined && r.volumeRatio >= 3
                        ? "text-warning"
                        : "text-text-secondary"
                    }`}
                  >
                    {r.volumeRatio !== undefined
                      ? `${r.volumeRatio.toFixed(1)}x`
                      : "--"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Confidence</span>
                  <div className="flex-1 h-2 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        r.confidence >= 0.7
                          ? "bg-bullish"
                          : r.confidence >= 0.4
                            ? "bg-warning"
                            : "bg-bearish"
                      }`}
                      style={{ width: `${Math.round(r.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-secondary w-10 text-right">
                    {Math.round(r.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer count */}
          <div className="border-t border-border px-4 py-3 text-xs text-text-muted">
            Showing {results.length} result{results.length !== 1 ? "s" : ""}
            {totalSymbols > 0 && totalSymbols !== results.length && (
              <> of {totalSymbols} scanned</>
            )}
          </div>
        </Card>
      )}

      {/* Analysis Modal */}
      <Modal
        open={selectedSymbol !== null}
        onClose={closeAnalysis}
        className="max-w-2xl"
      >
        <ModalHeader>
          <ModalTitle>{selectedSymbol}</ModalTitle>
        </ModalHeader>

        {analysisLoading ? (
          <AnalysisModalSkeleton />
        ) : analysisError ? (
          <div className="rounded-lg border border-bearish/30 bg-bearish/10 p-4 text-sm text-bearish">
            {analysisError}
          </div>
        ) : analysisData ? (
          <AnalysisModalContent analysis={analysisData} />
        ) : null}
      </Modal>
    </div>
  );
}

// ─── Analysis Modal Content ───────────────────────────────────────

function AnalysisModalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton width="90px" height="28px" rounded="full" />
        <Skeleton width="80px" height="24px" rounded="md" />
        <div className="flex-1" />
        <Skeleton width="60px" height="20px" rounded="md" />
      </div>
      <Skeleton width="100%" height="8px" rounded="full" />
      <div className="space-y-1.5">
        <Skeleton width="100%" height="14px" rounded="sm" />
        <Skeleton width="85%" height="14px" rounded="sm" />
        <Skeleton width="70%" height="14px" rounded="sm" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} width="100%" height="56px" rounded="lg" />
        ))}
      </div>
    </div>
  );
}

function getRsiStatus(rsi: number | null): { label: string; color: string } {
  if (rsi === null) return { label: "--", color: "text-text-muted" };
  if (rsi >= 70) return { label: "Overbought", color: "text-bearish" };
  if (rsi <= 30) return { label: "Oversold", color: "text-bullish" };
  return { label: "Neutral", color: "text-text-secondary" };
}

function getMacdDirection(
  macdLine: number | null,
  macdSignal: number | null
): { label: string; color: string } {
  if (macdLine === null || macdSignal === null)
    return { label: "--", color: "text-text-muted" };
  if (macdLine > macdSignal) return { label: "Bullish", color: "text-bullish" };
  return { label: "Bearish", color: "text-bearish" };
}

function getEmaTrend(
  ema9: number | null,
  ema21: number | null
): { label: string; color: string } {
  if (ema9 === null || ema21 === null)
    return { label: "--", color: "text-text-muted" };
  if (ema9 > ema21) return { label: "Uptrend", color: "text-bullish" };
  return { label: "Downtrend", color: "text-bearish" };
}

function getBollingerPosition(
  price: number,
  upper: number | null,
  lower: number | null
): { label: string; color: string } {
  if (upper === null || lower === null)
    return { label: "--", color: "text-text-muted" };
  if (price >= upper) return { label: "Above Upper", color: "text-bearish" };
  if (price <= lower) return { label: "Below Lower", color: "text-bullish" };
  return { label: "Mid Band", color: "text-text-secondary" };
}

function AnalysisModalContent({ analysis }: { analysis: AnalysisResult }) {
  const isBullish = analysis.signal === "BUY" || analysis.signal === "STRONG_BUY";
  const isBearish = analysis.signal === "SELL" || analysis.signal === "STRONG_SELL";
  const confidencePct = Math.round(analysis.confidence * 100);

  const rsiStatus = getRsiStatus(analysis.indicators.rsi_14);
  const macdDir = getMacdDirection(
    analysis.indicators.macd_line,
    analysis.indicators.macd_signal
  );
  const emaTrend = getEmaTrend(
    analysis.indicators.ema_9,
    analysis.indicators.ema_21
  );
  const bollingerPos = getBollingerPosition(
    analysis.price,
    analysis.indicators.bollinger_upper,
    analysis.indicators.bollinger_lower
  );

  return (
    <div className="space-y-5">
      {/* Signal + Price + Confidence */}
      <div className="flex flex-wrap items-center gap-3">
        <SignalBadge signal={analysis.signal} size="lg" />
        <span className="font-mono text-lg font-bold text-text-primary">
          ${analysis.price.toFixed(2)}
        </span>
        {analysis.volumeRatio !== undefined && (
          <Badge variant={analysis.unusualVolume ? "warning" : "neutral"} className="text-xs">
            Vol {analysis.volumeRatio.toFixed(1)}x
          </Badge>
        )}
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-muted uppercase tracking-wider font-medium">
            Confidence
          </span>
          <span
            className={`font-mono font-bold ${
              confidencePct >= 70
                ? "text-bullish"
                : confidencePct >= 40
                  ? "text-warning"
                  : "text-bearish"
            }`}
          >
            {confidencePct}%
          </span>
        </div>
        <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isBullish
                ? "bg-bullish"
                : isBearish
                  ? "bg-bearish"
                  : "bg-neutral"
            }`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Plain English explanation */}
      {analysis.plainEnglish && (
        <p className="text-sm text-text-secondary leading-relaxed">
          {analysis.plainEnglish}
        </p>
      )}

      {/* Signal DNA - reasons */}
      {analysis.reasons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Signal DNA
            </span>
          </div>
          <ul className="space-y-1">
            {analysis.reasons.map((reason, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed"
              >
                <span className="text-accent mt-0.5 shrink-0">*</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Indicator grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Indicators
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* RSI */}
          <IndicatorCell
            icon={<Activity className="w-3.5 h-3.5" />}
            label="RSI (14)"
            value={analysis.indicators.rsi_14?.toFixed(1) ?? "--"}
            status={rsiStatus.label}
            statusColor={rsiStatus.color}
          />

          {/* MACD */}
          <IndicatorCell
            icon={<ArrowUpDown className="w-3.5 h-3.5" />}
            label="MACD"
            value={analysis.indicators.macd_histogram?.toFixed(3) ?? "--"}
            status={macdDir.label}
            statusColor={macdDir.color}
          />

          {/* EMA 9/21 */}
          <IndicatorCell
            icon={
              emaTrend.label === "Uptrend" ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : emaTrend.label === "Downtrend" ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )
            }
            label="EMA 9/21"
            value={analysis.indicators.ema_9?.toFixed(2) ?? "--"}
            status={emaTrend.label}
            statusColor={emaTrend.color}
          />

          {/* SMA 20 */}
          <IndicatorCell
            label="SMA 20"
            value={analysis.indicators.sma_20?.toFixed(2) ?? "--"}
          />

          {/* SMA 50 */}
          <IndicatorCell
            label="SMA 50"
            value={analysis.indicators.sma_50?.toFixed(2) ?? "--"}
          />

          {/* Bollinger Bands */}
          <IndicatorCell
            label="Bollinger"
            value={
              analysis.indicators.bollinger_upper !== null
                ? `${analysis.indicators.bollinger_lower?.toFixed(2)} - ${analysis.indicators.bollinger_upper?.toFixed(2)}`
                : "--"
            }
            status={bollingerPos.label}
            statusColor={bollingerPos.color}
          />

          {/* ATR */}
          <IndicatorCell
            label="ATR (14)"
            value={analysis.indicators.atr_14?.toFixed(2) ?? "--"}
          />

          {/* Volume Ratio */}
          <IndicatorCell
            label="Volume Ratio"
            value={
              analysis.volumeRatio !== undefined
                ? `${analysis.volumeRatio.toFixed(1)}x`
                : "--"
            }
            status={
              analysis.unusualVolume
                ? "Unusual"
                : analysis.volumeRatio !== undefined
                  ? "Normal"
                  : undefined
            }
            statusColor={
              analysis.unusualVolume ? "text-warning" : "text-text-muted"
            }
          />

          {/* VWAP */}
          <IndicatorCell
            label="VWAP"
            value={analysis.indicators.vwap?.toFixed(2) ?? "--"}
            status={
              analysis.indicators.vwap !== null
                ? analysis.price > analysis.indicators.vwap
                  ? "Above"
                  : "Below"
                : undefined
            }
            statusColor={
              analysis.indicators.vwap !== null
                ? analysis.price > analysis.indicators.vwap
                  ? "text-bullish"
                  : "text-bearish"
                : "text-text-muted"
            }
          />
        </div>
      </div>
    </div>
  );
}

function IndicatorCell({
  icon,
  label,
  value,
  status,
  statusColor,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  status?: string;
  statusColor?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-bg-elevated">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-medium text-text-primary">
          {value}
        </span>
        {status && (
          <span className={`text-[10px] font-medium ${statusColor ?? "text-text-muted"}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
