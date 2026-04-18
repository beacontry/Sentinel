"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2, Clock, CheckCircle } from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";

interface AlertRule {
  id: string;
  name: string;
  symbol: string;
  ruleType: string;
  threshold: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface AlertHistoryEntry {
  id: string;
  ruleName: string;
  symbol: string;
  ruleType: string;
  message: string;
  triggeredAt: string;
  acknowledged: boolean;
}

const ruleTypeLabels: Record<string, string> = {
  price_above: "Price Above",
  price_below: "Price Below",
  volume_spike: "Volume Spike",
  pct_drop: "% Drop",
  signal_generated: "Signal Generated",
  rsi_below: "RSI Below",
  rsi_above: "RSI Above",
  macd_crossover: "MACD Crossover",
  ema_crossover: "EMA Crossover",
  price_above_sma: "Price > SMA",
};

const ruleTypeOptions = [
  { value: "price_above", label: "Price Above" },
  { value: "price_below", label: "Price Below" },
  { value: "volume_spike", label: "Volume Spike (millions)" },
  { value: "pct_drop", label: "% Drop from High" },
  { value: "signal_generated", label: "Signal Generated (1=any, 2=strong)" },
  { value: "rsi_below", label: "RSI Below (oversold alert)" },
  { value: "rsi_above", label: "RSI Above (overbought alert)" },
  { value: "macd_crossover", label: "MACD Bullish Crossover" },
  { value: "ema_crossover", label: "EMA 9/21 Bullish Crossover" },
  { value: "price_above_sma", label: "Price Above SMA" },
];

const thresholdConfig: Record<string, { label: string; placeholder: string }> = {
  price_above: { label: "Price ($)", placeholder: "200.00" },
  price_below: { label: "Price ($)", placeholder: "150.00" },
  volume_spike: { label: "Volume (millions)", placeholder: "2.0" },
  pct_drop: { label: "Drop %", placeholder: "5" },
  signal_generated: { label: "Strength (1=any, 2=strong)", placeholder: "1" },
  rsi_below: { label: "RSI Level", placeholder: "30" },
  rsi_above: { label: "RSI Level", placeholder: "70" },
  macd_crossover: { label: "Threshold (unused)", placeholder: "0" },
  ema_crossover: { label: "Threshold (unused)", placeholder: "0" },
  price_above_sma: { label: "SMA Period (20 or 50)", placeholder: "20" },
};

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [ruleType, setRuleType] = useState("price_above");
  const [threshold, setThreshold] = useState(0);

  async function loadRules() {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules ?? []);
      }
    } catch {
      // Silent
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/alerts/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
      }
    } catch {
      // Silent
    }
  }

  useEffect(() => {
    Promise.all([loadRules(), loadHistory()]).then(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!name.trim() || !symbol.trim()) return;
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, symbol: symbol.toUpperCase(), ruleType, threshold }),
    });
    if (res.ok) {
      setShowCreate(false);
      setName("");
      setSymbol("");
      setThreshold(0);
      await loadRules();
    }
  }

  async function toggleRule(id: string, enabled: boolean) {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    await loadRules();
  }

  async function deleteRule(id: string) {
    await fetch("/api/alerts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadRules();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.trader} />
      <PageIntro
        eyebrow="Execution"
        title="Alerts"
        description="Set custom triggers for price levels, technical signals, and volume spikes."
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4" />
            New Alert
          </Button>
        }
        stats={[
          { label: "Total Rules", value: String(rules.length) },
          { label: "Active", value: String(rules.filter((r) => r.enabled).length), tone: "bullish" },
          { label: "Disabled", value: String(rules.filter((r) => !r.enabled).length) },
          { label: "Triggered", value: String(history.length) },
        ]}
      />

      {/* Create form */}
      {showCreate && (
        <Card>
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="AAPL above $200"
              />
              <Input
                label="Symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Select
                  label="Rule Type"
                  options={ruleTypeOptions}
                  value={ruleType}
                  onChange={(value) => setRuleType(value)}
                />
              </div>
              <Input
                label={thresholdConfig[ruleType]?.label ?? "Threshold"}
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                placeholder={thresholdConfig[ruleType]?.placeholder ?? "0"}
              />
              <div className="flex items-end">
                <Button onClick={handleCreate}>Create Alert</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Rules list */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" />
            Active Rules ({rules.length})
          </CardTitle>
        </CardHeader>
        {rules.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">
            No alert rules yet
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all
                  ${rule.enabled
                    ? "bg-bg-elevated border-border"
                    : "bg-bg-secondary border-border/50 opacity-60"
                  }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium truncate">{rule.name}</span>
                    <Badge variant="neutral">{rule.symbol}</Badge>
                    <Badge variant="neutral">{ruleTypeLabels[rule.ruleType] ?? rule.ruleType}</Badge>
                  </div>
                  <p className="text-xs text-text-muted">
                    Threshold: {rule.threshold}
                    {rule.lastTriggeredAt && (
                      <span className="ml-3">
                        Last fired: {new Date(rule.lastTriggeredAt).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleRule(rule.id, rule.enabled)}
                  className={rule.enabled
                    ? "bg-bullish/20 text-bullish hover:bg-bullish/30"
                    : "bg-bg-surface text-text-muted hover:bg-bg-elevated"
                  }
                >
                  {rule.enabled ? "ON" : "OFF"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteRule(rule.id)}
                  className="text-text-muted hover:text-bearish"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Alert history */}
      <Card>
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            Alert History
          </CardTitle>
        </CardHeader>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">
            No alerts triggered yet
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-bg-elevated border border-border"
              >
                <CheckCircle className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{entry.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <Badge variant="neutral">{entry.symbol}</Badge>
                    <span>{new Date(entry.triggeredAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
