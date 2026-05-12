"use client";

// Portfolio overview — replaces the old 1-line redirect with a real page.
// Aggregates manual paper portfolios + live broker positions, shows
// allocation by sector + by position, and surfaces winners/losers.
//
// Distinct from /dashboard/trader (engine-focused, real-time positions)
// and /dashboard/tax-center (lot-focused, tax accounting). This is the
// "where am I overall" view.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SymbolLink } from "@/components/ui/symbol-link";
import { PageIntro } from "@/components/layout/page-intro";
import { Briefcase, TrendingUp, TrendingDown, PieChart, ArrowRight } from "lucide-react";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";
import { getSymbolSector } from "@/lib/sectors";

interface Summary {
  total: number;
  manual: {
    total: number;
    portfolios: { id: string; name: string; value: number }[];
  };
  broker: {
    total: number;
    positions: {
      symbol: string;
      qty: number;
      marketValue: number;
      unrealizedPnl: number;
    }[];
    cacheAge: number | null;
  };
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: "#3b82f6",
  Healthcare: "#10b981",
  Financials: "#f59e0b",
  Communication: "#8b5cf6",
  "Consumer Discretionary": "#ec4899",
  "Consumer Staples": "#06b6d4",
  Energy: "#ef4444",
  Industrials: "#84cc16",
  Materials: "#a855f7",
  Utilities: "#64748b",
  "Real Estate": "#f97316",
  Unknown: "#94a3b8",
};

export default function PortfolioPage() {
  const { pnlFormat } = useDisplayPrefs();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio/summary")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setSummary(data);
      })
      .catch(() => {
        /* non-critical */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sectorAllocation = useMemo(() => {
    if (!summary) return [];
    const map = new Map<string, number>();
    for (const p of summary.broker.positions) {
      const sector = getSymbolSector(p.symbol);
      map.set(sector, (map.get(sector) ?? 0) + p.marketValue);
    }
    const total = summary.broker.total;
    return Array.from(map.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const sortedPositions = useMemo(() => {
    if (!summary) return [];
    return [...summary.broker.positions].sort(
      (a, b) => b.unrealizedPnl - a.unrealizedPnl
    );
  }, [summary]);

  const topWinners = sortedPositions.filter((p) => p.unrealizedPnl > 0).slice(0, 5);
  const topLosers = sortedPositions
    .filter((p) => p.unrealizedPnl < 0)
    .slice(-5)
    .reverse();

  const totalUnrealized = sortedPositions.reduce(
    (s, p) => s + p.unrealizedPnl,
    0
  );

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-24" rounded="lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" rounded="lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-4 lg:p-6">
        <EmptyState
          icon={<Briefcase className="w-12 h-12" />}
          title="No portfolio data"
          description="Connect a broker or create a paper portfolio to see your overview."
        />
      </div>
    );
  }

  const hasManual = summary.manual.portfolios.length > 0;
  const hasBroker = summary.broker.positions.length > 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Portfolio"
        title="Overview"
        description="Aggregate value across paper portfolios and live broker positions. For engine-driven trading detail see Trader; for tax-lot detail see Tax Center."
        stats={[
          { label: "Total Value", value: `$${summary.total.toFixed(2)}`, tone: "brand" },
          { label: "Manual", value: `$${summary.manual.total.toFixed(2)}` },
          { label: "Broker (Live)", value: `$${summary.broker.total.toFixed(2)}` },
          {
            label: "Unrealized P&L",
            value: formatPnl(totalUnrealized, summary.broker.total, pnlFormat),
            tone: totalUnrealized >= 0 ? "bullish" : "bearish",
          },
        ]}
      />

      {!hasManual && !hasBroker && (
        <EmptyState
          icon={<Briefcase className="w-12 h-12" />}
          title="Nothing to show yet"
          description="Add a paper portfolio or connect a broker to populate this overview."
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {sectorAllocation.length > 0 && (
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-accent" />
                Sector allocation
              </CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {sectorAllocation.map((s) => (
                <div key={s.sector} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{s.sector}</span>
                    <span className="font-mono text-text-primary">
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-elevated overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${s.pct}%`,
                        backgroundColor: SECTOR_COLORS[s.sector] ?? SECTOR_COLORS.Unknown,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    ${s.value.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {topWinners.length > 0 && (
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-bullish" />
                Top winners
              </CardTitle>
            </CardHeader>
            <div className="space-y-1.5">
              {topWinners.map((p) => {
                const cost = p.marketValue - p.unrealizedPnl;
                return (
                  <div
                    key={p.symbol}
                    className="flex items-center justify-between p-2 rounded-lg bg-bg-elevated"
                  >
                    <SymbolLink symbol={p.symbol} className="text-sm font-medium" />
                    <span className="font-mono text-sm text-bullish">
                      {formatPnl(p.unrealizedPnl, cost, pnlFormat)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {topLosers.length > 0 && (
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-bearish" />
                Top losers
              </CardTitle>
            </CardHeader>
            <div className="space-y-1.5">
              {topLosers.map((p) => {
                const cost = p.marketValue - p.unrealizedPnl;
                return (
                  <div
                    key={p.symbol}
                    className="flex items-center justify-between p-2 rounded-lg bg-bg-elevated"
                  >
                    <SymbolLink symbol={p.symbol} className="text-sm font-medium" />
                    <span className="font-mono text-sm text-bearish">
                      {formatPnl(p.unrealizedPnl, cost, pnlFormat)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasManual && (
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Paper portfolios</CardTitle>
            </CardHeader>
            <div className="space-y-1.5">
              {summary.manual.portfolios.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/paper-trading?id=${p.id}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-bg-elevated hover:bg-bg-hover transition-colors"
                >
                  <span className="text-sm text-text-primary">{p.name}</span>
                  <span className="font-mono text-sm">${p.value.toFixed(2)}</span>
                </Link>
              ))}
              <Link
                href="/dashboard/paper-trading"
                className="flex min-h-[36px] items-center justify-center gap-1 pt-2 text-[11px] uppercase tracking-[0.08em] text-accent transition-colors hover:text-accent-hover"
              >
                Manage portfolios <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>
        )}
        {hasBroker && (
          <Card>
            <CardHeader className="p-0 pb-3">
              <CardTitle>Live broker positions</CardTitle>
              {summary.broker.cacheAge !== null && (
                <Badge variant="neutral" className="text-[10px]">
                  cache {Math.floor(summary.broker.cacheAge / 60)}m old
                </Badge>
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left text-xs uppercase tracking-wide">
                    <th className="pb-2 pr-3 font-medium">Symbol</th>
                    <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                    <th className="pb-2 pr-3 font-medium text-right">Value</th>
                    <th className="pb-2 font-medium text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {summary.broker.positions.map((p) => {
                    const cost = p.marketValue - p.unrealizedPnl;
                    return (
                      <tr key={p.symbol} className="border-b border-border/50">
                        <td className="py-2 pr-3">
                          <SymbolLink symbol={p.symbol} className="text-text-primary" />
                        </td>
                        <td className="py-2 pr-3 text-right">{p.qty}</td>
                        <td className="py-2 pr-3 text-right">${p.marketValue.toFixed(2)}</td>
                        <td
                          className={`py-2 text-right ${
                            p.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
                          }`}
                        >
                          {formatPnl(p.unrealizedPnl, cost, pnlFormat)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
