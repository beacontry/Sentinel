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
import { SymbolLink } from "@/components/ui/symbol-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { PageIntro } from "@/components/layout/page-intro";
import { Briefcase, TrendingUp, TrendingDown, PieChart, ArrowRight, Plus } from "lucide-react";
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
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline portfolio creation. User previously hit a dead-end empty
  // state telling them to "create a paper portfolio" with no UI to
  // actually do so. Now the empty state IS the create form.
  const [showCreate, setShowCreate] = useState(false);
  const [creatingName, setCreatingName] = useState("");
  const [creatingCash, setCreatingCash] = useState("10000");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const name = creatingName.trim();
    const cash = Number(creatingCash);
    if (!name) {
      toast({ type: "error", message: "Give your portfolio a name." });
      return;
    }
    if (!Number.isFinite(cash) || cash < 100 || cash > 1000000) {
      toast({ type: "error", message: "Initial cash must be between $100 and $1,000,000." });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, initialCash: cash }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ type: "error", message: data?.error ?? "Failed to create portfolio" });
        return;
      }
      const data = await res.json();
      toast({
        type: "success",
        message: `Created '${name}' with $${cash.toLocaleString()} cash`,
      });
      setShowCreate(false);
      setCreatingName("");
      setCreatingCash("10000");
      // Redirect to the paper-trading manage page so the user can add
      // positions right away — paper-trading currently redirects to
      // /trader, but the portfolio ID is needed for trade entry. Send
      // them to the tax-center where positions can be added (or
      // refresh the summary to show the new portfolio).
      void data;
      // Simple refresh — the new (empty) portfolio will surface in
      // summary.manual.portfolios.
      try {
        const refresh = await fetch("/api/portfolio/summary");
        if (refresh.ok) setSummary(await refresh.json());
      } catch {
        /* non-critical */
      }
    } catch {
      toast({ type: "error", message: "Network error creating portfolio" });
    } finally {
      setCreating(false);
    }
  }

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
        <CreatePortfolioCard
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          creatingName={creatingName}
          setCreatingName={setCreatingName}
          creatingCash={creatingCash}
          setCreatingCash={setCreatingCash}
          creating={creating}
          onCreate={handleCreate}
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
        <CreatePortfolioCard
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          creatingName={creatingName}
          setCreatingName={setCreatingName}
          creatingCash={creatingCash}
          setCreatingCash={setCreatingCash}
          creating={creating}
          onCreate={handleCreate}
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

// ─── Create portfolio card ────────────────────────────────────────────
//
// Replaces the old dead-end EmptyState that told users "create a paper
// portfolio" with no UI to actually do so. Inline form: name + initial
// cash, POST /api/portfolio, summary auto-refreshes.

interface CreatePortfolioCardProps {
  showCreate: boolean;
  setShowCreate: (v: boolean) => void;
  creatingName: string;
  setCreatingName: (v: string) => void;
  creatingCash: string;
  setCreatingCash: (v: string) => void;
  creating: boolean;
  onCreate: () => Promise<void> | void;
}

function CreatePortfolioCard({
  showCreate,
  setShowCreate,
  creatingName,
  setCreatingName,
  creatingCash,
  setCreatingCash,
  creating,
  onCreate,
}: CreatePortfolioCardProps) {
  return (
    <Card className="border-accent/30 bg-accent/[0.04]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
            <Briefcase className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-text-primary">
              Set up a paper portfolio
            </h3>
            <p className="mt-0.5 text-sm text-text-secondary">
              Track manual entries (long-term holdings, hypothetical positions, simulated trades)
              alongside any live broker connection. Cash + cost basis only; no real money.
            </p>
          </div>
        </div>

        {!showCreate ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create paper portfolio
            </Button>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors px-3 py-2"
            >
              …or connect a live broker <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Portfolio name"
                value={creatingName}
                onChange={(e) => setCreatingName(e.target.value)}
                placeholder="e.g. Long-term holds"
                autoFocus
              />
            </div>
            <div className="sm:w-44">
              <Input
                label="Initial cash"
                value={creatingCash}
                onChange={(e) => setCreatingCash(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="10000"
                inputMode="decimal"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={onCreate} loading={creating} disabled={!creatingName.trim()}>
                Create
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false);
                  setCreatingName("");
                  setCreatingCash("10000");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
