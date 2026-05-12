"use client";

import { useState, useEffect } from "react";
import { usePolling } from "@/hooks/usePolling";
import { POLLING_INTERVALS } from "@/lib/config";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignalBadge } from "@/components/ui/signal-badge";
import { SymbolLink } from "@/components/ui/symbol-link";
import { useToast } from "@/components/ui/toast";
import { useDisplayPrefs, formatPnl } from "@/components/display-prefs-provider";
import { PositionDetailSheet } from "@/components/dashboard/position-detail-sheet";
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
  RefreshCw,
  Check,
  Shield,
} from "lucide-react";
import { PRESET_LABELS } from "@/lib/strategy-presets";
import { TraderTaxCallouts } from "@/components/trader/tax-callouts";

const ENGINE_MODES = [
  "conservative", "moderate", "optimized", "aggressive",
  "intraday", "tactical", "tactical-smart",
].map(key => ({
  value: key,
  label: `${PRESET_LABELS[key as keyof typeof PRESET_LABELS]?.label ?? key} (${PRESET_LABELS[key as keyof typeof PRESET_LABELS]?.description ?? ""})`,
}));

interface TraderData {
  status: {
    connected: boolean;
    mode: string;
    lastHeartbeat: string | null;
    watchlist: string[];
  };
  brokerAccount?: {
    equity: number;
    cash: number;
    buyingPower: number;
    portfolioValue: number;
  } | null;
  todayPnl: {
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    tradesCount: number;
    halted: boolean;
  } | null;
  lifetimePnl: {
    realizedPnl: number;
    realizedPnlToday: number;
    unrealizedPnl: number;
    totalPnl: number;
  } | null;
  positions: Array<{
    symbol: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
    stopPrice: number | null;
  }>;
  openOrders: Array<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    qty: number;
    filledQty: number;
    status: string;
    stopPrice: string | null;
    limitPrice: string | null;
    timeInForce: string;
    submittedAt: string;
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
    aiSummary?: string | null;
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
  mode?: string;
  lastScanAt: string | null;
  scanCount: number;
  positionCount: number;
  dailyLoss: number;
  errors: string[];
  isOwner?: boolean;
  // Phase 3 — live-trading safeguards
  environment?: "paper" | "live" | null;
  bootEquity?: number | null;
  bootAccountNumber?: string | null;
  dailyNotional?: number;
  consecutiveLosses?: number;
  liveTradingAllowed?: boolean;
  // Phase 5 — personalized live-trading protections
  mtmElected?: boolean;
  washSaleProtectionEnabled?: boolean;
  washSaleBlockedCount?: number;
  pdtVulnerable?: boolean;
  pdtDayTradeCount?: number;
  pdtPatternFlagged?: boolean;
}

interface TaxStatus {
  hasTraderTaxStatus: boolean;
  mtmElectionYear: number | null;
  mtmDeclaredAt: string | null;
  notes: string | null;
}

export default function TraderPage() {
  const { pnlFormat } = useDisplayPrefs();
  const { toast } = useToast();
  const [data, setData] = useState<TraderData | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [engineMode, setEngineMode] = useState<string>("optimized");
  // Persist showRisk across reloads — power-user QoL. Reads from localStorage
  // on mount (after hydration to avoid SSR mismatch) and writes on toggle.
  const [showRisk, setShowRisk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShowRisk(window.localStorage.getItem("sentinel-trader-show-risk") === "1");
  }, []);
  function setShowRiskPersisted(next: boolean) {
    setShowRisk(next);
    try {
      window.localStorage.setItem("sentinel-trader-show-risk", next ? "1" : "0");
    } catch {
      // Quota — non-critical
    }
  }
  // Batch 2 — position detail side-sheet. Stores the symbol currently
  // open (or null). Click on any position row to populate.
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const [riskForm, setRiskForm] = useState<Record<string, string>>({
    accountSize: "",
    maxDailyLossPct: "",
    maxDrawdownPct: "",
    maxPositionPct: "",
    maxPositionSize: "",
    maxSingleTradeLoss: "",
    maxExposureMultiplier: "",
  });
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);

  // Phase 18 — AI trade summary UI state
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
  const [summaryByTradeId, setSummaryByTradeId] = useState<Record<string, string>>({});

  // Phase 5 — MTM election state, loaded from /api/tax-status
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(null);
  const [mtmSaving, setMtmSaving] = useState(false);

  async function loadTaxStatus() {
    try {
      const res = await fetch("/api/tax-status");
      if (res.ok) setTaxStatus(await res.json());
    } catch {
      /* non-critical */
    }
  }

  async function toggleMtm(next: boolean) {
    setMtmSaving(true);
    try {
      const res = await fetch("/api/tax-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasTraderTaxStatus: next,
          mtmElectionYear: next ? new Date().getFullYear() : null,
          notes: taxStatus?.notes ?? null,
        }),
      });
      if (res.ok) {
        setTaxStatus(await res.json());
        // Engine reads tax status at start; surface a hint that the change
        // takes effect on the next engine start (or next scan for the
        // wash-sale set refresh — capped at 5 min).
      }
    } catch {
      /* non-critical */
    } finally {
      setMtmSaving(false);
    }
  }

  async function load() {
    try {
      const [dashRes, engRes] = await Promise.allSettled([
        fetch("/api/trader/dashboard"),
        fetch("/api/trader/engine"),
      ]);
      if (dashRes.status === "fulfilled" && dashRes.value.ok) setData(await dashRes.value.json());
      if (engRes.status === "fulfilled" && engRes.value.ok) {
        const engJson = await engRes.value.json();
        setEngine(engJson.data ?? engJson);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    load();
    loadTaxStatus();
  }, []);

  // Poll for updates
  usePolling(load, POLLING_INTERVALS.traderDashboard);

  // Load saved risk profile overrides
  useEffect(() => {
    async function loadRiskProfile() {
      try {
        const res = await fetch("/api/risk-profile");
        if (!res.ok) return;
        const { profile } = await res.json();
        if (profile) {
          setRiskForm({
            accountSize: profile.accountSize != null ? String(profile.accountSize) : "",
            maxDailyLossPct: profile.maxDailyLossPct != null ? String(profile.maxDailyLossPct) : "",
            maxDrawdownPct: profile.maxDrawdownPct != null ? String(profile.maxDrawdownPct) : "",
            maxPositionPct: profile.maxPositionPct != null ? String(profile.maxPositionPct) : "",
            maxPositionSize: profile.maxPositionSize != null ? String(profile.maxPositionSize) : "",
            maxSingleTradeLoss: profile.maxSingleTradeLoss != null ? String(profile.maxSingleTradeLoss) : "",
            maxExposureMultiplier: profile.maxExposureMultiplier != null ? String(profile.maxExposureMultiplier) : "",
          });
        }
      } catch {
        // Silent — use empty form (all engine defaults)
      }
    }
    loadRiskProfile();
  }, []);

  async function handleEngine(action: "start" | "stop" | "halt" | "switch") {
    setCmdLoading(action);
    try {
      await fetch("/api/trader/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode: engineMode }),
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

  const { status, todayPnl, lifetimePnl, positions, openOrders = [], trades, signals, pnlHistory, analytics } = data;

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
      {/* LIVE banner — only when engine is actually running against a live broker */}
      {engine?.running && engine?.environment === "live" && (
        <div
          role="alert"
          className="rounded-xl border border-bearish/40 bg-bearish/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-bearish/20 border border-bearish/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-bearish">
              <span className="inline-block w-2 h-2 rounded-full bg-bearish animate-pulse" />
              Live
            </div>
            <div className="text-sm text-text-primary">
              <span className="font-semibold">Real money is at risk.</span>
              <span className="text-text-secondary">
                {" "}
                Engine is placing orders against your live broker account.
              </span>
            </div>
          </div>
          {engine.bootAccountNumber && (
            <div className="text-[11px] font-mono text-text-muted">
              acct ••••{engine.bootAccountNumber.slice(-4)}
            </div>
          )}
        </div>
      )}

      {/* PDT warning — engine is running on a sub-$25k account */}
      {engine?.running && engine?.pdtVulnerable && (
        <div
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-warning">
                PDT-vulnerable account
                {engine.pdtPatternFlagged && " · flagged"}
              </div>
              <div className="text-text-secondary mt-0.5">
                Equity is below $25,000. {engine.pdtDayTradeCount ?? 0} day-trade{(engine.pdtDayTradeCount ?? 0) === 1 ? "" : "s"} in the last 5 business days.
                {(engine.pdtDayTradeCount ?? 0) >= 3 && " New BUYs are blocked until count rolls off."}
              </div>
              <div className="text-text-muted text-xs mt-1">
                Intraday mode is refused at boot when vulnerable. Sells (exits) remain unrestricted.
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-text-muted whitespace-nowrap">
            {engine.pdtDayTradeCount ?? 0} / 4 limit
          </div>
        </div>
      )}

      {/* Tax election (§475(f) MTM) + wash-sale protection status */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-text-primary">Tax election</div>
            <label className="mt-2 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={taxStatus?.hasTraderTaxStatus === true}
                onChange={(e) => toggleMtm(e.target.checked)}
                disabled={mtmSaving}
                className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
              />
              <span className="text-sm text-text-secondary">
                I have elected <span className="font-medium text-text-primary">§475(f) Mark-to-Market</span>
                {taxStatus?.mtmElectionYear && (
                  <span className="text-text-muted"> ({taxStatus.mtmElectionYear})</span>
                )}
              </span>
            </label>
            <div className="text-xs text-text-muted mt-1">
              Self-attested. MTM traders are exempt from §1091 wash-sale rule. Election deadline was Apr 15 of the prior tax year — Sentinel does not file or validate.
            </div>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-4 sm:min-w-[200px]">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Wash-sale protection
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  engine?.washSaleProtectionEnabled ? "bg-bullish" : "bg-text-muted"
                }`}
              />
              <span className="text-sm font-medium">
                {engine?.washSaleProtectionEnabled ? "On" : "Off"}
              </span>
              {(engine?.washSaleBlockedCount ?? 0) > 0 && (
                <span className="text-xs font-mono text-text-muted">
                  {engine?.washSaleBlockedCount} symbol{(engine?.washSaleBlockedCount ?? 0) === 1 ? "" : "s"} blocked
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted mt-1">
              {engine?.washSaleProtectionEnabled
                ? "Re-entries blocked for 31 days after any losing close."
                : "MTM elected — wash sale rule does not apply."}
            </div>
          </div>
        </div>
      </Card>

      {/* Engine controls — each user has their own independent engine */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={engineMode}
            onChange={(e) => setEngineMode(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary"
          >
            {ENGINE_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {!engine?.running ? (
            <Button
              onClick={() => handleEngine("start")}
              disabled={cmdLoading !== null || !status.connected}
              className="min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Start</span>
            </Button>
          ) : engine?.mode !== engineMode ? (
            <Button
              onClick={() => handleEngine("switch")}
              disabled={cmdLoading !== null}
              className="min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Switch</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => handleEngine("stop")}
              disabled={cmdLoading !== null}
              className="min-h-[44px]"
            >
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline">Stop</span>
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
              {engine.running ? `Running (${engine.mode ?? "swing"})` : engine.halted ? "Halted" : "Stopped"}
            </Badge>
            {engine.environment && (
              <Badge variant={engine.environment === "live" ? "bearish" : "neutral"}>
                {engine.environment.toUpperCase()}
              </Badge>
            )}
            {engine.scanCount > 0 && <span className="font-mono">{engine.scanCount} scans</span>}
            {engine.lastScanAt && <span>Last: {timeAgo(engine.lastScanAt)}</span>}
            {engine.positionCount > 0 && <span className="font-mono">{engine.positionCount} positions</span>}
            {(engine.dailyLoss ?? 0) !== 0 && (
              <span className={(engine.dailyLoss ?? 0) < 0 ? "text-bearish" : "text-bullish"}>
                Day: ${(engine.dailyLoss ?? 0).toFixed(0)}
              </span>
            )}
            {(engine.consecutiveLosses ?? 0) > 0 && (
              <span className="font-mono text-warning" title="Consecutive losing trades">
                {engine.consecutiveLosses}L
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

      {/* Account Balance */}
      {data?.brokerAccount && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Total Equity</span>
            </div>
            <p className="text-xl font-display font-bold text-text-primary">
              ${data.brokerAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Portfolio Value</span>
            </div>
            <p className="text-xl font-display font-bold text-text-primary">
              ${data.brokerAccount.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-bullish" />
              <span className="text-xs text-text-muted">Cash</span>
            </div>
            <p className="text-xl font-display font-bold text-text-primary">
              ${data.brokerAccount.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-bullish" />
              <span className="text-xs text-text-muted">Buying Power</span>
            </div>
            <p className="text-xl font-display font-bold text-text-primary">
              ${data.brokerAccount.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </Card>
        </div>
      )}

      {/* P&L (lifetime realized + current unrealized) */}
      {(lifetimePnl || todayPnl) && (() => {
        const totalPnlVal = lifetimePnl?.totalPnl ?? todayPnl?.totalPnl ?? 0;
        const realizedVal = lifetimePnl?.realizedPnl ?? todayPnl?.realizedPnl ?? 0;
        const unrealizedVal = lifetimePnl?.unrealizedPnl ?? todayPnl?.unrealizedPnl ?? 0;
        // Use account equity as the basis for percent — gives a "X% of
        // account" reading that's most intuitive for the headline cards.
        const basis =
          (data.brokerAccount?.equity ?? 0) > 0
            ? (data.brokerAccount?.equity as number)
            : Math.abs(totalPnlVal) || 1;
        return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Total P&L</span>
            </div>
            <p className={`text-xl font-display font-bold ${totalPnlVal >= 0 ? "text-bullish" : "text-bearish"}`}>
              {formatPnl(totalPnlVal, basis, pnlFormat)}
            </p>
            {lifetimePnl && todayPnl && (
              <p className="mt-0.5 text-[11px] text-text-muted font-mono">
                Today: {formatPnl(todayPnl.totalPnl ?? 0, basis, pnlFormat)}
              </p>
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-bullish" />
              <span className="text-xs text-text-muted">Realized</span>
            </div>
            <p className={`text-xl font-display font-bold ${realizedVal >= 0 ? "text-bullish" : "text-bearish"}`}>
              {formatPnl(realizedVal, basis, pnlFormat)}
            </p>
            {lifetimePnl && (
              <p className="mt-0.5 text-[11px] text-text-muted font-mono">
                Today: {formatPnl(lifetimePnl.realizedPnlToday, basis, pnlFormat)}
              </p>
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-warning" />
              <span className="text-xs text-text-muted">Unrealized</span>
            </div>
            <p className={`text-xl font-display font-bold ${unrealizedVal >= 0 ? "text-bullish" : "text-bearish"}`}>
              {formatPnl(unrealizedVal, basis, pnlFormat)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-xs text-text-muted">Trades Today</span>
            </div>
            <p className="text-xl font-display font-bold">{todayPnl?.tradesCount ?? 0}</p>
          </Card>
        </div>
        );
      })()}

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

      {/* Tax-aware trading callouts */}
      <TraderTaxCallouts />

      {/* Open positions */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
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
                  <tr
                    key={p.symbol}
                    className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
                    onClick={() => setDetailSymbol(p.symbol)}
                  >
                    <td className="py-2 pr-4 font-medium text-text-primary">
                      {p.symbol}
                    </td>
                    <td className="py-2 pr-4 text-right">{p.quantity ?? 0}</td>
                    <td className="py-2 pr-4 text-right">${(p.entryPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">${(p.currentPrice ?? 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right text-text-muted">
                      {p.stopPrice ? `$${p.stopPrice.toFixed(2)}` : "\u2014"}
                    </td>
                    <td className={`py-2 pr-4 text-right ${(p.unrealizedPnl ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {formatPnl(
                        p.unrealizedPnl ?? 0,
                        (p.entryPrice ?? 0) * (p.quantity ?? 0),
                        pnlFormat
                      )}
                    </td>
                    <td className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Sell all ${p.quantity} shares of ${p.symbol} at market?`)) return;
                          setCmdLoading("flatten");
                          const result = await sendCommand("flatten", { symbol: p.symbol });
                          setCmdLoading(null);
                          if (result.error) {
                            alert(`Failed: ${result.error}`);
                          } else {
                            // Refresh data
                            try {
                              const res = await fetch("/api/trader/dashboard");
                              if (res.ok) setData(await res.json());
                            } catch { /* silent */ }
                          }
                        }}
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

      {/* Open Orders */}
      {openOrders.length > 0 && (
        <Card>
          <CardHeader className="p-0 pb-3">
            <CardTitle>Open Orders ({openOrders.length})</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Symbol</th>
                  <th className="pb-2 pr-4 font-medium">Side</th>
                  <th className="pb-2 pr-4 font-medium">Type</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Price</th>
                  <th className="pb-2 pr-4 font-medium">TIF</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-text-primary">
                      <SymbolLink symbol={o.symbol} className="font-medium" />
                    </td>
                    <td className={`py-2 pr-4 ${o.side === "buy" ? "text-bullish" : "text-bearish"}`}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {o.type === "stop" ? `Stop @ $${Number(o.stopPrice).toFixed(2)}` :
                       o.type === "limit" ? `Limit @ $${Number(o.limitPrice).toFixed(2)}` :
                       o.type === "stop_limit" ? `Stop-Limit $${Number(o.stopPrice).toFixed(2)}` :
                       o.type}
                    </td>
                    <td className="py-2 text-right">{o.qty}</td>
                    <td className="py-2 text-right text-text-secondary">
                      {o.stopPrice ? `$${Number(o.stopPrice).toFixed(2)}` : o.limitPrice ? `$${Number(o.limitPrice).toFixed(2)}` : "\u2014"}
                    </td>
                    <td className="py-2 pr-4 text-text-muted uppercase text-xs">{o.timeInForce}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={o.filledQty > 0 ? "warning" : "neutral"}>
                        {o.filledQty > 0 ? `Partial ${o.filledQty}/${o.qty}` : o.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-text-muted text-xs whitespace-nowrap" title={o.submittedAt}>
                      {timeAgo(o.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </div>{/* end 2xl:grid-cols-2 positions+orders wrap */}

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
                  <SymbolLink symbol={s.symbol} className="text-sm font-medium" />
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
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {trades.map((t) => (
                <div key={t.id} className="rounded-lg bg-bg-elevated">
                  <div className="flex items-center gap-3 p-2">
                    <Badge variant={t.action === "BUY" ? "bullish" : "bearish"}>{t.action}</Badge>
                    <SymbolLink symbol={t.symbol} className="text-sm font-medium" />
                    <span className="text-xs font-mono text-text-muted">{t.quantity} shares</span>
                    <Badge variant={
                      t.status === "FILLED" ? "bullish"
                      : t.status === "REJECTED" ? "bearish"
                      : "neutral"
                    }>{t.status}</Badge>
                    {t.pnl != null && (
                      <span className={`text-xs font-mono ml-auto ${t.pnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                        {formatPnl(
                          t.pnl,
                          (t.fillPrice ?? 0) * t.quantity,
                          pnlFormat
                        )}
                      </span>
                    )}
                    <span className="text-xs text-text-muted">
                      {timeAgo(t.traderTimestamp)}
                    </span>
                    <button
                      onClick={async () => {
                        const tradeId = t.id;
                        setSummarizing((prev) => new Set(prev).add(tradeId));
                        try {
                          const res = await fetch("/api/trader/summarize-trade", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tradeId }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setSummaryByTradeId((prev) => ({ ...prev, [tradeId]: data.summary }));
                          } else {
                            const data = await res.json().catch(() => ({}));
                            toast({
                              type: "error",
                              message:
                                data?.error ||
                                `AI summary failed (${res.status}) — check admin → System Config`,
                            });
                          }
                        } catch (err) {
                          toast({
                            type: "error",
                            message:
                              "AI summary failed — " +
                              ((err as Error)?.message ?? "network error"),
                          });
                        } finally {
                          setSummarizing((prev) => {
                            const next = new Set(prev);
                            next.delete(tradeId);
                            return next;
                          });
                        }
                      }}
                      disabled={summarizing.has(t.id)}
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded
                        text-text-muted hover:text-accent hover:bg-accent/10
                        disabled:opacity-50 transition-colors"
                      title="AI summary of this trade"
                    >
                      {summarizing.has(t.id) ? "..." : (summaryByTradeId[t.id] || t.aiSummary) ? "↻" : "AI ✨"}
                    </button>
                  </div>
                  {(summaryByTradeId[t.id] || t.aiSummary) && (
                    <div className="px-3 pb-2 text-xs text-text-secondary leading-relaxed border-t border-border/30 pt-2">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted mr-2">summary</span>
                      {summaryByTradeId[t.id] || t.aiSummary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Risk Settings — optional overrides (empty = engine decides) */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent" />
              <CardTitle>Risk Overrides</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRiskPersisted(!showRisk)}
            >
              <Settings className="w-4 h-4 text-text-muted" />
            </Button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Only set fields you want to override. Empty fields use engine defaults.
          </p>
        </CardHeader>
        {showRisk && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { key: "accountSize", label: "Account Size ($)", placeholder: "Engine default: 10,000", step: "100" },
                { key: "maxDailyLossPct", label: "Max Daily Loss (%)", placeholder: "Engine default: 2%", step: "0.1" },
                { key: "maxDrawdownPct", label: "Max Drawdown (%)", placeholder: "Engine default: 10%", step: "0.5" },
                { key: "maxPositionPct", label: "Max Position (%)", placeholder: "Engine default: 15%", step: "0.5" },
                { key: "maxPositionSize", label: "Max Position Size (shares)", placeholder: "Engine default: 100", step: "1" },
                { key: "maxSingleTradeLoss", label: "Max Single Trade Loss ($)", placeholder: "Engine default: 100", step: "10" },
                { key: "maxExposureMultiplier", label: "Max Exposure (× equity)", placeholder: "Engine default: 1.5×", step: "0.1" },
              ] as const).map(({ key, label, placeholder, step }) => (
                <div key={key}>
                  <Input
                    label={label}
                    type="number"
                    step={step}
                    min="0"
                    value={riskForm[key]}
                    placeholder={placeholder}
                    onChange={(e) => setRiskForm({ ...riskForm, [key]: e.target.value })}
                    className="font-mono"
                  />
                  {riskForm[key] === "" && (
                    <span className="text-[11px] text-text-muted mt-0.5 block">Engine decides</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                loading={riskSaving}
                onClick={async () => {
                  setRiskSaving(true);
                  setRiskSaved(false);
                  try {
                    // Build payload: null for empty fields, number for set fields
                    const payload: Record<string, number | null> = {};
                    for (const [k, v] of Object.entries(riskForm)) {
                      if (v === "") {
                        payload[k] = null;
                      } else {
                        const num = parseFloat(v);
                        if (!isNaN(num)) payload[k] = num;
                      }
                    }

                    // Persist to DB risk profile
                    await fetch("/api/risk-profile", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });

                    // Push to live engine (only non-null params)
                    const engineParams: Record<string, number> = {};
                    for (const [k, v] of Object.entries(payload)) {
                      if (v != null) engineParams[k] = v;
                    }
                    if (Object.keys(engineParams).length > 0) {
                      await handleCommand("risk", { params: engineParams });
                    }

                    setRiskSaved(true);
                    setTimeout(() => setRiskSaved(false), 3000);
                  } finally {
                    setRiskSaving(false);
                  }
                }}
                disabled={cmdLoading !== null}
              >
                Save Overrides
              </Button>
              {riskSaved && (
                <span className="flex items-center gap-1 text-sm text-bullish animate-fade-in">
                  <Check className="w-4 h-4" /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <PositionDetailSheet
        symbol={detailSymbol}
        position={
          detailSymbol
            ? positions.find((p) => p.symbol === detailSymbol) ?? null
            : null
        }
        signals={signals}
        engineRunning={engine?.running === true}
        onClose={() => setDetailSymbol(null)}
        onClosePosition={async (sym) => {
          if (!confirm(`Sell all shares of ${sym} at market?`)) return;
          setCmdLoading("flatten");
          const result = await sendCommand("flatten", { symbol: sym });
          setCmdLoading(null);
          if (result.error) {
            alert(`Failed: ${result.error}`);
            return;
          }
          try {
            const res = await fetch("/api/trader/dashboard");
            if (res.ok) setData(await res.json());
          } catch {
            // Refresh failure is non-fatal
          }
        }}
      />

    </div>
  );
}
