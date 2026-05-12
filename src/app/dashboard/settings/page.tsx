"use client";

import { useState, useEffect } from "react";
import type { DiscordWebhook, UserRiskProfile, RiskTolerance } from "@/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import {
  Webhook, Plus, Trash2, TestTube, Check, X, Shield,
  Link, Unlink, Pencil, CircleDot, Zap, Sliders,
} from "lucide-react";
import {
  useDisplayPrefs,
  LANDING_PAGES,
  type LandingPage,
} from "@/components/display-prefs-provider";

// ─── Types ──────────────────────────────────────────────────────────

interface BrokerConnection {
  id: string;
  broker: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  environment: string;
  isActive: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const RISK_TOLERANCE_OPTIONS = [
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
];

const RISK_PRESETS: Record<RiskTolerance, {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxPositionPct: number;
  maxPositionSizePct: number;
  maxSingleTradeLossPct: number;
}> = {
  conservative: {
    maxDailyLossPct: 1,
    maxDrawdownPct: 5,
    maxPositionPct: 2,
    maxPositionSizePct: 0.5,
    maxSingleTradeLossPct: 0.5,
  },
  moderate: {
    maxDailyLossPct: 2,
    maxDrawdownPct: 10,
    maxPositionPct: 5,
    maxPositionSizePct: 1,
    maxSingleTradeLossPct: 1,
  },
  aggressive: {
    maxDailyLossPct: 5,
    maxDrawdownPct: 20,
    maxPositionPct: 10,
    maxPositionSizePct: 2.5,
    maxSingleTradeLossPct: 2.5,
  },
};

const BROKER_OPTIONS = [
  { value: "alpaca", label: "Alpaca" },
  { value: "ibkr", label: "Interactive Brokers" },
  { value: "tradier", label: "Tradier" },
];

const ENVIRONMENT_OPTIONS = [
  { value: "paper", label: "Paper" },
  { value: "live", label: "Live" },
];

const BROKER_LABELS: Record<string, string> = {
  alpaca: "Alpaca",
  ibkr: "Interactive Brokers",
  tradier: "Tradier",
};

const BROKER_FIELD_LABELS: Record<string, { apiKey: string; apiSecret: string; help: string }> = {
  alpaca: {
    apiKey: "API Key",
    apiSecret: "API Secret",
    help: "Get your API keys from app.alpaca.markets \u2192 Paper Trading \u2192 API Keys",
  },
  ibkr: {
    apiKey: "Gateway URL",
    apiSecret: "Account ID",
    help: "Enter your Client Portal Gateway URL and Account ID. Run the gateway on your local machine.",
  },
  tradier: {
    apiKey: "Access Token",
    apiSecret: "Account ID",
    help: "Get your access token from developer.tradier.com",
  },
};

// ─── Page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    pnlFormat,
    setPnlFormat,
    timeFormat,
    setTimeFormat,
    colorBlindMode,
    setColorBlindMode,
    landingPage,
    setLandingPage,
  } = useDisplayPrefs();

  // Webhook state
  const [webhooks, setWebhooks] = useState<DiscordWebhook[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | "loading">>({});

  // Risk profile moved to Trader page — single source of truth

  // Broker connection state
  const [brokerConnections, setBrokerConnections] = useState<BrokerConnection[]>([]);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [editingBroker, setEditingBroker] = useState<BrokerConnection | null>(null);
  const [brokerForm, setBrokerForm] = useState({
    broker: "alpaca",
    label: "Default",
    apiKey: "",
    apiSecret: "",
    environment: "paper",
  });
  const [brokerError, setBrokerError] = useState("");
  const [brokerSaving, setBrokerSaving] = useState(false);
  // Phase 4 — confirmation typed by user before saving with environment="live"
  const [liveConfirmText, setLiveConfirmText] = useState("");
  const [brokerTesting, setBrokerTesting] = useState(false);
  const [brokerTestResult, setBrokerTestResult] = useState<{
    success: boolean;
    message: string;
    account?: { equity: string; buyingPower: string; cash: string };
  } | null>(null);

  // ─── Load data ──────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const [webhookRes, brokerRes] = await Promise.allSettled([
          fetch("/api/webhooks/discord"),
          fetch("/api/broker/connections"),
        ]);
        if (webhookRes.status === "fulfilled" && webhookRes.value.ok) {
          const data = await webhookRes.value.json();
          setWebhooks(data.webhooks ?? []);
        }
        if (brokerRes.status === "fulfilled" && brokerRes.value.ok) {
          const data = await brokerRes.value.json();
          setBrokerConnections(data.connections ?? []);
        }
      } catch {
        // Will show defaults
      }
    }
    load();
  }, []);

  // ─── Webhook handlers ──────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/webhooks/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, webhookUrl: url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to add webhook" }));
        setError(data.error ?? "Failed to add webhook");
        return;
      }

      const data = await res.json();
      setWebhooks((prev) => [...prev, data.webhook]);
      setName("");
      setUrl("");
      setShowAdd(false);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch("/api/webhooks/discord", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch("/api/webhooks/discord", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    setWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  }

  async function handleTest(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const res = await fetch("/api/webhooks/discord/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setTestResults((prev) => ({
        ...prev,
        [id]: res.ok ? "success" : "error",
      }));
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "error" }));
    }
    setTimeout(() => {
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 3000);
  }

  // ─── Broker handlers ───────────────────────────────────────────

  function openAddBroker() {
    setEditingBroker(null);
    setBrokerForm({
      broker: "alpaca",
      label: "Default",
      apiKey: "",
      apiSecret: "",
      environment: "paper",
    });
    setBrokerError("");
    setBrokerTestResult(null);
    setShowBrokerModal(true);
  }

  function openEditBroker(conn: BrokerConnection) {
    setEditingBroker(conn);
    setBrokerForm({
      broker: conn.broker,
      label: conn.label,
      apiKey: "", // Don't pre-fill secrets
      apiSecret: "",
      environment: conn.environment,
    });
    setBrokerError("");
    setBrokerTestResult(null);
    setShowBrokerModal(true);
  }

  function closeBrokerModal() {
    setShowBrokerModal(false);
    setEditingBroker(null);
    setBrokerError("");
    setBrokerTestResult(null);
    setLiveConfirmText("");
  }

  async function handleTestBroker() {
    if (!brokerForm.apiKey || !brokerForm.apiSecret) {
      setBrokerError("API Key and Secret are required to test");
      return;
    }

    setBrokerTesting(true);
    setBrokerError("");
    setBrokerTestResult(null);

    try {
      const res = await fetch("/api/broker/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: brokerForm.broker,
          apiKey: brokerForm.apiKey,
          apiSecret: brokerForm.apiSecret,
          environment: brokerForm.environment,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setBrokerTestResult({
          success: true,
          message: "Connection successful",
          account: {
            equity: data.account.equity,
            buyingPower: data.account.buyingPower,
            cash: data.account.cash,
          },
        });
      } else {
        setBrokerTestResult({
          success: false,
          message: data.error ?? "Connection failed",
        });
      }
    } catch {
      setBrokerTestResult({
        success: false,
        message: "Failed to test connection",
      });
    } finally {
      setBrokerTesting(false);
    }
  }

  async function handleSaveBroker() {
    if (!editingBroker && (!brokerForm.apiKey || !brokerForm.apiSecret)) {
      setBrokerError("API Key and Secret are required");
      return;
    }

    // Belt + suspenders for the disabled button: re-check typed LIVE confirmation
    if (
      brokerForm.environment === "live" &&
      (!editingBroker || editingBroker.environment !== "live") &&
      liveConfirmText !== "LIVE"
    ) {
      setBrokerError('Type "LIVE" exactly to confirm a live broker connection.');
      return;
    }

    setBrokerSaving(true);
    setBrokerError("");

    try {
      if (editingBroker) {
        // Update existing
        const updates: Record<string, unknown> = { id: editingBroker.id };
        if (brokerForm.label !== editingBroker.label) updates.label = brokerForm.label;
        if (brokerForm.environment !== editingBroker.environment) updates.environment = brokerForm.environment;
        if (brokerForm.apiKey) updates.apiKey = brokerForm.apiKey;
        if (brokerForm.apiSecret) updates.apiSecret = brokerForm.apiSecret;

        const res = await fetch("/api/broker/connections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to update" }));
          setBrokerError(data.error ?? "Failed to update connection");
          return;
        }

        const data = await res.json();
        setBrokerConnections((prev) =>
          prev.map((c) => (c.id === editingBroker.id ? data.connection : c))
        );
      } else {
        // Create new
        const res = await fetch("/api/broker/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(brokerForm),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to save" }));
          setBrokerError(data.error ?? "Failed to save connection");
          return;
        }

        const data = await res.json();
        setBrokerConnections((prev) => [...prev, data.connection]);
      }

      closeBrokerModal();
    } catch {
      setBrokerError("Something went wrong");
    } finally {
      setBrokerSaving(false);
    }
  }

  async function handleDeleteBroker(id: string) {
    try {
      const res = await fetch("/api/broker/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setBrokerConnections((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      // Silent fail — connection already gone or network error
    }
  }

  async function handleToggleBrokerActive(conn: BrokerConnection) {
    try {
      const res = await fetch("/api/broker/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: conn.id, isActive: !conn.isActive }),
      });

      if (res.ok) {
        const data = await res.json();
        setBrokerConnections((prev) =>
          prev.map((c) => (c.id === conn.id ? data.connection : c))
        );
      }
    } catch {
      // Silent fail
    }
  }

  // ─── Render ────────────────────────────────────────────────────

  const activeBrokerCount = brokerConnections.filter((c) => c.isActive).length;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <SubNav tabs={SUB_NAV.admin} />

      <PageIntro
        eyebrow="Desk Controls"
        title="Settings"
        description="Configure the operational defaults of the workspace: risk posture, broker connections, integrations, and notification plumbing."
        stats={[
          { label: "Webhooks", value: webhooks.length },
          { label: "Brokers", value: activeBrokerCount, tone: activeBrokerCount > 0 ? "bullish" : "neutral" },
        ]}
      />

      {/* Broker Connections */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            <CardTitle>Broker Connections</CardTitle>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={openAddBroker}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span> Broker
          </Button>
        </CardHeader>

        {brokerConnections.length === 0 ? (
          <div className="text-center py-8">
            <Link className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-1">No brokers connected</p>
            <p className="text-xs text-text-muted">
              Connect a brokerage account to enable live or paper trading
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {brokerConnections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated
                  border border-border hover:border-border-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CircleDot className={`w-5 h-5 shrink-0 ${conn.isActive ? "text-bullish" : "text-text-muted"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {BROKER_LABELS[conn.broker] ?? conn.broker}
                      </p>
                      <Badge variant={conn.environment === "live" ? "warning" : "accent"}>
                        {conn.environment}
                      </Badge>
                      {conn.isActive && (
                        <Badge variant="bullish">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted truncate">
                      {conn.label} &middot; Key: {conn.apiKey}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Toggle
                    checked={conn.isActive}
                    onCheckedChange={() => handleToggleBrokerActive(conn)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditBroker(conn)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteBroker(conn.id)}
                    className="text-bearish hover:text-bearish"
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add/Edit Broker Modal */}
      <Modal open={showBrokerModal} onClose={closeBrokerModal}>
        <ModalHeader>
          <ModalTitle>
            {editingBroker ? "Edit Broker Connection" : "Add Broker Connection"}
          </ModalTitle>
          <ModalDescription>
            {editingBroker
              ? "Update your API credentials or connection settings."
              : "Enter your brokerage API credentials to connect your account."}
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4">
          <Select
            label="Broker"
            options={BROKER_OPTIONS}
            value={brokerForm.broker}
            onChange={(value) => setBrokerForm((f) => ({ ...f, broker: value }))}
            disabled={!!editingBroker}
          />

          <Input
            label="Label"
            value={brokerForm.label}
            onChange={(e) => setBrokerForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Main Account, Paper Testing"
          />

          <Input
            label={BROKER_FIELD_LABELS[brokerForm.broker]?.apiKey ?? "API Key"}
            value={brokerForm.apiKey}
            onChange={(e) => setBrokerForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder={
              editingBroker
                ? "Leave blank to keep existing"
                : brokerForm.broker === "ibkr"
                  ? "https://localhost:5000"
                  : brokerForm.broker === "tradier"
                    ? "Your access token"
                    : "Your API key"
            }
          />

          <Input
            label={BROKER_FIELD_LABELS[brokerForm.broker]?.apiSecret ?? "API Secret"}
            type={brokerForm.broker === "ibkr" ? "text" : "password"}
            value={brokerForm.apiSecret}
            onChange={(e) => setBrokerForm((f) => ({ ...f, apiSecret: e.target.value }))}
            placeholder={
              editingBroker
                ? "Leave blank to keep existing"
                : brokerForm.broker === "ibkr" || brokerForm.broker === "tradier"
                  ? "Your account ID"
                  : "Your API secret"
            }
          />

          <p className="text-xs text-text-muted">
            {BROKER_FIELD_LABELS[brokerForm.broker]?.help}
          </p>

          <Select
            label="Environment"
            options={ENVIRONMENT_OPTIONS}
            value={brokerForm.environment}
            onChange={(value) => {
              setBrokerForm((f) => ({ ...f, environment: value }));
              setLiveConfirmText(""); // any environment change resets the confirmation
            }}
          />

          {/* Live confirmation — required when newly switching to live OR creating a live connection */}
          {brokerForm.environment === "live" &&
            (!editingBroker || editingBroker.environment !== "live") && (
              <div className="rounded-lg border border-bearish/40 bg-bearish/5 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-bearish mt-1.5 animate-pulse" />
                  <div className="text-sm">
                    <div className="font-semibold text-bearish">You are saving a LIVE broker connection.</div>
                    <div className="text-text-secondary mt-1">
                      Once active, the engine can place orders against this account with real money — subject to
                      your risk-profile limits and the engine&apos;s safeguards (notional cap, rate limit,
                      consecutive-loss halt, account-switch detection). The Trader page will show a persistent
                      red LIVE banner while the engine is running.
                    </div>
                    <div className="text-text-muted text-xs mt-2">
                      Live trading also requires{" "}
                      <code className="px-1 py-0.5 rounded bg-bg-elevated text-text-secondary">
                        ALLOW_LIVE_TRADING=1
                      </code>{" "}
                      in the server environment. Without it, the engine refuses to start on live connections
                      (you can still save the connection here for later).
                    </div>
                  </div>
                </div>
                <Input
                  label='Type "LIVE" exactly to confirm'
                  value={liveConfirmText}
                  onChange={(e) => setLiveConfirmText(e.target.value)}
                  placeholder="LIVE"
                  autoComplete="off"
                />
              </div>
            )}

          {/* Test result */}
          {brokerTestResult && (
            <div
              className={`p-3 rounded-lg border text-sm ${
                brokerTestResult.success
                  ? "border-bullish/20 bg-bullish/5 text-bullish"
                  : "border-bearish/20 bg-bearish/5 text-bearish"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {brokerTestResult.success ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span className="font-medium">{brokerTestResult.message}</span>
              </div>
              {brokerTestResult.account && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-text-muted block">Equity</span>
                    ${Number(brokerTestResult.account.equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div>
                    <span className="text-text-muted block">Buying Power</span>
                    ${Number(brokerTestResult.account.buyingPower).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div>
                    <span className="text-text-muted block">Cash</span>
                    ${Number(brokerTestResult.account.cash).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </div>
          )}

          {brokerError && <p className="text-sm text-bearish">{brokerError}</p>}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={closeBrokerModal}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleTestBroker}
            loading={brokerTesting}
            disabled={!brokerForm.apiKey || !brokerForm.apiSecret}
          >
            <TestTube className="w-4 h-4" />
            Test
          </Button>
          <Button
            onClick={handleSaveBroker}
            loading={brokerSaving}
            disabled={
              brokerForm.environment === "live" &&
              (!editingBroker || editingBroker.environment !== "live") &&
              liveConfirmText !== "LIVE"
            }
          >
            {editingBroker ? "Update" : "Save"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Phase 19 — Leaderboard opt-in */}
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <LeaderboardSettings />
      </Card>

      {/* Phase 15 — Export Data */}
      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Download your trading data as CSV. All exports are scoped to your account only.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = "/api/export/trades";
              }}
            >
              <span>Trades (last 365 days)</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = "/api/export/pnl-history";
              }}
            >
              <span>P&amp;L History (all time)</span>
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            For custom date ranges, append <code className="px-1 py-0.5 bg-bg-elevated rounded">?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</code> to either URL.
          </p>
        </div>
      </Card>

      {/* Phase 17 — Tax Report */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Report (Form 8949)</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            FIFO realized gains/losses with §1091 wash-sale flagging. Short-term and long-term classified
            automatically (365-day boundary). Output is IRS Form 8949-compatible CSV — import into TurboTax,
            FreeTaxUSA, or hand to your CPA.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap items-center">
            <Button
              variant="secondary"
              onClick={() => {
                const y = new Date().getFullYear();
                window.location.href = `/api/export/tax-report?year=${y}&format=csv`;
              }}
            >
              <span>Form 8949 CSV ({new Date().getFullYear()})</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const y = new Date().getFullYear() - 1;
                window.location.href = `/api/export/tax-report?year=${y}&format=csv`;
              }}
            >
              <span>Prior year ({new Date().getFullYear() - 1})</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const y = new Date().getFullYear();
                window.location.href = `/api/export/tax-report?year=${y}&format=summary`;
              }}
            >
              <span>JSON summary</span>
            </Button>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-text-secondary">
            <strong className="text-warning">Self-attested — not a tax substitute.</strong> Sentinel computes FIFO
            lots + wash-sale flags. Wash-sale rule is applied at symbol level only — substantially-identical ETF
            cross-matches (SPY↔IVV) are NOT detected. If you elected §475(f) MTM, disregard the wash-sale column.
            Always review with a CPA before filing.
          </div>
        </div>
      </Card>

      {/* Display Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            Display preferences
          </CardTitle>
        </CardHeader>
        <p className="text-xs text-text-muted mb-4">
          Per-device settings stored in your browser. Affects how numbers, times,
          and colors are rendered across the app.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* P&L format */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">P&L format</label>
            <div className="flex gap-0.5 rounded-lg border border-border bg-bg-secondary p-0.5">
              {(["dollar", "percent", "both"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setPnlFormat(v)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors
                    ${pnlFormat === v
                      ? "bg-bg-elevated text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                    }`}
                >
                  {v === "dollar" ? "Dollars" : v === "percent" ? "Percent" : "Both"}
                </button>
              ))}
            </div>
          </div>

          {/* Time format */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Time format</label>
            <div className="flex gap-0.5 rounded-lg border border-border bg-bg-secondary p-0.5">
              {(["12h", "24h"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTimeFormat(v)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors
                    ${timeFormat === v
                      ? "bg-bg-elevated text-text-primary"
                      : "text-text-muted hover:text-text-secondary"
                    }`}
                >
                  {v === "12h" ? "12-hour" : "24-hour"}
                </button>
              ))}
            </div>
          </div>

          {/* Default landing page */}
          <div className="space-y-1.5 sm:col-span-2">
            <Select
              label="Default page after login"
              value={landingPage}
              onChange={(v) => setLandingPage(v as LandingPage)}
              options={LANDING_PAGES.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>

          {/* Color-blind mode */}
          <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-secondary p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary">Color-blind palette</div>
              <p className="text-xs text-text-muted mt-0.5">
                Swap bullish/bearish to a deuteranopia-friendly blue/orange (Wong palette).
                Affects every $/%, badge, and chart color across the app.
              </p>
            </div>
            <Toggle
              checked={colorBlindMode}
              onCheckedChange={(v) => setColorBlindMode(v)}
              aria-label="Toggle color-blind palette"
            />
          </div>
        </div>
      </Card>

      {/* Discord Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>Discord Webhooks</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span> Webhook
          </Button>
        </CardHeader>

        {/* Add form */}
        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="mb-4 p-4 rounded-lg bg-bg-elevated border border-border space-y-3"
          >
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. #trading-signals"
              required
            />
            <Input
              label="Webhook URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              required
            />
            {error && (
              <p className="text-sm text-bearish">{error}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={loading}>
                Add Webhook
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Webhook list */}
        {webhooks.length === 0 ? (
          <div className="text-center py-8">
            <Webhook className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-1">No webhooks configured</p>
            <p className="text-xs text-text-muted">
              Add a Discord webhook to receive signal alerts
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated
                  border border-border hover:border-border-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Webhook className="w-5 h-5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{wh.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {wh.webhookUrl.slice(0, 50)}...
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={wh.enabled ? "bullish" : "neutral"}>
                    {wh.enabled ? "Active" : "Paused"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(wh.id)}
                    disabled={testResults[wh.id] === "loading"}
                  >
                    {testResults[wh.id] === "success" ? (
                      <Check className="w-4 h-4 text-bullish" />
                    ) : testResults[wh.id] === "error" ? (
                      <X className="w-4 h-4 text-bearish" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(wh.id, wh.enabled)}
                  >
                    {wh.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(wh.id)}
                    className="text-bearish hover:text-bearish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Phase 19 — Leaderboard opt-in settings ───────────────────────────

function LeaderboardSettings() {
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setOptIn(data.optIn ?? false);
          setDisplayName(data.displayName ?? "");
        } else {
          setOptIn(false);
        }
      })
      .catch(() => setOptIn(false));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/leaderboard/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: optIn === true, displayName: displayName.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setError(data.error ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (optIn === null) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Show your realized P&amp;L ranking on the <a href="/dashboard/leaderboard" className="text-accent hover:text-accent-hover underline">/dashboard/leaderboard</a> page.
        Email addresses are never displayed. You can use a custom anonymous handle.
      </p>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
        />
        <span className="text-sm">Show me on the leaderboard</span>
      </label>
      <Input
        label="Display name (optional)"
        placeholder="Leave blank to use your real name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={!optIn}
      />
      <div className="flex items-center gap-2">
        <Button onClick={save} loading={saving} disabled={!saving && optIn === null}>
          Save
        </Button>
        {saved && <span className="text-xs text-bullish">✓ Saved</span>}
        {error && <span className="text-xs text-bearish">{error}</span>}
      </div>
    </div>
  );
}
