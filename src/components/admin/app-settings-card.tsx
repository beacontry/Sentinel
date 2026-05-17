"use client";

// Admin UI for the non-secret app_settings KV (feature flags).
// Sibling of the API-key card on /dashboard/admin/system-config.
//
// Renders one toggle per allow-listed key. Each toggle PATCHes
// /api/admin/app-settings. No "Test before save" flow because there's
// nothing to test — values are just app config.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ToggleLeft } from "lucide-react";

interface AppSetting {
  key: string;
  value: string;
  isDefault: boolean;
}

// Friendly metadata per key. Mirror the KNOWN_KEYS list in
// src/lib/app-settings.ts.
const KEY_META: Record<string, { label: string; description: string; truthyMeans: string }> = {
  REGISTRATION_OPEN: {
    label: "Public registration open",
    description:
      "When off, /api/auth/register returns 503 for anonymous signup attempts. Invite-token signups still work — admin can hand out access during an incident. Existing users unaffected.",
    truthyMeans: "Public signup form on /register accepts new accounts",
  },
  NOTIFY_ADMINS_ON_REGISTER: {
    label: "Email admins on new signups",
    description:
      "Sends an alert email (via Resend) to every admin's notificationEmail ?? email whenever a new account is created (public OR invite). Useful for catching abuse early; mute during a Show HN spike to avoid inbox flood.",
    truthyMeans: "All admins get an email per new signup",
  },
};

function isTruthy(v: string): boolean {
  const lower = v.toLowerCase();
  return lower === "true" || lower === "1" || lower === "yes" || lower === "on";
}

export function AppSettingsCard() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/app-settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSettings(data.settings ?? []);
    } catch {
      toast.toast({ type: "error", message: "Failed to load app settings" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleToggle = useCallback(
    async (key: string, currentValue: string) => {
      const newValue = isTruthy(currentValue) ? "false" : "true";
      setSavingKey(key);
      try {
        const res = await fetch("/api/admin/app-settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, value: newValue }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        toast.toast({
          type: "success",
          message: `${KEY_META[key]?.label ?? key} → ${newValue}`,
        });
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Update failed";
        toast.toast({ type: "error", message: msg });
      } finally {
        setSavingKey(null);
      }
    },
    [refresh, toast]
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <ToggleLeft className="h-4 w-4 text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">App Settings</h2>
      </div>
      <p className="text-[12px] text-text-muted leading-relaxed mb-4">
        Operational feature flags. Non-secret, so values are visible. Each
        toggle writes an audit row tagged{" "}
        <code className="font-mono">system_config.updated</code> with{" "}
        <code className="font-mono">resourceType: app_setting</code>.
      </p>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="space-y-3">
          {settings.map((s) => {
            const meta = KEY_META[s.key];
            const truthy = isTruthy(s.value);
            return (
              <div
                key={s.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-bg-elevated p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">
                      {meta?.label ?? s.key}
                    </span>
                    <code className="font-mono text-[11px] text-text-muted">
                      {s.key}
                    </code>
                    {s.isDefault && (
                      <Badge variant="default">default</Badge>
                    )}
                  </div>
                  {meta?.description && (
                    <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                      {meta.description}
                    </p>
                  )}
                  <p className="text-[11px] text-text-muted mt-1.5">
                    <strong className="text-text-secondary">When ON:</strong>{" "}
                    {meta?.truthyMeans ?? "value is treated as true"}
                  </p>
                </div>
                <div className="shrink-0">
                  <Toggle
                    checked={truthy}
                    onCheckedChange={() => handleToggle(s.key, s.value)}
                    disabled={savingKey === s.key}
                    label={truthy ? "On" : "Off"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
