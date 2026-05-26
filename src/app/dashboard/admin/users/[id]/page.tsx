"use client";

// Per-user admin drilldown. Linked from /dashboard/admin's per-user
// performance card. Shows everything an admin needs to investigate a
// specific user's engine + trades + audit trail without SSH'ing the
// prod DB.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageIntro } from "@/components/layout/page-intro";
import {
  ArrowLeft,
  AlertTriangle,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Bot,
  Shield,
  BarChart3,
} from "lucide-react";

interface UserDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tier: string | null;
    tierExpiresAt: string | null;
    createdAt: string;
    liveTradingEnabled: boolean;
  };
  connection: {
    label: string;
    broker: string;
    environment: string;
    lastConnectedAt: string | null;
  } | null;
  engine: {
    running: boolean;
    halted: boolean;
    mode: string;
    effectiveMode: string | null;
    environment: "paper" | "live" | null;
    brokerConnected: boolean;
    positionCount: number;
    scanCount: number;
    dailyLoss: number;
    lastScanAt: string | null;
    scanStartedAt: string | null;
    errors: string[];
    adaptiveRegime: unknown;
  } | null;
  lifetime: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    realizedPnl: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
    firstTradeAt: string | null;
    lastTradeAt: string | null;
  };
  today: { tradesCount: number; realizedPnl: number };
  recentTrades: Array<{
    id: string;
    symbol: string;
    action: string;
    signal: string;
    quantity: number;
    fillPrice: number | null;
    status: string;
    pnl: number | null;
    fillTime: string | null;
    createdAt: string;
    notes: string | null;
    brokerOrderId: string | null;
  }>;
  dailyPnl: Array<{
    date: string;
    realizedPnl: number;
    unrealizedPnl: number;
    tradesCount: number;
    halted: boolean;
    haltReason: string | null;
  }>;
  audits: Array<{
    id: number;
    createdAt: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
  }>;
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function pnlClass(n: number | null): string {
  if (n == null) return "text-text-muted";
  if (n > 0) return "text-bullish";
  if (n < 0) return "text-bearish";
  return "text-text-muted";
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/users/${userId}/detail`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error("Forbidden — admin only");
          if (res.status === 404) throw new Error("User not found");
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "load failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-4 lg:p-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to admin
        </Link>
        <Card>
          <div className="flex items-center gap-2 text-bearish py-3">
            <AlertTriangle className="w-5 h-5" />
            <span>{error ?? "User not found"}</span>
          </div>
        </Card>
      </div>
    );
  }

  const { user, connection, engine, lifetime, today, recentTrades, dailyPnl, audits } = detail;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to admin
      </Link>

      <PageIntro
        eyebrow={user.name ?? undefined}
        title={user.email}
        description={`Member since ${new Date(user.createdAt).toLocaleDateString()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={user.tier === "premium" ? "bullish" : user.tier === "trader" ? "default" : "neutral"}>
              {user.tier ?? "free"}
            </Badge>
            <Badge variant={user.role === "admin" ? "warning" : "neutral"}>{user.role}</Badge>
            {user.liveTradingEnabled && <Badge variant="bearish">LIVE</Badge>}
          </div>
        }
      />

      {/* ── Snapshot grid: connection + engine state ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">Broker connection</h3>
          </div>
          {connection ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Broker</span>
                <span className="font-mono">{connection.broker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Environment</span>
                <Badge variant={connection.environment === "live" ? "bearish" : "neutral"}>
                  {connection.environment}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Label</span>
                <span className="font-mono text-xs">{connection.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Last connected</span>
                <span className="font-mono text-xs">{fmtTimeAgo(connection.lastConnectedAt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">No active broker connection.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">Engine state</h3>
          </div>
          {engine ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Status</span>
                {engine.halted ? (
                  <Badge variant="bearish">halted</Badge>
                ) : engine.running ? (
                  <Badge variant="bullish">running</Badge>
                ) : (
                  <Badge variant="neutral">stopped</Badge>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Mode</span>
                <span className="font-mono">{engine.effectiveMode ?? engine.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Broker connected</span>
                <span className={engine.brokerConnected ? "text-bullish" : "text-bearish"}>
                  {engine.brokerConnected ? "yes" : "no"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Open positions</span>
                <span className="font-mono">{engine.positionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Scans this session</span>
                <span className="font-mono">{engine.scanCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Last scan</span>
                <span className="font-mono text-xs">{fmtTimeAgo(engine.lastScanAt)}</span>
              </div>
              {engine.scanStartedAt && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Scan in flight since</span>
                  <span className="font-mono text-xs text-warning">{fmtTimeAgo(engine.scanStartedAt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Daily loss</span>
                <span className={`font-mono ${engine.dailyLoss < 0 ? "text-bearish" : "text-text-secondary"}`}>
                  ${engine.dailyLoss.toFixed(2)}
                </span>
              </div>
              {engine.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-xs text-text-muted mb-1">Recent errors</div>
                  <ul className="space-y-1">
                    {engine.errors.map((e, i) => (
                      <li key={i} className="text-xs text-bearish font-mono truncate" title={e}>
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No engine instance — user has never started.</p>
          )}
        </Card>
      </div>

      {/* ── Performance metrics ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Performance</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Stat label="Trades today" value={today.tradesCount.toString()} />
          <Stat
            label="Today P&L"
            value={today.tradesCount > 0 ? fmtMoney(today.realizedPnl) : "—"}
            tone={today.realizedPnl >= 0 ? "positive" : "negative"}
          />
          <Stat label="Total trades" value={lifetime.totalTrades.toString()} />
          <Stat
            label="Lifetime P&L"
            value={lifetime.totalTrades > 0 ? fmtMoney(lifetime.realizedPnl) : "—"}
            tone={lifetime.realizedPnl >= 0 ? "positive" : "negative"}
          />
          <Stat
            label="Win rate"
            value={lifetime.totalTrades > 0 ? `${lifetime.winRate.toFixed(1)}%` : "—"}
          />
          <Stat
            label="Profit factor"
            value={
              lifetime.totalTrades > 0
                ? lifetime.profitFactor === 999
                  ? "∞"
                  : lifetime.profitFactor.toFixed(2)
                : "—"
            }
          />
          <Stat label="Wins" value={lifetime.wins.toString()} tone="positive" />
          <Stat label="Losses" value={lifetime.losses.toString()} tone="negative" />
          <Stat label="Avg win" value={fmtMoney(lifetime.avgWin)} tone="positive" />
          <Stat label="Avg loss" value={fmtMoney(-lifetime.avgLoss)} tone="negative" />
          <Stat label="Gross profit" value={fmtMoney(lifetime.grossProfit)} tone="positive" />
          <Stat label="Gross loss" value={fmtMoney(-lifetime.grossLoss)} tone="negative" />
        </div>
        {lifetime.firstTradeAt && (
          <div className="text-xs text-text-muted mt-4">
            First trade: {fmtDateTime(lifetime.firstTradeAt)} · Last trade: {fmtDateTime(lifetime.lastTradeAt)}
          </div>
        )}
      </Card>

      {/* ── Daily P&L (last 30 days) ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Daily P&L — last 30 days</h3>
        </div>
        {dailyPnl.length === 0 ? (
          <p className="text-sm text-text-muted">No daily P&L recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium text-right">Realized</th>
                  <th className="pb-2 pr-4 font-medium text-right">Unrealized</th>
                  <th className="pb-2 pr-4 font-medium text-right">Trades</th>
                  <th className="pb-2 font-medium">Halt</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {dailyPnl.map((d) => (
                  <tr key={d.date} className="border-b border-border/50">
                    <td className="py-2 pr-4">{d.date}</td>
                    <td className={`py-2 pr-4 text-right ${pnlClass(d.realizedPnl)}`}>
                      {fmtMoney(d.realizedPnl)}
                    </td>
                    <td className={`py-2 pr-4 text-right ${pnlClass(d.unrealizedPnl)}`}>
                      {fmtMoney(d.unrealizedPnl)}
                    </td>
                    <td className="py-2 pr-4 text-right">{d.tradesCount}</td>
                    <td className="py-2">
                      {d.halted ? (
                        <span className="text-bearish text-xs" title={d.haltReason ?? ""}>
                          ⛔ {d.haltReason ?? "halted"}
                        </span>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Recent trades (last 50) ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Recent trades — last 50</h3>
        </div>
        {recentTrades.length === 0 ? (
          <p className="text-sm text-text-muted">No trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Signal</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                  <th className="pb-2 pr-4 font-medium text-right">Fill</th>
                  <th className="pb-2 pr-4 font-medium text-right">P&L</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {recentTrades.map((t) => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-xs text-text-secondary">
                      {fmtTimeAgo(t.fillTime ?? t.createdAt)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-text-primary">{t.symbol}</td>
                    <td className="py-2 pr-4">
                      <span className={t.action === "BUY" ? "text-bullish" : "text-bearish"}>
                        {t.action}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-text-secondary truncate max-w-[160px]" title={t.signal}>
                      {t.signal}
                    </td>
                    <td className="py-2 pr-4 text-right">{t.quantity}</td>
                    <td className="py-2 pr-4 text-right">
                      {t.fillPrice != null ? `$${t.fillPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${pnlClass(t.pnl)}`}>
                      {t.pnl != null ? fmtMoney(t.pnl) : "—"}
                    </td>
                    <td className="py-2">
                      <Badge
                        variant={
                          t.status === "FILLED"
                            ? "bullish"
                            : t.status === "PENDING"
                              ? "neutral"
                              : t.status === "FAILED"
                                ? "bearish"
                                : "warning"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Recent audit events (last 25) ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Recent audit events — last 25</h3>
        </div>
        {audits.length === 0 ? (
          <p className="text-sm text-text-muted">No audit events recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Resource</th>
                  <th className="pb-2 pr-4 font-medium">IP</th>
                  <th className="pb-2 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {audits.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-xs text-text-secondary">{fmtTimeAgo(a.createdAt)}</td>
                    <td className="py-2 pr-4">{a.action}</td>
                    <td className="py-2 pr-4 text-xs text-text-secondary">
                      {a.resourceType ?? "—"}
                      {a.resourceId && `:${a.resourceId.slice(0, 16)}`}
                    </td>
                    <td className="py-2 pr-4 text-xs text-text-muted">{a.ip ?? "—"}</td>
                    <td className="py-2 text-xs text-text-muted max-w-[300px] truncate" title={a.metadata ? JSON.stringify(a.metadata) : ""}>
                      {a.metadata ? JSON.stringify(a.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-bullish"
      : tone === "negative"
        ? "text-bearish"
        : "text-text-primary";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-text-muted mb-1">{label}</div>
      <div className={`text-lg font-mono font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
