"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, HelpCircle, RotateCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { connectionStat, type LoadState } from "@/lib/trader-view";
import { timeAgo } from "./types";

/**
 * How current the desk's figures are, in the page header. It replaces the
 * Connection tile and the refresh-failing banner:
 *
 * - "Broker online · Updated 12s ago" while polls succeed.
 * - "Refresh failing · Last updated 2m ago" once a poll fails, with the
 *   last good figures left on screen; RefreshFailingNotice below the
 *   header then names the failing source and offers a retry.
 * - The connection reads "Connection unknown" once the data is older than
 *   two poll intervals, rather than still claiming Online.
 *
 * The visible age ticks every few seconds, so it is aria-hidden; a
 * mounted role="status" line carries a sentence that changes only when
 * the state does, so a screen reader hears each change once.
 */

interface TraderFreshnessProps {
  load: LoadState;
  connected: boolean;
  intervalMs: number;
}

const TICK_MS = 5_000;

export function TraderFreshness({ load, connected, intervalMs }: TraderFreshnessProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      try {
        setNow(Date.now());
      } catch {
        // A missed tick only delays the age label.
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);
  // A new load result is newer than the last tick.
  const at = Math.max(now, load.lastSuccessAt ?? 0);

  const conn = connectionStat(connected, load, at, intervalMs);
  const failing = load.status === "error";
  const age = load.lastSuccessAt ? timeAgo(new Date(load.lastSuccessAt).toISOString()) : null;

  const announcement = failing
    ? `Refresh failing${conn.value === "Stale" ? ", connection unknown" : ""}. Figures may be out of date. ${load.error ?? ""}`
    : conn.value === "Online"
      ? "Broker online, figures current."
      : "Broker offline.";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end">
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {conn.value === "Stale" ? (
          <StatusChip icon={<HelpCircle className="h-3 w-3" />}>Connection unknown</StatusChip>
        ) : conn.value === "Online" ? (
          <StatusChip tone="bullish" icon={<Check className="h-3 w-3" strokeWidth={2.5} />}>
            Broker online
          </StatusChip>
        ) : (
          <StatusChip tone="bearish" icon={<Unplug className="h-3 w-3" />}>
            Broker offline
          </StatusChip>
        )}
        {failing && (
          <StatusChip tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
            Refresh failing
          </StatusChip>
        )}
        {age && (
          <span className="text-text-muted">
            {failing ? "Last updated" : "Updated"} {age}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A refresh failed and the figures on screen are the last good read. A
 * full-width warning under the header, naming the source that failed,
 * with a retry. Its age is the header's, which ticks; this one does not. Not role="alert": TraderFreshness already announces the
 * state change once, and a poll every 10s must not re-announce it.
 */
export function RefreshFailingNotice({ load, onRetry }: { load: LoadState; onRetry: () => void }) {
  if (load.status !== "error") return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warning-line bg-warning-fill px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
        <p className="min-w-0 text-text-secondary">
          <span className="font-semibold text-warning-fg">
            {load.lastSuccessAt ? "Showing the last good read." : "Refresh failing."}
          </span>{" "}
          Figures below may be out of date.
          {load.error && <span className="ml-1 font-mono text-xs text-text-muted">({load.error})</span>}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRetry} className="self-end sm:self-auto">
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        Retry now
      </Button>
    </div>
  );
}
