"use client";

// Mode-compare backtest page.
//
// Runs all 6 comparable engine modes (conservative / moderate / optimized /
// aggressive / tactical / adaptive) against a single symbol + date-range
// and renders side-by-side stats + an overlaid equity-curve chart.
//
// URL: /dashboard/backtest/mode-compare?symbol=AAPL&days=1825
//   (?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD also supported)
//
// Distinct from /dashboard/backtest/compare which compares saved-strategy
// blobs. This page runs fresh backtests on each request through
// /api/backtest/mode-compare.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { ArrowLeft, BarChart3, Play } from "lucide-react";

interface BacktestResult {
  symbol: string;
  totalReturn: number;
  winRate: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio?: number;
  calmarRatio?: number;
  marRatio?: number;
  totalTrades: number;
  equityCurve: Array<{ date: string; value: number }>;
  modeTimeline?: Array<{ date: string; mode: string }>;
}

interface ModeResult {
  mode: string;
  ok: boolean;
  error?: string;
  result?: BacktestResult;
}

interface CompareResponse {
  symbol: string;
  days: number;
  barCount: number;
  marketContextAvailable: boolean;
  results: ModeResult[];
}

// Stable color palette — one per mode so the same mode always renders the
// same color across the table AND the equity curves. Kept entries for
// conservative / moderate / aggressive so adaptive's regime overlay
// (which shows which base mode adaptive was running at each point in
// time) still has consistent coloring per resolved-to mode.
const MODE_COLORS: Record<string, string> = {
  conservative: "#5b8def", // blue
  moderate:     "#9580f0", // violet
  optimized:    "#2dd4bf", // teal/accent
  aggressive:   "#fb923c", // orange
  tactical:     "#a78bfa", // soft violet
  adaptive:     "#f43f5e", // rose — stands out
};

export default function ModeComparePageWrapper() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <ModeComparePage />
    </Suspense>
  );
}

function ModeComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSymbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const initialDays = Number(searchParams.get("days")) || 1825;

  const [symbol, setSymbol] = useState(initialSymbol);
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const runCompare = useCallback(
    async (sym: string, dayCount: number) => {
      if (!sym) return;
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams({ symbol: sym, days: String(dayCount) });
        const res = await fetch(`/api/backtest/mode-compare?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErr(body?.error || `Request failed (${res.status})`);
          setData(null);
          return;
        }
        setData(await res.json());
      } catch (e) {
        setErr((e as Error).message || "Network error");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-run on first load if symbol was in the URL.
  useEffect(() => {
    if (initialSymbol) {
      void runCompare(initialSymbol, initialDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRun(e?: React.FormEvent) {
    e?.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const params = new URLSearchParams({ symbol: sym, days: String(days) });
    router.replace(`/dashboard/backtest/mode-compare?${params}`);
    void runCompare(sym, days);
  }

  // ──── Equity-curve overlay: normalize each curve to 100 = start so
  //      different absolute returns are visually comparable.
  const overlay = useMemo(() => {
    if (!data) return null;
    const okResults = data.results.filter((r) => r.ok && r.result);
    if (okResults.length === 0) return null;

    // All curves share the same date axis (same source bars).
    const referenceCurve = okResults[0].result!.equityCurve;
    const firstDate = referenceCurve[0]?.date;
    const lastDate = referenceCurve[referenceCurve.length - 1]?.date;

    // SVG viewport — fixed width/height; date axis on x, normalized value on y.
    const W = 900;
    const H = 280;
    const PAD_L = 40;
    const PAD_R = 16;
    const PAD_T = 16;
    const PAD_B = 28;
    const PLOT_W = W - PAD_L - PAD_R;
    const PLOT_H = H - PAD_T - PAD_B;

    // Normalize: each curve starts at 100. Collect all normalized values
    // for y-range scaling.
    const normalized = okResults.map((r) => {
      const start = r.result!.equityCurve[0]?.value || 10000;
      return {
        mode: r.mode,
        points: r.result!.equityCurve.map((p) => ({
          date: p.date,
          v: (p.value / start) * 100,
        })),
      };
    });

    const allValues = normalized.flatMap((c) => c.points.map((p) => p.v));
    const yMin = Math.min(...allValues, 95);
    const yMax = Math.max(...allValues, 105);

    function xCoord(idx: number, totalPoints: number) {
      return PAD_L + (idx / Math.max(1, totalPoints - 1)) * PLOT_W;
    }
    function yCoord(v: number) {
      const ratio = (v - yMin) / Math.max(0.0001, yMax - yMin);
      return PAD_T + PLOT_H - ratio * PLOT_H;
    }

    return { W, H, PAD_L, PAD_R, PAD_T, PAD_B, PLOT_W, PLOT_H, normalized, yMin, yMax, xCoord, yCoord, firstDate, lastDate };
  }, [data]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <Link
          href="/dashboard/backtest"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Backtest
        </Link>
        <PageIntro
          eyebrow="Compare"
          title="Mode Compare"
          description="Run all 6 engine modes against the same symbol + date-range. See empirically whether adaptive switching beats sticking with one mode for your horizon."
        />
      </div>

      {/* Controls */}
      <Card>
        <form onSubmit={handleRun} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 min-w-0">
            <Input
              label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
          <div className="w-full sm:w-40">
            <Input
              label="Days back"
              type="number"
              value={days}
              min={90}
              max={9125}
              onChange={(e) => setDays(Math.max(90, Math.min(9125, Number(e.target.value) || 90)))}
            />
          </div>
          <Button type="submit" loading={loading} disabled={!symbol.trim()} className="min-h-[44px]">
            <Play className="w-4 h-4" />
            Run comparison
          </Button>
        </form>
        {data && (
          <div className="mt-3 text-xs text-text-muted flex items-center gap-3 flex-wrap">
            <span>
              <span className="font-mono text-text-primary">{data.symbol}</span> &middot; {data.barCount} bars
            </span>
            {!data.marketContextAvailable && (
              <Badge variant="warning">
                Adaptive unavailable — VIX/SPY context missing
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* Errors */}
      {err && (
        <Card>
          <p className="text-sm text-bearish">{err}</p>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {/* Empty state */}
      {!loading && !data && !err && (
        <EmptyState
          icon={<BarChart3 className="w-12 h-12" />}
          title="Run a comparison"
          description="Enter a symbol and a date range. The backtest runs each user-selectable engine mode (optimized / tactical / adaptive) in parallel."
        />
      )}

      {/* Stats table */}
      {data && data.results.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-3 font-medium">Mode</th>
                  <th className="pb-2 px-3 font-medium text-right">Return</th>
                  <th className="pb-2 px-3 font-medium text-right">Win rate</th>
                  <th className="pb-2 px-3 font-medium text-right">Trades</th>
                  <th className="pb-2 px-3 font-medium text-right">Max DD</th>
                  <th className="pb-2 px-3 font-medium text-right">Sharpe</th>
                  <th className="pb-2 px-3 font-medium text-right">Sortino</th>
                  <th className="pb-2 px-3 font-medium text-right">Calmar</th>
                  <th className="pb-2 px-3 font-medium text-right">MAR</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {data.results.map((r) => {
                  if (!r.ok || !r.result) {
                    return (
                      <tr key={r.mode} className="border-b border-border/50">
                        <td className="py-2 pr-3">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                            style={{ background: MODE_COLORS[r.mode] ?? "#888" }}
                          />
                          {r.mode}
                        </td>
                        <td className="py-2 px-3 text-bearish text-right" colSpan={8}>
                          {r.error ?? "failed"}
                        </td>
                      </tr>
                    );
                  }
                  const res = r.result;
                  return (
                    <tr key={r.mode} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-2 pr-3 text-text-primary font-sans">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                          style={{ background: MODE_COLORS[r.mode] ?? "#888" }}
                        />
                        {r.mode}
                      </td>
                      <td className={`py-2 px-3 text-right ${res.totalReturn >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {res.totalReturn >= 0 ? "+" : ""}{res.totalReturn.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right">{(res.winRate * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-right">{res.totalTrades}</td>
                      <td className="py-2 px-3 text-right text-bearish">-{res.maxDrawdown.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right">{res.sharpeRatio.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{(res.sortinoRatio ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{(res.calmarRatio ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{(res.marRatio ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Equity curve overlay */}
      {overlay && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Equity curves (normalized to 100)</h3>
            <span className="text-xs text-text-muted font-mono">
              {overlay.firstDate} → {overlay.lastDate}
            </span>
          </div>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${overlay.W} ${overlay.H}`}
              className="w-full max-w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Y-axis grid lines + labels */}
              {[overlay.yMin, (overlay.yMin + overlay.yMax) / 2, overlay.yMax].map((v) => {
                const y = overlay.yCoord(v);
                return (
                  <g key={v}>
                    <line x1={overlay.PAD_L} x2={overlay.W - overlay.PAD_R} y1={y} y2={y} stroke="var(--color-border, #2a3236)" strokeDasharray="3,3" />
                    <text x={overlay.PAD_L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--color-text-muted, #888)">
                      {v.toFixed(0)}
                    </text>
                  </g>
                );
              })}
              {/* Baseline at y=100 */}
              <line
                x1={overlay.PAD_L}
                x2={overlay.W - overlay.PAD_R}
                y1={overlay.yCoord(100)}
                y2={overlay.yCoord(100)}
                stroke="var(--color-accent, #2dd4bf)"
                strokeDasharray="2,4"
                opacity={0.4}
              />
              {/* Per-mode equity polylines */}
              {overlay.normalized.map((curve) => (
                <polyline
                  key={curve.mode}
                  fill="none"
                  stroke={MODE_COLORS[curve.mode] ?? "#888"}
                  strokeWidth={curve.mode === "adaptive" ? 2.5 : 1.5}
                  opacity={curve.mode === "adaptive" ? 1 : 0.7}
                  points={curve.points.map((p, i) => `${overlay.xCoord(i, curve.points.length)},${overlay.yCoord(p.v)}`).join(" ")}
                />
              ))}
            </svg>
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {overlay.normalized.map((c) => (
              <span key={c.mode} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: MODE_COLORS[c.mode] ?? "#888" }}
                />
                <span className="text-text-secondary">{c.mode}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Adaptive mode timeline (when available) */}
      {data && data.results.find((r) => r.mode === "adaptive" && r.result?.modeTimeline?.length) && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-2">Adaptive mode timeline</h3>
          <p className="text-xs text-text-muted mb-3">
            Which underlying mode adaptive was running at each regime change. Stays at the previous mode until a swap fires.
          </p>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {data.results
              .find((r) => r.mode === "adaptive")!
              .result!.modeTimeline!.map((entry, idx) => (
                <span key={`${entry.date}-${idx}`} className="inline-flex items-center gap-1.5">
                  <span className="text-text-muted">{entry.date}</span>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: MODE_COLORS[entry.mode] ?? "#888" }}
                  />
                  <span className="text-text-primary">{entry.mode}</span>
                  {idx < data.results.find((r) => r.mode === "adaptive")!.result!.modeTimeline!.length - 1 && (
                    <span className="text-text-muted">→</span>
                  )}
                </span>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
