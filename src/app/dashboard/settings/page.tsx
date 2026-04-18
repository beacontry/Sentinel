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
  Link, Unlink, Pencil, CircleDot, Zap,
} from "lucide-react";

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
  // Webhook state
  const [webhooks, setWebhooks] = useState<DiscordWebhook[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | "loading">>({});

  // Risk profile state
  const [, setRiskProfile] = useState<UserRiskProfile | null>(null);
  const [riskForm, setRiskForm] = useState({
    accountSize: 10000,
    riskTolerance: "moderate" as RiskTolerance,
    maxDailyLossPct: 2,
    maxDrawdownPct: 10,
    maxPositionPct: 5,
    maxPositionSize: 100,
    maxSingleTradeLoss: 100,
  });
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);
  const [riskError, setRiskError] = useState("");

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
        const [webhookRes, riskRes, brokerRes] = await Promise.allSettled([
          fetch("/api/webhooks/discord"),
          fetch("/api/risk-profile"),
          fetch("/api/broker/connections"),
        ]);
        if (webhookRes.status === "fulfilled" && webhookRes.value.ok) {
          const data = await webhookRes.value.json();
          setWebhooks(data.webhooks ?? []);
        }
        if (riskRes.status === "fulfilled" && riskRes.value.ok) {
          const data = await riskRes.value.json();
          if (data.profile) {
            setRiskProfile(data.profile);
            setRiskForm({
              accountSize: data.profile.accountSize,
              riskTolerance: data.profile.riskTolerance,
              maxDailyLossPct: data.profile.maxDailyLossPct,
              maxDrawdownPct: data.profile.maxDrawdownPct,
              maxPositionPct: data.profile.maxPositionPct,
              maxPositionSize: data.profile.maxPositionSize,
              maxSingleTradeLoss: data.profile.maxSingleTradeLoss,
            });
          }
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

  // ─── Risk profile handlers ─────────────────────────────────────

  async function handleSaveRiskProfile() {
    setRiskSaving(true);
    setRiskError("");
    setRiskSaved(false);
    try {
      const res = await fetch("/api/risk-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(riskForm),
      });
      if (!res.ok) {
        const data = await res.json();
        setRiskError(data.error ?? "Save failed");
        return;
      }
      const data = await res.json();
      setRiskProfile(data.profile);
      setRiskSaved(true);
      setTimeout(() => setRiskSaved(false), 3000);
    } catch {
      setRiskError("Save failed");
    } finally {
      setRiskSaving(false);
    }
  }

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
          { label: "Risk Tier", value: riskForm.riskTolerance, tone: "brand" },
          { label: "Account Size", value: `$${riskForm.accountSize.toLocaleString()}` },
        ]}
      />

      {/* Risk Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            <CardTitle>Risk Profile</CardTitle>
          </div>
          <p className="text-xs text-text-muted">
            Your risk profile determines default strategy parameters when no explicit assignment exists
          </p>
        </CardHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Account Size ($)"
              type="number"
              value={riskForm.accountSize}
              onChange={(e) => setRiskForm((f) => ({ ...f, accountSize: Number(e.target.value) }))}
              min={100}
            />
            <Select
              label="Risk Tolerance"
              options={RISK_TOLERANCE_OPTIONS}
              value={riskForm.riskTolerance}
              onChange={(value) => {
                const tolerance = value as RiskTolerance;
                const preset = RISK_PRESETS[tolerance];
                setRiskForm((f) => ({
                  ...f,
                  riskTolerance: tolerance,
                  maxDailyLossPct: preset.maxDailyLossPct,
                  maxDrawdownPct: preset.maxDrawdownPct,
                  maxPositionPct: preset.maxPositionPct,
                  maxPositionSize: Math.round(f.accountSize * preset.maxPositionSizePct / 100),
                  maxSingleTradeLoss: Math.round(f.accountSize * preset.maxSingleTradeLossPct / 100),
                }));
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Max Daily Loss %"
              type="number"
              value={riskForm.maxDailyLossPct}
              onChange={(e) => setRiskForm((f) => ({ ...f, maxDailyLossPct: Number(e.target.value) }))}
              step={0.5}
              min={0.1}
            />
            <Input
              label="Max Drawdown %"
              type="number"
              value={riskForm.maxDrawdownPct}
              onChange={(e) => setRiskForm((f) => ({ ...f, maxDrawdownPct: Number(e.target.value) }))}
              step={1}
              min={1}
            />
            <Input
              label="Max Position %"
              type="number"
              value={riskForm.maxPositionPct}
              onChange={(e) => setRiskForm((f) => ({ ...f, maxPositionPct: Number(e.target.value) }))}
              step={0.5}
              min={0.5}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Max Position Size (shares)"
              type="number"
              value={riskForm.maxPositionSize}
              onChange={(e) => setRiskForm((f) => ({ ...f, maxPositionSize: Number(e.target.value) }))}
              min={1}
            />
            <Input
              label="Max Single Trade Loss ($)"
              type="number"
              value={riskForm.maxSingleTradeLoss}
              onChange={(e) => setRiskForm((f) => ({ ...f, maxSingleTradeLoss: Number(e.target.value) }))}
              min={1}
            />
          </div>

          {riskError && <p className="text-sm text-bearish">{riskError}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveRiskProfile} loading={riskSaving}>
              Save Risk Profile
            </Button>
            {riskSaved && (
              <span className="text-sm text-bullish flex items-center gap-1">
                <Check className="w-4 h-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </Card>

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
            onChange={(value) => setBrokerForm((f) => ({ ...f, environment: value }))}
          />

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
          >
            {editingBroker ? "Update" : "Save"}
          </Button>
        </ModalFooter>
      </Modal>

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
