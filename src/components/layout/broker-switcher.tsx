"use client";

// Global broker-account selector mounted in the sidebar. Shows the
// active broker connection (broker + environment + custom label) and lets
// the user atomically switch to another. Switching is refused while the
// engine is running — the in-memory position map belongs to the old
// account and would silently drift if we let the next scan resolve a
// different broker.

import { useCallback, useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Briefcase,
  Check,
  ChevronDown,
  Plus,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

interface BrokerConnection {
  id: string;
  broker: string;
  label: string;
  environment: "paper" | "live";
  isActive: boolean;
}

interface EngineStatus {
  running: boolean;
}

// How often to re-poll connections + engine status. We're checking
// engine-running so the dropdown can refuse a switch the instant the
// user starts the engine elsewhere. 15s is plenty — switching is a rare
// human action.
const POLL_MS = 15_000;

const brokerLabel: Record<string, string> = {
  alpaca: "Alpaca",
  ibkr: "Interactive Brokers",
  tradier: "Tradier",
};

function describe(c: BrokerConnection): string {
  const broker = brokerLabel[c.broker] ?? c.broker;
  const env = c.environment === "live" ? "Live" : "Paper";
  // Default label "Default" reads weird in a dropdown; suppress it.
  if (c.label && c.label !== "Default") {
    return `${broker} · ${env} · ${c.label}`;
  }
  return `${broker} · ${env}`;
}

export function BrokerSwitcher() {
  const toast = useToast();
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [engineRunning, setEngineRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      // Parallel fetch — connections + engine status are independent.
      const [connRes, engineRes] = await Promise.all([
        fetch("/api/broker/connections"),
        fetch("/api/trader/engine"),
      ]);
      if (connRes.ok) {
        const data = await connRes.json();
        setConnections(data.connections ?? []);
      }
      if (engineRes.ok) {
        const data = await engineRes.json();
        setEngineRunning(data.data?.running === true);
      }
    } catch {
      // Non-critical — the switcher just shows whatever was last cached
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const active = connections.find((c) => c.isActive) ?? null;

  async function switchTo(c: BrokerConnection) {
    if (c.isActive || submitting) return;
    if (engineRunning) {
      toast.toast({
        type: "warning",
        message: "Stop the engine before switching broker accounts.",
      });
      return;
    }

    // Confirm live-account switches — same friction as initial live setup
    if (c.environment === "live") {
      const ok = confirm(
        `Switch to LIVE trading on ${brokerLabel[c.broker] ?? c.broker}?\n\nAny trade you place will use real money. The engine remains stopped — you must start it manually.`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/broker/connections/${c.id}/activate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.toast({
          type: "error",
          message:
            typeof data.error === "string"
              ? data.error
              : "Could not switch broker.",
        });
        return;
      }
      toast.toast({ type: "success", message: `Active broker: ${describe(c)}` });
      await fetchAll();
    } catch {
      toast.toast({ type: "error", message: "Could not switch broker." });
    } finally {
      setSubmitting(false);
    }
  }

  // Single-connection users see a static label; switcher only renders when
  // there's something to switch *to*.
  if (!loaded) {
    return (
      <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border/50 bg-bg-secondary/40 px-2.5 py-1.5">
        <Briefcase className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-[11px] text-text-muted">Loading…</span>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <Link
        href="/dashboard/settings"
        className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5
          text-[11px] text-warning hover:bg-warning/15 transition-colors"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Connect a broker…</span>
      </Link>
    );
  }

  if (connections.length === 1 && active) {
    return (
      <div
        className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-border/50 bg-bg-secondary/40 px-2.5 py-1.5"
        title={describe(active)}
      >
        <Briefcase className="h-3.5 w-3.5 text-text-muted shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-text-primary truncate">
            {brokerLabel[active.broker] ?? active.broker}
          </div>
          <div
            className={`text-[9px] uppercase tracking-wider ${
              active.environment === "live" ? "text-bearish" : "text-text-muted"
            }`}
          >
            {active.environment === "live" ? "LIVE" : "Paper"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-border/50 bg-bg-secondary/40
            px-2.5 py-1.5 text-left transition-colors hover:bg-bg-hover hover:border-border"
          aria-label="Switch broker account"
          title={active ? describe(active) : "Choose a broker"}
        >
          <Briefcase className="h-3.5 w-3.5 text-text-muted shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-text-primary truncate">
              {active ? brokerLabel[active.broker] ?? active.broker : "No active"}
            </div>
            <div
              className={`text-[9px] uppercase tracking-wider ${
                active?.environment === "live" ? "text-bearish" : "text-text-muted"
              }`}
            >
              {active?.environment === "live" ? "LIVE" : active ? "Paper" : "—"}
            </div>
          </div>
          <ChevronDown className="h-3 w-3 text-text-muted shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[260px] max-w-[320px] rounded-lg border border-border bg-bg-elevated p-1 animate-scale-in shadow-lg"
        >
          {engineRunning && (
            <div className="rounded-md bg-warning/10 px-3 py-2 mb-1 text-[11px] text-warning border border-warning/30">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>Stop the engine to switch accounts.</span>
              </div>
            </div>
          )}
          <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">
            Broker accounts
          </div>
          {connections.map((c) => {
            const isLive = c.environment === "live";
            const disabled = engineRunning && !c.isActive;
            return (
              <DropdownMenu.Item
                key={c.id}
                onSelect={(e) => {
                  if (disabled) {
                    e.preventDefault();
                    return;
                  }
                  switchTo(c);
                }}
                disabled={disabled}
                className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm
                  ${disabled
                    ? "text-text-muted/50 cursor-not-allowed"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary focus:bg-bg-hover focus:text-text-primary cursor-pointer"
                  } outline-none`}
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${c.isActive ? "text-accent" : "text-transparent"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-text-primary truncate">
                      {brokerLabel[c.broker] ?? c.broker}
                      {c.label && c.label !== "Default" ? ` · ${c.label}` : ""}
                    </span>
                    <span
                      className={`block text-[9px] uppercase tracking-wider ${
                        isLive ? "text-bearish font-semibold" : "text-text-muted"
                      }`}
                    >
                      {isLive ? "LIVE — REAL MONEY" : "Paper"}
                    </span>
                  </span>
                </span>
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-accent hover:bg-accent/10 focus:bg-accent/10 cursor-pointer outline-none"
            >
              <Plus className="h-3 w-3" />
              Manage connections…
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
