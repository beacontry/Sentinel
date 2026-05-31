"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2, Clock, CheckCircle } from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface AlertRule {
  id: string;
  symbol: string;
  // Friendly label shown in the rules list (e.g. "AAPL above $200"). Stored
  // in DB as `indicator_field` for legacy reasons — was originally the
  // name of the indicator column being watched; now it's the human label.
  indicatorField: string;
  // Rule-type code: "price_above" / "rsi_below" / "macd_crossover" / etc.
  // Stored in DB as `operator` for legacy reasons.
  operator: string;
  value: number;
  channel?: string;
  enabled: boolean;
  lastTriggered: string | null;
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

  // Form state. Field names match the API contract — see
  // src/app/api/alerts/route.ts createAlertSchema.
  const [indicatorField, setIndicatorField] = useState("");
  const [symbol, setSymbol] = useState("");
  const [operator, setOperator] = useState("price_above");
  const [value, setValue] = useState(0);

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
    if (!indicatorField.trim() || !symbol.trim()) return;
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: symbol.toUpperCase(),
        indicatorField,
        operator,
        value,
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setIndicatorField("");
      setSymbol("");
      setValue(0);
      await loadRules();
    }
  }

  /**
   * One-click template — pre-fills the form with a sensible rule and
   * fires create immediately. Saves the new user from having to
   * understand the rule-type dropdown.
   */
  async function applyTemplate(template: {
    label: string;
    symbol: string;
    operator: string;
    value: number;
  }) {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: template.symbol.toUpperCase(),
        indicatorField: template.label,
        operator: template.operator,
        value: template.value,
      }),
    });
    if (res.ok) {
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
      <PaywallBanner minTier="trader" featureName="Alerts" description="Price + signal alerts with Discord/email/push delivery." />
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
                value={indicatorField}
                onChange={(e) => setIndicatorField(e.target.value)}
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
                  value={operator}
                  onChange={(v) => setOperator(v)}
                />
              </div>
              <Input
                label={thresholdConfig[operator]?.label ?? "Threshold"}
                type="number"
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                placeholder={thresholdConfig[operator]?.placeholder ?? "0"}
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
          <div className="py-6 text-center">
            <p className="text-sm text-text-muted">No alert rules yet</p>
            <p className="text-xs text-text-muted mt-1 max-w-md mx-auto">
              Pick a template below for a one-click start, or build a custom rule.
            </p>

            {/* One-click templates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5 max-w-xl mx-auto text-left">
              {[
                {
                  label: "AAPL oversold (RSI < 30)",
                  symbol: "AAPL",
                  operator: "rsi_below",
                  value: 30,
                  desc: "Notify when AAPL's 14-day RSI drops below 30 (oversold territory).",
                },
                {
                  label: "SPY overbought (RSI > 70)",
                  symbol: "SPY",
                  operator: "rsi_above",
                  value: 70,
                  desc: "Notify when SPY's 14-day RSI rises above 70 (overbought territory).",
                },
                {
                  label: "NVDA strong signal",
                  symbol: "NVDA",
                  operator: "signal_generated",
                  value: 2,
                  desc: "Notify when the engine generates a STRONG_BUY or STRONG_SELL on NVDA.",
                },
                {
                  label: "TSLA 5% drop",
                  symbol: "TSLA",
                  operator: "pct_drop",
                  value: 5,
                  desc: "Notify when TSLA drops 5%+ from its recent high.",
                },
                {
                  label: "QQQ above SMA-20",
                  symbol: "QQQ",
                  operator: "price_above_sma",
                  value: 20,
                  desc: "Notify when QQQ's price crosses above its 20-day moving average.",
                },
                {
                  label: "MSFT EMA bullish cross",
                  symbol: "MSFT",
                  operator: "ema_crossover",
                  value: 0,
                  desc: "Notify when MSFT's 9-EMA crosses above its 21-EMA (bullish trend).",
                },
              ].map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t)}
                  className="text-left rounded-lg border border-border bg-bg-elevated p-3 hover:border-accent hover:bg-bg-hover transition-colors min-h-[44px]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Plus className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-sm font-medium text-text-primary">
                      {t.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-snug">
                    {t.desc}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 justify-center mt-5">
              <span className="text-xs text-text-muted">or</span>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(true)}>
                Build a custom alert
              </Button>
            </div>
          </div>
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
                    <span className="text-sm font-medium truncate">{rule.indicatorField}</span>
                    <Badge variant="neutral">{rule.symbol}</Badge>
                    <Badge variant="neutral">{ruleTypeLabels[rule.operator] ?? rule.operator}</Badge>
                  </div>
                  <p className="text-xs text-text-muted">
                    Threshold: {rule.value}
                    {rule.lastTriggered && (
                      <span className="ml-3">
                        Last fired: {new Date(rule.lastTriggered).toLocaleString()}
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
        <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            Alert History
          </CardTitle>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm(`Clear all ${history.length} alert history entries?`)) return;
                try {
                  const res = await fetch("/api/alerts/history", { method: "DELETE" });
                  if (res.ok) {
                    setHistory([]);
                  }
                } catch {
                  /* silent */
                }
              }}
            >
              Clear all
            </Button>
          )}
        </CardHeader>
        {history.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-text-muted">No alerts triggered yet</p>
            <p className="text-xs text-text-muted mt-1">
              When one of your rules fires, the event appears here and (if enabled) goes to email / push.
            </p>
          </div>
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
