"use client";

/**
 * Safeguards onboarding modal — shown once per user.
 * Driven by users.safeguards_acknowledged_at; mounted in dashboard layout.
 */

import { useEffect, useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Lock, Activity, BarChart3, FileText } from "lucide-react";

export function SafeguardsOnboardingModal() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/safeguards-acknowledged");
        if (!res.ok) {
          setLoaded(true);
          return;
        }
        const data: { acknowledged: boolean } = await res.json();
        if (!cancelled) {
          setOpen(!data.acknowledged);
          setLoaded(true);
        }
      } catch {
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function acknowledge() {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/safeguards-acknowledged", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || !open) return null;

  return (
    <Modal open={open} onClose={() => { /* require explicit acknowledge */ }}>
      <ModalHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          <ModalTitle>Before you start trading</ModalTitle>
        </div>
      </ModalHeader>

      <div className="px-6 pb-2 space-y-4">
        <p className="text-sm text-text-secondary">
          Beacontry&apos;s trading engine has built-in safeguards to prevent runaway losses and regulatory mishaps.
          They&apos;re always on, even in paper mode. If you ever see an order rejected or the engine auto-halt,
          one of these is the reason — not a bug.
        </p>

        <div className="space-y-3">
          <Item icon={<BarChart3 className="w-4 h-4 text-warning" />} title="Daily loss + notional caps"
            body="Engine auto-halts when realized losses exceed your daily-loss %. Gross BUY notional per day is also capped — the engine stops once you've deployed enough capital." />
          <Item icon={<Activity className="w-4 h-4 text-warning" />} title="Consecutive-loss halt + order rate limit"
            body="N losing trades in a row → halt. 30+ orders in 60s → blocked. SELLs are never blocked — exits always go through." />
          <Item icon={<Lock className="w-4 h-4 text-warning" />} title="Account-switch + broker-disconnect detection"
            body="Account number changes mid-session, equity drops > 50%, or 5 consecutive broker failures → engine halts. Requires manual restart to clear." />
          <Item icon={<AlertTriangle className="w-4 h-4 text-warning" />} title="Wash-sale + PDT protections"
            body="Engine blocks BUYs on any symbol with a losing exit in the last 31 days. Toggle §475(f) MTM on the Trader page to disable. On accounts under $25k, intraday mode is refused to prevent PDT lockout." />
          <Item icon={<FileText className="w-4 h-4 text-warning" />} title="Tamper-evident audit log"
            body="Every privileged action — login, broker connection change, engine start/stop, order placed or rejected — is recorded in a hash-chained log scoped to your user id." />
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-text-secondary">
          <strong className="text-warning">Live trading is admin-gated.</strong> By default the engine refuses to start
          on any live broker connection. Live access requires explicit server-side approval.
        </div>

        <p className="text-xs text-text-muted">
          Self-attested. Beacontry is not a registered broker-dealer or investment advisor. You are responsible for your
          own trades, tax reporting, and compliance.
        </p>
      </div>

      <ModalFooter>
        <Button onClick={acknowledge} loading={saving}>
          I understand — continue to dashboard
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function Item({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-bg-elevated/40 border border-border/40">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
