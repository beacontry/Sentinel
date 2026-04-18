"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SignalBadge } from "@/components/ui/signal-badge";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import type { SignalType } from "@/types";
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
} from "lucide-react";

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

  // Auto-refresh: poll cached results every 30s
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    async function pollCache() {
      try {
        const res = await fetch("/api/screener");
        if (!res.ok) return;
        const data = await res.json();
        if (data.results?.length > 0) {
          setResults(data.results);
          setTotalSymbols(data.count ?? data.results.length);
          setScannedAt(data.scannedAt ?? null);
          setStale(data.stale ?? false);
          setTraderPush(data.traderPush ?? []);
          setTraderConfigured(data.traderConfigured ?? false);
        }
      } catch {
        // Non-critical polling failure
      }
    }
    // Initial load of cached data
    pollCache();
    pollRef.current = setInterval(pollCache, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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
                    {(p.confidence * 100).toFixed(0)}%
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
      {loading && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-sm text-text-secondary">
            Scanning symbols... This may take a moment.
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
                <tr className="border-b border-border bg-bg-elevated/50">
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
                    className="border-b border-border/50 hover:bg-bg-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-text-primary">
                      {r.symbol}
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
                            style={{ width: `${(r.confidence * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-text-secondary w-10 text-right">
                          {(r.confidence * 100).toFixed(0)}%
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
                  <span className="font-mono font-bold text-text-primary text-base">
                    {r.symbol}
                  </span>
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
                      style={{ width: `${(r.confidence * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-secondary w-10 text-right">
                    {(r.confidence * 100).toFixed(0)}%
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
    </div>
  );
}
