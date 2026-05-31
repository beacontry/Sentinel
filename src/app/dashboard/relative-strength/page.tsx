"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

// ─── Types ──────────────────────────────────────────────────────────

interface RSResult {
  symbol: string;
  sector: string;
  rsScore: number;
  returnPct: number;
  benchmarkReturnPct: number;
  rank: number;
}

type SortField = "rank" | "symbol" | "sector" | "rsScore" | "returnPct";
type SortDir = "asc" | "desc";

const PERIOD_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const SECTOR_OPTIONS = [
  "Communication",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Healthcare",
  "Industrials",
  "Real Estate",
  "Technology",
  "Utilities",
];

// ─── Component ──────────────────────────────────────────────────────

export default function RelativeStrengthPage() {
  const [results, setResults] = useState<RSResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);
  const [sector, setSector] = useState("");
  const [benchmark, setBenchmark] = useState("SPY");

  // Sort state
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ─── Fetch ────────────────────────────────────────────────────────

  const fetchData = useCallback(async (p: number, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: String(p) });
      if (s) params.set("sector", s);

      const res = await fetch(`/api/relative-strength?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to load");
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setBenchmark(data.benchmark ?? "SPY");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period, sector);
  }, [fetchData, period, sector]);

  const handleRefresh = () => fetchData(period, sector);

  const handlePeriodChange = (p: number) => {
    setPeriod(p);
    setSortField("rank");
    setSortDir("asc");
  };

  const handleSectorChange = (s: string) => {
    setSector(s);
    setSortField("rank");
    setSortDir("asc");
  };

  // ─── Sorting ──────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "rank" ? "asc" : "desc");
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "rank":
        return dir * (a.rank - b.rank);
      case "symbol":
        return dir * a.symbol.localeCompare(b.symbol);
      case "sector":
        return dir * a.sector.localeCompare(b.sector);
      case "rsScore":
        return dir * (a.rsScore - b.rsScore);
      case "returnPct":
        return dir * (a.returnPct - b.returnPct);
      default:
        return 0;
    }
  });

  // ─── Sort header ──────────────────────────────────────────────────

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

  // ─── Helpers ──────────────────────────────────────────────────────

  function rsScoreBadgeVariant(score: number): "bullish" | "bearish" | "warning" | "neutral" {
    if (score >= 1.0) return "bullish";
    if (score >= 0.5) return "warning";
    return "bearish";
  }

  function returnColor(pct: number): string {
    if (pct > 0) return "text-bullish";
    if (pct < 0) return "text-bearish";
    return "text-text-secondary";
  }

  function formatReturn(pct: number): string {
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Relative Strength" />
      <PageIntro
        eyebrow="Market Analysis"
        title="Relative Strength"
        description={`Identify momentum leaders and laggards ranked against ${benchmark}.`}
        actions={
          <Button onClick={handleRefresh} loading={loading}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
        stats={[
          { label: "Symbols", value: String(results.length) },
          { label: "Period", value: `${period}d` },
          { label: "Outperforming", value: String(results.filter((r) => r.rsScore >= 1).length), tone: "bullish" },
          { label: "Underperforming", value: String(results.filter((r) => r.rsScore < 1).length), tone: "bearish" },
        ]}
      />

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Period buttons */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Period
            </label>
            <div className="flex gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={period === opt.value ? "primary" : "outline"}
                  size="sm"
                  onClick={() => handlePeriodChange(opt.value)}
                  disabled={loading}
                  className="min-h-[44px] min-w-[56px]"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Sector filter */}
          <Select
            label="Sector"
            value={sector}
            onChange={(value) => handleSectorChange(value)}
            disabled={loading}
            placeholder="All Sectors"
            options={SECTOR_OPTIONS.map((s) => ({ value: s, label: s }))}
            className="w-full sm:w-auto"
          />
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-bearish/30 bg-bearish/10 p-4 text-sm text-bearish">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
          <p className="text-sm text-text-secondary">
            Computing relative strength rankings...
          </p>
        </div>
      ) : results.length === 0 ? (
        /* Empty state */
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <p className="font-display text-lg font-semibold text-text-primary mb-1">
            No data available
          </p>
          <p className="text-sm text-text-secondary">
            Could not compute relative strength. Try refreshing or adjusting the period.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-elevated">
                  <th className="text-left px-4 py-3 w-16">
                    <SortHeader field="rank" label="Rank" />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="symbol" label="Symbol" />
                  </th>
                  <th className="text-left px-4 py-3">
                    <SortHeader field="sector" label="Sector" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="rsScore" label="RS Score" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <SortHeader field="returnPct" label="Return %" />
                  </th>
                  <th className="text-right px-4 py-3">
                    <span className="text-xs font-medium text-text-secondary">
                      {benchmark} Return %
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-b border-border hover:bg-bg-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-text-muted text-sm">
                      #{r.rank}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-text-primary">
                      {r.symbol}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{r.sector}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={rsScoreBadgeVariant(r.rsScore)}>
                        {r.rsScore.toFixed(2)}x
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${returnColor(r.returnPct)}`}>
                      {formatReturn(r.returnPct)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${returnColor(r.benchmarkReturnPct)}`}>
                      {formatReturn(r.benchmarkReturnPct)}
                    </td>
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-muted">
                      #{r.rank}
                    </span>
                    <span className="font-mono font-bold text-text-primary text-base">
                      {r.symbol}
                    </span>
                  </div>
                  <Badge variant={rsScoreBadgeVariant(r.rsScore)}>
                    {r.rsScore.toFixed(2)}x
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Badge variant="neutral">{r.sector}</Badge>
                  <span className={`font-mono ${returnColor(r.returnPct)}`}>
                    {formatReturn(r.returnPct)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">
                    {benchmark} Return
                  </span>
                  <span className={`font-mono ${returnColor(r.benchmarkReturnPct)}`}>
                    {formatReturn(r.benchmarkReturnPct)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {results.length} symbol{results.length !== 1 ? "s" : ""} ranked
              over {period}d vs {benchmark}
            </span>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-bullish" />
                RS &gt; 1 = outperforming
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-bearish rotate-180" />
                RS &lt; 1 = underperforming
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
