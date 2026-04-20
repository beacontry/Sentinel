"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/ui/signal-badge";
import type { SignalType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  Bot,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Square,
  Play,
  XCircle,
  Settings,
} from "lucide-react";

interface TraderData {
  status: {
    connected: boolean;
    mode: string;
    lastHeartbeat: string | null;
    watchlist: string[];
  };
  todayPnl: {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    tradesCount: number;
    halted: boolean;
  } | null;
  positions: Array<{
    symbol: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    stopPrice: number | null;
  }>;
  trades: Array<{
    id: string;
    symbol: string;
    action: string;
    signal: string;
    quantity: number;
    orderType: string;
    fillPrice: number | null;
    status: string;
    pnl: number | null;
    traderTimestamp: string;
  }>;
  signals: Array<{
    id: string;
    symbol: string;
    signal: string;
    price: number;
    actedOn: boolean;
    traderTimestamp: string;
  }>;
  pnlHistory: Array<{
    date: string;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    tradesCount: number;
    halted: boolean;
  }>;
  analytics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    netPnl: number;
    grossProfit: number;
    grossLoss: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
  } | null;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function sendCommand(command: string, payload: Record<string, unknown> = {}): Promise<{ status?: string; error?: string }> {
  try {
    const res = await fetch("/api/trader/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, ...payload }),
    });
    return await res.json();
  } catch {
    return { error: "Failed to send command" };
  }
}

interface EngineStatus {
  running: boolean;
  halted: boolean;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  errors: string[];
}

export default function TraderPage() {
  const [data, setData] = useState<TraderData | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(false);
  const [riskForm, setRiskForm] = useState({
    max_daily_loss: "500",
    max_position_size: "100",
    max_positions: "5",
    stop_loss_pct: "0.02",
    max_portfolio_exposure: "25000",
  });

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, engRes] = await Promise.allSettled([
          fetch("/api/trader/dashboard"),
          fetch("/api/trader/engine"),
        ]);
        if (dashRes.status === "fulfilled" && dashRes.value.ok) setData(await dashRes.value.json());
        if (engRes.status === "fulfilled" && engRes.value.ok) setEngine(await engRes.value.json());
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleEngine(action: "start" | "stop" | "halt") {
    setCmdLoading(action);
    try {
      await fetch("/api/trader/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      // Refresh
      const [dashRes, engRes] = await Promise.allSettled([
        fetch("/api/trader/dashboard"),
        fetch("/api/trader/engine"),
      ]);
      if (dashRes.status === "fulfilled" && dashRes.value.ok) setData(await dashRes.value.json());
      if (engRes.status === "fulfilled" && engRes.value.ok) setEngine(await engRes.value.json());
    } catch { /* silent */ }
    setCmdLoading(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <SubNav tabs={SUB_NAV.trader} />
        <PageIntro
          eyebrow="Execution Desk"
          title="Live Trader"
          description="The execution shell is ready. Connect the trading agent to turn this screen into a live risk and order monitor."
          stats={[
            { label: "Connection", value: "Offline", tone: "bearish" },
            { label: "Mode", value: "Awaiting Agent", tone: "neutral" },
          ]}
        />
        <div className="rounded-xl border border-border bg-bg-surface p-12 text-center">
          <Bot className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold mb-2">
            No trader data yet
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Start the IBKR Trading Agent with SENTINEL_URL and SENTINEL_SECRET configured
            to see live data here.
          </p>
        </div>
      </div>
    );
  }

  const { status, todayPnl, positions, trades, signals, pnlHistory, analytics } = data;

  async function handleCommand(cmd: string, payload: Record<string, unknown> = {}) {
    setCmdLoading(cmd);
    await sendCommand(cmd, payload);
    setCmdLoading(null);
    // Refresh data
    try {
      const res = await fetch("/api/trader/dashboard");
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Execution Desk"
        title="Live Trader"
        description="Monitor the automated trader as a risk system first and an execution engine second."
        stats={[
          { label: "Connection", value: status.connected ? "Online" : "Offline", tone: status.connected ? "bullish" : "bearish" },
          { label: "Mode", value: status.mode.toUpperCase(), tone: "brand" },
          { label: "Positions", value: positions.length },
          { label: "Signals", value: signals.length },
        ]}
      />
      {/* Engine controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!engine?.running ? (
            <Button
              onClick={() => handleEngine("start")}
              disabled={cmdLoading !== null || !status.connected}
              className="min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Start Engine</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => handleEngine("stop")}
              disabled={cmdLoading !== null}
              className="min-h-[44px]"
            >
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline">Stop Engine</span>
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("EMERGENCY HALT — stops engine and closes ALL positions at market. Continue?")) {
                handleEngine("halt");
              }
            }}
            disabled={cmdLoading !== null}
            className="min-h-[44px]"
          >
            <XCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Halt</span>
          </Button>
        </div>
        {engine && (
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <Badge variant={engine.running ? "bullish" : engine.halted ? "bearish" : "neutral"}>
              {engine.running ? "Running" : engine.halted ? "Halted" : "Stopped"}
            </Badge>
            {engine.scanCount > 0 && <span className="font-mono">{engine.scanCount} scans</span>}
            {engine.lastScanAt && <span>Last: {timeAgo(engine.lastScanAt)}</span>}
            {engine.positionCount > 0 && <span className="font-mono">{engine.positionCount} positions</span>}
            {(engine.dailyLoss ?? 0) !== 0 && (
              <span className={(engine.dailyLoss ?? 0) < 0 ? "text-bearish" : "text-bullish"}>
                Day: ${(engine.dailyLoss ?? 0).toFixed(0)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
          status.connected
            ? "border-bullish/30 bg-bullish/10"
            : "border-bearish/30 bg-bearish/10"
        }`}>
          {status.connected ? (
            <Wifi className="w-4 h-4 text-bullish" />
          ) : (
            <WifiOff className="w-4 h-4 text-bearish" />
          )}
          <span className={`text-sm font-medium ${status.connected ? "text-bullish" : "text-bearish"}`}>
            {status.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <Badge variant="neutral">{status.mode.toUpperCase()}</Badge>
        {status.lastHeartbeat && (
          <span className="text-xs text-text-muted">
            Last seen: {timeAgo(status.lastHeartbeat)}
          </span>
        )}
        {todayPnl?.halted && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-bearish/30 bg-bearish/10">
            <AlertTriangle className="w-4 h-4 text-bearish" />
            <span className="text-sm font-medium text-bearish">Trading Halted</span>
          </div>
        )}
      </div>

      {/* Today's P&L */}
      {todayPnl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Total P&L</span>
            </div>
            <p className={`text-xl font-display font-bold ${(todayPnl.totalPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
              {(todayPnl.totalPnl ?? 0) >= 0 ? "+" : ""}${(todayPnl.totalPnl ?? 0).toFixed(2)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-bullish" />
              <span className="text-xs text-text-muted">Realized</span>
            </div>
            <p className={`text-xl font-display font-bold ${(todayPnl.realizedPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
              {(todayPnl.realizedPnl ?? 0) >= 0 ? "+" : ""}${(todayPnl.realizedPnl ?? 0).toFixed(2)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-warning" />
              <span className="text-xs text-text-muted">Unrealized</span>
            </div>
            <p className={`text-xl font-display font-bold ${(todayPnl.unrealizedPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
              {(todayPnl.unrealizedPnl ?? 0) >= 0 ? "+" : ""}${(todayPnl.unrealizedPnl ?? 0).toFixed(2)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Trades Today</span>
            </div>
            <p className="text-xl font-display font-bold">{todayPnl.tradesCount}</p>
          </Card>
        </div>
      )}

      {/* Performance Analytics */}
      {analytics && analytics.totalTrades > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Performance Analytics (All Time)</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Net P&L</span>
              <span className={`text-lg font-display font-bold ${(analytics.netPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                {(analytics.netPnl ?? 0) >= 0 ? "+" : ""}${(analytics.netPnl ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Win Rate</span>
              <span className={`text-lg font-display font-bold ${(analytics.winRate ?? 0) >= 50 ? "text-bullish" : "text-bearish"}`}>
                {(analytics.winRate ?? 0).toFixed(1)}%
              </span>
              <span className="text-[10px] text-text-muted block">{analytics.winningTrades}W / {analytics.losingTrades}L</span>
            </div>
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Profit Factor</span>
              <span className={`text-lg font-display font-bold ${(analytics.profitFactor ?? 0) >= 1 ? "text-bullish" : "text-bearish"}`}>
                {(analytics.profitFactor ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Avg Win</span>
              <span className="text-lg font-display font-bold text-bullish">${(analytics.avgWin ?? 0).toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Avg Loss</span>
              <span className="text-lg font-display font-bold text-bearish">${(analytics.avgLoss ?? 0).toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-bg-elevated p-3">
              <span className="text-xs text-text-muted block">Max Drawdown</span>
              <span className="text-lg font-display font-bold text-bearish">${(analytics.maxDrawdown ?? 0).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-text-muted">
            <span>Sharpe: <span className="font-mono font-medium text-text-primary">{(analytics.sharpeRatio ?? 0).toFixed(2)}</span></span>
            <span>Gross Profit: <span className="font-mono text-bullish">${(analytics.grossProfit ?? 0).toFixed(2)}</span></span>
            <span>Gross Loss: <span className="font-mono text-bearish">${(analytics.grossLoss ?? 0).toFixed(2)}</span></span>
            <span>Total Trades: <span className="font-mono text-text-primary">{analytics.totalTrades}</span></span>
          </div>
        </Card>
      )}

      {/* Open positions */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle>Open Positions ({positions.length})</CardTitle>
        </CardHeader>
        {positions.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No open positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                  <th className="pb-2 pr-4 font-medium text-right">Entry</th>
                  <th className="pb-2 pr-4 font-medium text-right">Current</th>
                  <th className="pb-2 pr-4 font-medium text-right">Stop</th>
                  <th className="pb-2 pr-4 font-medium text-right">P&L</th>
                  <th className="pb-2 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {positions.map((p) => (
                  <tr key={p.symbol} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{p.symbol}</td>
                    <td className="py-2 pr-4 text-right">{p.quantity ?? 0}</td>
                    <td className="py-2 pr-4 text-right">${(p.entryPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">${(p.currentPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right text-text-muted">
                      {p.stopPrice ? `$${p.stopPrice.toFixed(2)}` : "\u2014"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${(p.unrealizedPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {(p.unrealizedPnl ?? 0) >= 0 ? "+" : ""}${(p.unrealizedPnl ?? 0).toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCommand("flatten", { symbol: p.symbol })}
                        disabled={cmdLoading !== null}
                      >
                        Close
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signals */}
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Recent Signals</CardTitle>
          </CardHeader>
          {signals.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No signals yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {signals.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-bg-elevated"
                >
                  <SignalBadge signal={s.signal as SignalType} size="sm" />
                  <span className="text-sm font-mono font-medium">{s.symbol}</span>
                  <span className="text-xs font-mono text-text-muted">${(s.price ?? 0).toFixed(2)}</span>
                  {s.actedOn && <Badge variant="bullish">Acted</Badge>}
                  <span className="text-xs text-text-muted ml-auto">
                    {timeAgo(s.traderTimestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent trades */}
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          {trades.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No trades yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {trades.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-bg-elevated"
                >
                  <Badge variant={t.action === "BUY" ? "bullish" : "bearish"}>{t.action}</Badge>
                  <span className="text-sm font-mono font-medium">{t.symbol}</span>
                  <span className="text-xs font-mono text-text-muted">{t.quantity} shares</span>
                  <Badge variant={
                    t.status === "FILLED" ? "bullish"
                    : t.status === "REJECTED" ? "bearish"
                    : "neutral"
                  }>{t.status}</Badge>
                  {(t.pnl ?? 0) != null && (
                    <span className={`text-xs font-mono ml-auto ${(t.pnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {(t.pnl ?? 0) >= 0 ? "+" : ""}${(t.pnl ?? 0).toFixed(2)}
                    </span>
                  )}
                  <span className="text-xs text-text-muted ml-auto">
                    {timeAgo(t.traderTimestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Risk Settings */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Risk Settings</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRisk(!showRisk)}
            >
              <Settings className="w-4 h-4 text-text-muted" />
            </Button>
          </div>
        </CardHeader>
        {showRisk && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { key: "max_daily_loss", label: "Max Daily Loss ($)" },
                { key: "max_position_size", label: "Max Position Size" },
                { key: "max_positions", label: "Max Open Positions" },
                { key: "stop_loss_pct", label: "Stop Loss %" },
                { key: "max_portfolio_exposure", label: "Max Exposure ($)" },
              ].map(({ key, label }) => (
                <Input
                  key={key}
                  label={label}
                  type="text"
                  value={riskForm[key as keyof typeof riskForm]}
                  onChange={(e) => setRiskForm({ ...riskForm, [key]: e.target.value })}
                  className="font-mono"
                />
              ))}
            </div>
            <Button
              variant="primary"
              onClick={async () => {
                const params: Record<string, number> = {};
                for (const [k, v] of Object.entries(riskForm)) {
                  const num = parseFloat(v);
                  if (!isNaN(num)) params[k] = num;
                }
                await handleCommand("risk", { params });
              }}
              disabled={cmdLoading !== null}
            >
              Update Risk Parameters
            </Button>
          </div>
        )}
      </Card>

      {/* P&L History */}
      {pnlHistory.length > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Daily P&L History</CardTitle>
          </CardHeader>
          <div className="flex items-end gap-1 h-32">
            {pnlHistory.map((p) => {
              const maxPnl = Math.max(...pnlHistory.map((h) => Math.abs(h.totalPnl)), 1);
              const heightPct = Math.max(Math.abs((p.totalPnl ?? 0)) / maxPnl * 100, 4);
              return (
                <div
                  key={p.date}
                  className="flex-1 flex flex-col items-center justify-end gap-1"
                >
                  <span className="text-[9px] font-mono text-text-muted">
                    {(p.totalPnl ?? 0) >= 0 ? "+" : ""}{(p.totalPnl ?? 0).toFixed(0)}
                  </span>
                  <div
                    className={`w-full rounded-t ${(p.totalPnl ?? 0) >= 0 ? "bg-bullish/70" : "bg-bearish/70"}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[8px] text-text-muted truncate w-full text-center">
                    {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
