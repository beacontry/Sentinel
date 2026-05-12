"use client";

// Compare 2–5 saved backtest strategies side-by-side. Picks load from the
// user's saved strategies; results show as parallel columns with the
// existing BacktestChart used as an equity-curve overlay.
//
// URL: /dashboard/backtest/compare?ids=a,b,c — auto-loads those IDs
// (deep-linkable from the backtest page or a future "share" button).

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIntro } from "@/components/layout/page-intro";
import { ArrowLeft, X, Plus, BarChart3 } from "lucide-react";

interface StrategyRow {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
  lastRunAt: string | null;
  lastResult: BacktestResult | null;
}

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
}

interface SavedStrategySummary {
  id: string;
  name: string;
  description: string | null;
  lastRunAt: string | null;
}

export default function ComparePageWrapper() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <ComparePage />
    </Suspense>
  );
}

function ComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idsFromUrl = useMemo(
    () => (searchParams.get("ids") ?? "").split(",").filter(Boolean),
    [searchParams]
  );

  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [allSaved, setAllSaved] = useState<SavedStrategySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  // Fetch the picked strategies + the full saved-strategies list
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [compareRes, listRes] = await Promise.all([
          idsFromUrl.length > 0
            ? fetch(`/api/backtest/compare?ids=${idsFromUrl.join(",")}`)
            : Promise.resolve(null),
          fetch("/api/strategies"),
        ]);
        if (cancelled) return;
        if (compareRes && compareRes.ok) {
          const data = await compareRes.json();
          setStrategies(data.strategies ?? []);
        }
        if (listRes.ok) {
          const data = await listRes.json();
          setAllSaved(data.strategies ?? []);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [idsFromUrl]);

  function addStrategy(id: string) {
    const next = [...idsFromUrl, id].slice(0, 5);
    router.push(`/dashboard/backtest/compare?ids=${next.join(",")}`);
    setPicking(false);
  }

  function removeStrategy(id: string) {
    const next = idsFromUrl.filter((x) => x !== id);
    if (next.length === 0) {
      router.push("/dashboard/backtest/compare");
    } else {
      router.push(`/dashboard/backtest/compare?ids=${next.join(",")}`);
    }
  }

  const availableToAdd = allSaved.filter(
    (s) => !idsFromUrl.includes(s.id) && allSaved.length > 0
  );

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/backtest" className="text-text-muted hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <p className="text-sm text-text-muted">Backtest</p>
      </div>

      <PageIntro
        eyebrow="Backtest"
        title="Compare strategies"
        description="Side-by-side returns, drawdown, and risk-adjusted metrics across up to 5 saved strategies."
        stats={[
          { label: "Selected", value: strategies.length, tone: "brand" },
          { label: "Available", value: allSaved.length },
        ]}
      />

      {/* Add / picker */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {strategies.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/30 px-3 py-1 text-xs"
            >
              <span className="text-text-primary">{s.name}</span>
              <button
                onClick={() => removeStrategy(s.id)}
                className="text-text-muted hover:text-bearish"
                aria-label={`Remove ${s.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {idsFromUrl.length < 5 && (
            <Button variant="secondary" size="sm" onClick={() => setPicking((v) => !v)}>
              <Plus className="w-3.5 h-3.5" />
              Add strategy
            </Button>
          )}
        </div>
        {picking && availableToAdd.length > 0 && (
          <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
            {availableToAdd.map((s) => (
              <button
                key={s.id}
                onClick={() => addStrategy(s.id)}
                className="block w-full text-left rounded-lg px-3 py-2 hover:bg-bg-hover transition-colors"
              >
                <div className="text-sm text-text-primary">{s.name}</div>
                {s.description && (
                  <div className="text-xs text-text-muted line-clamp-1">{s.description}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {picking && availableToAdd.length === 0 && (
          <p className="text-xs text-text-muted mt-3">No more strategies to add.</p>
        )}
      </Card>

      {/* Comparison */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48" rounded="lg" />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-10 h-10" />}
          title="Pick 2–5 saved strategies to compare"
          description="Run backtests on the main Backtest page and save them as named strategies. They'll appear here for side-by-side comparison."
          action={{ label: "Go to backtest", onClick: () => router.push("/dashboard/backtest") }}
        />
      ) : (
        <>
          {/* Stats grid — one column per strategy */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {strategies.map((s) => {
              const r = s.lastResult;
              if (!r) {
                return (
                  <Card key={s.id} className="space-y-2">
                    <div className="font-semibold text-text-primary">{s.name}</div>
                    <p className="text-xs text-text-muted">No backtest run yet.</p>
                  </Card>
                );
              }
              return (
                <Card key={s.id}>
                  <div className="font-semibold text-text-primary mb-1">{s.name}</div>
                  <div className="text-[10px] text-text-muted mb-3">
                    Last run: {s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : "—"}
                  </div>
                  <div className="space-y-1.5 text-sm font-mono">
                    <StatRow
                      label="Return"
                      value={`${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}%`}
                      tone={r.totalReturn >= 0 ? "bullish" : "bearish"}
                    />
                    <StatRow label="Win Rate" value={`${Math.round(r.winRate * 100)}%`} />
                    <StatRow label="Trades" value={String(r.totalTrades)} />
                    <StatRow
                      label="Max DD"
                      value={`-${r.maxDrawdown.toFixed(1)}%`}
                      tone="bearish"
                    />
                    <StatRow label="Sharpe" value={r.sharpeRatio.toFixed(2)} />
                    {r.sortinoRatio !== undefined && (
                      <StatRow label="Sortino" value={r.sortinoRatio.toFixed(2)} />
                    )}
                    {r.calmarRatio !== undefined && (
                      <StatRow label="Calmar" value={r.calmarRatio.toFixed(2)} />
                    )}
                    {r.marRatio !== undefined && (
                      <StatRow label="MAR" value={r.marRatio.toFixed(2)} />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Equity curve overlay — a tiny inline SVG since the existing
              BacktestChart only accepts one curve at a time */}
          <Card>
            <div className="text-sm font-semibold text-text-primary mb-3">Equity curve overlay</div>
            <EquityOverlay strategies={strategies} />
          </Card>
        </>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bullish" | "bearish";
}) {
  const color =
    tone === "bullish" ? "text-bullish" : tone === "bearish" ? "text-bearish" : "text-text-primary";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

const OVERLAY_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"];

function EquityOverlay({ strategies }: { strategies: StrategyRow[] }) {
  // Normalize each curve to start at 100 so different starting balances
  // can be compared on the same axis. SVG-only, no charting library.
  const curves = strategies
    .map((s, i) => {
      const r = s.lastResult;
      if (!r || !r.equityCurve || r.equityCurve.length < 2) return null;
      const startValue = r.equityCurve[0].value;
      if (startValue <= 0) return null;
      return {
        name: s.name,
        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
        points: r.equityCurve.map((p) => ({
          date: p.date,
          normalized: (p.value / startValue) * 100,
        })),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (curves.length === 0) {
    return <p className="text-xs text-text-muted py-8 text-center">No equity curves to overlay.</p>;
  }

  // Find global min / max across all curves
  let minY = Infinity;
  let maxY = -Infinity;
  let maxLen = 0;
  for (const c of curves) {
    maxLen = Math.max(maxLen, c.points.length);
    for (const p of c.points) {
      if (p.normalized < minY) minY = p.normalized;
      if (p.normalized > maxY) maxY = p.normalized;
    }
  }
  const padY = (maxY - minY) * 0.05;
  minY -= padY;
  maxY += padY;

  const width = 800;
  const height = 280;
  const padding = 30;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  function x(i: number, total: number): number {
    return padding + (i / Math.max(1, total - 1)) * innerW;
  }
  function y(v: number): number {
    return padding + (1 - (v - minY) / (maxY - minY)) * innerH;
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        {/* Baseline at 100 (start = breakeven) */}
        <line
          x1={padding}
          x2={width - padding}
          y1={y(100)}
          y2={y(100)}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeDasharray="4 4"
        />
        <text
          x={padding + 4}
          y={y(100) - 4}
          fontSize="10"
          className="fill-text-muted"
        >
          start
        </text>
        {curves.map((c, idx) => {
          const path = c.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i, c.points.length)} ${y(p.normalized)}`)
            .join(" ");
          return (
            <g key={idx}>
              <path d={path} fill="none" stroke={c.color} strokeWidth="2" />
              <text
                x={width - padding - 100}
                y={padding + 14 + idx * 14}
                fontSize="11"
                fill={c.color}
              >
                {c.name}
              </text>
              <circle
                cx={width - padding - 108}
                cy={padding + 10 + idx * 14}
                r={4}
                fill={c.color}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
