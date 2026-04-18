"use client";

import { useState, useEffect } from "react";
import type { DiscordWebhook, UserRiskProfile, RiskTolerance } from "@/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageIntro } from "@/components/layout/page-intro";
import { Webhook, Plus, Trash2, TestTube, Check, X, Shield } from "lucide-react";

const RISK_TOLERANCE_OPTIONS = [
  { value: "conservative", label: "Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
];

const RISK_PRESETS: Record<RiskTolerance, {
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxPositionPct: number;
  maxPositionSizePct: number; // % of account size, converted to shares later
  maxSingleTradeLossPct: number; // % of account size
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

export default function SettingsPage() {
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

  useEffect(() => {
    async function load() {
      try {
        const [webhookRes, riskRes] = await Promise.all([
          fetch("/api/webhooks/discord"),
          fetch("/api/risk-profile"),
        ]);
        if (webhookRes.ok) {
          const data = await webhookRes.json();
          setWebhooks(data.webhooks ?? []);
        }
        if (riskRes.ok) {
          const data = await riskRes.json();
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
      } catch {
        // Will show defaults
      }
    }
    load();
  }, []);

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

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl">
      <PageIntro
        eyebrow="Desk Controls"
        title="Settings"
        description="Configure the operational defaults of the workspace: risk posture, integrations, and notification plumbing."
        stats={[
          { label: "Webhooks", value: webhooks.length },
          { label: "Risk Tier", value: riskForm.riskTolerance, tone: "brand" },
          { label: "Account Size", value: `$${riskForm.accountSize.toLocaleString()}` },
          { label: "Status", value: riskSaved ? "Saved" : "Editing", tone: riskSaved ? "bullish" : "neutral" },
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
