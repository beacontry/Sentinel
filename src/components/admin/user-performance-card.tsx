"use client";

// Per-user performance dashboard. Surfaces tier, engine status, today's
// P&L, lifetime P&L, win rate, trade count, and last-activity timestamps
// for every user. Sortable by P&L / activity. Lets the admin spot:
//   - Users whose engine is running but hasn't scanned recently (stale)
//   - Users with degrading win rate
//   - Users with the most realized P&L (validate engine across cohorts)
//   - Users with stale activity (haven't traded in a while)

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, AlertTriangle, ArrowUpDown } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";

interface UserRow {
  user: { id: string; email: string; name: string | null; role: string; tier: string | null; createdAt: string };
  engine: {
    running: boolean;
    halted: boolean;
    mode: string;
    effectiveMode: string | null;
    environment: "paper" | "live" | null;
    brokerConnected: boolean;
    positionCount: number;
    lastScanAt: string | null;
  } | null;
  today: { tradesCount: number; realizedPnl: number };
  open: { unrealizedPnl: number | null; marketValue: number | null; fetchedAt: string | null };
  lifetime: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    realizedPnl: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
  };
  activity: { lastTradeAt: string | null; lastHeartbeatAt: string | null; serviceMode: string | null };
}

type SortKey = "openPnl" | "todayPnl" | "lifetimePnl" | "winRate" | "trades" | "lastTrade";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function pnlClass(n: number): string {
  if (n > 0) return "text-bullish";
  if (n < 0) return "text-bearish";
  return "text-text-muted";
}

function engineStatusBadge(engine: UserRow["engine"]): React.ReactNode {
  if (!engine) return <Badge variant="neutral">no engine</Badge>;
  if (engine.halted) return <Badge variant="bearish">halted</Badge>;
  if (!engine.running) return <Badge variant="neutral">stopped</Badge>;
  if (!engine.brokerConnected) return <Badge variant="warning">broker down</Badge>;
  return <Badge variant="bullish">running</Badge>;
}

/**
 * Engines that claim to be running but have no recent scan (>30 min during
 * any time of day) get a yellow ⚠ flag in the activity column. Catches the
 * scan-hang condition the operator wants to spot early.
 */
function isStaleEngine(engine: UserRow["engine"]): boolean {
  if (!engine || !engine.running || engine.halted) return false;
  if (!engine.lastScanAt) return true;
  const ageMs = Date.now() - new Date(engine.lastScanAt).getTime();
  return ageMs > 30 * 60 * 1000;
}

export function UserPerformanceCard() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lifetimePnl");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/user-performance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(load, POLLING_INTERVALS.dashboardRefresh);

  const sortedRows = useMemo(() => {
    const direction = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      let av: number;
      let bv: number;
      switch (sortKey) {
        case "openPnl":
          av = a.open.unrealizedPnl ?? -Infinity;
          bv = b.open.unrealizedPnl ?? -Infinity;
          break;
        case "todayPnl":
          av = a.today.realizedPnl;
          bv = b.today.realizedPnl;
          break;
        case "lifetimePnl":
          av = a.lifetime.realizedPnl;
          bv = b.lifetime.realizedPnl;
          break;
        case "winRate":
          av = a.lifetime.winRate;
          bv = b.lifetime.winRate;
          break;
        case "trades":
          av = a.lifetime.totalTrades;
          bv = b.lifetime.totalTrades;
          break;
        case "lastTrade":
          av = a.activity.lastTradeAt ? new Date(a.activity.lastTradeAt).getTime() : 0;
          bv = b.activity.lastTradeAt ? new Date(b.activity.lastTradeAt).getTime() : 0;
          break;
      }
      return (av - bv) * direction;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortableTh = (key: SortKey, label: string, alignRight = true): React.ReactNode => (
    <th className={`pb-2 ${alignRight ? "text-right pr-4" : "pr-4 text-left"} font-medium`}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 hover:text-text-primary transition-colors ${
          sortKey === key ? "text-text-primary" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Per-user performance</h2>
        </div>
        <div className="text-xs text-text-muted">
          {!loading && `${rows.length} users`}
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-bearish py-3">
          <AlertTriangle className="w-4 h-4" />
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-text-muted py-6 text-center">No users with trade history yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="pb-2 pr-4 font-medium">User</th>
                <th className="pb-2 pr-4 font-medium">Tier</th>
                <th className="pb-2 pr-4 font-medium">Engine</th>
                <th className="pb-2 pr-4 font-medium text-right">Pos</th>
                {sortableTh("openPnl", "Open P&L")}
                {sortableTh("todayPnl", "Today P&L")}
                {sortableTh("lifetimePnl", "Lifetime P&L")}
                {sortableTh("winRate", "Win %")}
                {sortableTh("trades", "Trades")}
                {sortableTh("lastTrade", "Last trade")}
              </tr>
            </thead>
            <tbody className="font-mono">
              {sortedRows.map((row) => {
                const stale = isStaleEngine(row.engine);
                const tierVariant =
                  row.user.tier === "premium" ? "bullish"
                  : row.user.tier === "trader" ? "default"
                  : row.user.tier === "enterprise" ? "warning"
                  : "neutral";
                return (
                  <tr
                    key={row.user.id}
                    className="border-b border-border/50 hover:bg-bg-hover transition-colors"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/dashboard/admin/users/${row.user.id}`}
                        className="text-text-primary hover:text-accent transition-colors"
                      >
                        <div className="font-sans truncate max-w-[180px]">
                          {row.user.email}
                        </div>
                        {row.user.name && (
                          <div className="text-[11px] text-text-muted font-sans truncate max-w-[180px]">
                            {row.user.name}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={tierVariant}>{row.user.tier ?? "free"}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1.5">
                        {engineStatusBadge(row.engine)}
                        {row.engine && (
                          <span className="text-[11px] text-text-muted font-sans">
                            {row.engine.environment === "live" ? "live" : "paper"} · {row.engine.effectiveMode ?? row.engine.mode}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right">{row.engine?.positionCount ?? 0}</td>
                    <td className={`py-2 pr-4 text-right ${row.open.unrealizedPnl === null ? "text-text-muted" : pnlClass(row.open.unrealizedPnl)}`}>
                      {row.open.unrealizedPnl === null ? "—" : fmtMoney(row.open.unrealizedPnl)}
                    </td>
                    <td className={`py-2 pr-4 text-right ${pnlClass(row.today.realizedPnl)}`}>
                      {row.today.tradesCount > 0 ? fmtMoney(row.today.realizedPnl) : "—"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${pnlClass(row.lifetime.realizedPnl)}`}>
                      {row.lifetime.totalTrades > 0 ? fmtMoney(row.lifetime.realizedPnl) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-text-secondary">
                      {row.lifetime.totalTrades > 0 ? `${row.lifetime.winRate.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-text-secondary">
                      {row.lifetime.totalTrades || "—"}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {stale && (
                          <span title="Engine claims running but no scan in 30+ min">
                            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                          </span>
                        )}
                        <span className="text-text-secondary">
                          {fmtTimeAgo(row.activity.lastTradeAt)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
