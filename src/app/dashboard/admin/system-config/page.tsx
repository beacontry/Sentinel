"use client";

// Admin-only page for rotating server-wide encrypted API keys (Groq,
// Finnhub, Anthropic). Replaces the prior "SSH into the droplet, edit
// /opt/apps/sentinel/.env, podman stop && rm && run" loop.
//
// UX rules:
//   - Plaintext values are NEVER displayed back after save — only last-4 mask
//   - "Test before save" hits the live provider with a 1-token ping using
//     the candidate key; the value is not persisted
//   - Every save emits a hash-chained audit row (SYSTEM_CONFIG_UPDATED)
//
// Only role=admin can reach this page; the underlying API enforces the gate
// independently (defense in depth).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Modal, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { ArrowLeft, Check, X, ShieldAlert } from "lucide-react";
import { AppSettingsCard } from "@/components/admin/app-settings-card";
import { ApiUsageCard } from "@/components/admin/api-usage-card";

interface ConfigEntry {
  key: string;
  hasValue: boolean;
  masked: string;
  source: "db" | "env" | "none";
  updatedAt: string | null;
  updatedBy: string | null;
}

const KEY_HELP: Record<string, { name: string; description: string; provider: string; rotation: string }> = {
  GROQ_API_KEY: {
    name: "Groq",
    description:
      "Powers AI Insights, Quick Insight widget, hybrid signal scoring, sentiment layer, filings chat, market digest, AI chat, and trade summaries. Without this, all AI features fall back to non-AI heuristics.",
    provider: "groq.com",
    rotation: "Rotate quarterly or any time a key may have leaked.",
  },
  FINNHUB_API_KEY: {
    name: "Finnhub",
    description:
      "Powers earnings dates, recommendations, fundamentals, insider transactions, social sentiment, congressional trades, and news. Without this, those panels show 'not configured'.",
    provider: "finnhub.io",
    rotation:
      "Finnhub clients are constructed at process boot and read the value once — rotating here requires an app restart to take effect.",
  },
  ANTHROPIC_API_KEY: {
    name: "Anthropic",
    description:
      "Not currently used. Reserved for future direct-Claude features (currently all AI flows go through Groq).",
    provider: "console.anthropic.com",
    rotation: "Safe to leave blank.",
  },
  REDDIT_CLIENT_ID: {
    name: "Reddit Client ID",
    description:
      "First half of a Reddit OAuth client-credentials pair (register a 'script' or 'installed' app at reddit.com/prefs/apps). When both halves are set, the Analysis → Reddit tab pulls full post data (score, comments, flair) via oauth.reddit.com instead of the RSS fallback. Without it, RSS still works on datacenter IPs but score-sorting is unavailable.",
    provider: "reddit.com/prefs/apps",
    rotation: "Pair both halves. Either alone is a no-op — the OAuth path silently falls back to RSS.",
  },
  REDDIT_CLIENT_SECRET: {
    name: "Reddit Client Secret",
    description:
      "Second half of the Reddit OAuth pair. See Reddit Client ID above. Tokens mint on first use and cache for 23h.",
    provider: "reddit.com/prefs/apps",
    rotation: "Pair both halves. Either alone is a no-op — the OAuth path silently falls back to RSS.",
  },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never set";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function SystemConfigPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ConfigEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Replace modal state
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system-config");
      if (res.status === 403) {
        setLoadError("Admin role required.");
        return;
      }
      if (!res.ok) {
        setLoadError(`Failed to load (${res.status})`);
        return;
      }
      const data = await res.json();
      setEntries(data.entries as ConfigEntry[]);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message ?? "Network error");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openReplace(key: string) {
    setEditKey(key);
    setEditValue("");
    setTestResult(null);
  }

  function closeReplace() {
    setEditKey(null);
    setEditValue("");
    setTestResult(null);
    setTesting(false);
    setSaving(false);
  }

  async function handleTest() {
    if (!editKey || !editValue.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/system-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editKey, value: editValue.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message ?? "Network error" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!editKey || !editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editKey, value: editValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ type: "error", message: data?.error ?? `Save failed (${res.status})` });
        return;
      }
      toast({ type: "success", message: `${editKey} saved` });
      closeReplace();
      void refresh();
    } catch (err) {
      toast({ type: "error", message: (err as Error).message ?? "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Admin
        </Link>
        <PageIntro
          eyebrow="Admin"
          title="System Configuration"
          description="Server-wide API keys. Encrypted at rest (AES-256-GCM). Every rotation is captured in the hash-chained audit log."
        />
      </div>

      <Card>
        <div className="flex items-start gap-3 text-xs text-text-secondary leading-relaxed">
          <ShieldAlert className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p>
            <span className="text-text-primary font-medium">Storage:</span> values are
            stored in the <code className="font-mono text-text-primary">system_config</code> table
            encrypted with the server&apos;s <code className="font-mono">ENCRYPTION_KEY</code>.
            On read, DB takes precedence over <code className="font-mono">process.env</code>; the
            env fallback exists so the app boots cleanly on fresh installs.
            Plaintext values are never returned by any API or displayed in this UI after save —
            only the last 4 characters are shown.
          </p>
        </div>
      </Card>

      {loadError && (
        <Card>
          <p className="text-sm text-bearish">{loadError}</p>
        </Card>
      )}

      {!entries && !loadError && (
        <Card>
          <Skeleton className="h-24 w-full" />
        </Card>
      )}

      {entries && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((e) => {
            const help = KEY_HELP[e.key] ?? {
              name: e.key,
              description: "",
              provider: "",
              rotation: "",
            };
            return (
              <Card key={e.key}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-text-primary">
                        {help.name}
                      </h3>
                      <code className="font-mono text-xs text-text-muted">{e.key}</code>
                      {e.source === "db" && (
                        <Badge variant="bullish">DB</Badge>
                      )}
                      {e.source === "env" && (
                        <Badge variant="warning">ENV fallback</Badge>
                      )}
                      {e.source === "none" && (
                        <Badge variant="neutral">Not set</Badge>
                      )}
                    </div>
                    {help.description && (
                      <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                        {help.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-col gap-1 text-xs text-text-muted">
                      <div>
                        Current value:{" "}
                        <code className="font-mono text-text-primary">{e.masked}</code>
                      </div>
                      <div>
                        Updated:{" "}
                        <span className="font-mono">
                          {relativeTime(e.updatedAt)}
                          {e.updatedBy ? ` by ${e.updatedBy.slice(0, 8)}…` : ""}
                        </span>
                      </div>
                      {help.provider && (
                        <div>
                          Provider:{" "}
                          <a
                            href={`https://${help.provider}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            {help.provider}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openReplace(e.key)}
                    >
                      {e.hasValue ? "Replace" : "Set"}
                    </Button>
                  </div>
                </div>
                {help.rotation && (
                  <p className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border/40 italic">
                    {help.rotation}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* App settings (non-secret feature flags) — sibling card to the API keys above */}
      <AppSettingsCard />

      {/* External API usage — server-wide daily aggregate */}
      <ApiUsageCard />

      {/* Replace modal */}
      <Modal open={editKey !== null} onClose={closeReplace}>
        <ModalHeader>
          <ModalTitle>
            {entries?.find((e) => e.key === editKey)?.hasValue ? "Replace" : "Set"} {editKey}
          </ModalTitle>
        </ModalHeader>
        <div className="space-y-4">
          <Input
            label="API key"
            type="password"
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setTestResult(null);
            }}
            placeholder="Paste the key — never shown again after save"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTest}
              loading={testing}
              disabled={!editValue.trim() || saving}
            >
              Test before save
            </Button>
            {testResult?.ok === true && (
              <span className="inline-flex items-center gap-1 text-xs text-bullish">
                <Check className="w-3.5 h-3.5" />
                Key works
              </span>
            )}
            {testResult?.ok === false && (
              <span className="inline-flex items-center gap-1 text-xs text-bearish">
                <X className="w-3.5 h-3.5" />
                {testResult.error ?? "Test failed"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Testing hits the provider with a 1-token ping and never persists the
            value. Saving encrypts the value and writes an audit row tagged{" "}
            <code className="font-mono">system_config.updated</code>.
          </p>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={closeReplace} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!editValue.trim() || testing}
          >
            Save
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
