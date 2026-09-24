"use client";

import { RotateCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Inset } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import { hasLoaded, type LoadState } from "@/lib/trader-view";
import { DeskPanel } from "./desk-panel";
import type { TaxStatus } from "./types";

/**
 * The section 475(f) mark-to-market election and the wash-sale protection
 * it switches. Rendering only; the page loads and saves the election.
 *
 * The switch stays disabled (and aria-busy) until the stored election
 * has loaded, so a flip can never re-assert from an unknown state. A
 * failed load says so and offers a retry.
 */

interface TaxElectionPanelProps {
  taxStatus: TaxStatus | null;
  load: LoadState;
  saving: boolean;
  onToggle: (next: boolean) => void;
  onRetry: () => void;
  /** From the engine status; undefined when the engine status is unknown. */
  washSaleOn: boolean | undefined;
  washSaleBlockedCount: number;
}

export function TaxElectionPanel({
  taxStatus,
  load,
  saving,
  onToggle,
  onRetry,
  washSaleOn,
  washSaleBlockedCount,
}: TaxElectionPanelProps) {
  const loaded = hasLoaded(load);
  return (
    <DeskPanel id="trader-tax" title="Tax election" description="Self-attested. Applies on the next engine start.">
      <Toggle
        id="trader-mtm-election"
        label={`I have elected §475(f) mark-to-market${taxStatus?.mtmElectionYear ? ` (${taxStatus.mtmElectionYear})` : ""}`}
        checked={taxStatus?.hasTraderTaxStatus === true}
        onCheckedChange={onToggle}
        disabled={saving || !loaded}
        aria-busy={load.status === "loading" || saving}
      />
      {load.status === "error" && !loaded && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bearish">
          <span>{load.error}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}
      <p className="mt-1 text-xs text-text-muted">
        MTM traders are exempt from the §1091 wash-sale rule. The election deadline was April 15 of the prior tax year.
        Beacontry does not file or validate it.
      </p>

      <Inset className="mt-3 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Wash-sale protection</span>
          {washSaleOn === undefined ? (
            <StatusChip>Unknown</StatusChip>
          ) : washSaleOn ? (
            <StatusChip tone="accent" icon={<ShieldCheck className="h-3 w-3" />}>
              On
            </StatusChip>
          ) : (
            <StatusChip icon={<ShieldOff className="h-3 w-3" />}>Off</StatusChip>
          )}
          {washSaleBlockedCount > 0 && (
            <span className="font-mono text-xs text-text-muted">
              {washSaleBlockedCount} symbol{washSaleBlockedCount === 1 ? "" : "s"} blocked
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted">
          {washSaleOn === undefined
            ? "Shown once the engine status loads."
            : washSaleOn
              ? "Re-entries are blocked for 31 days after any losing close."
              : "MTM elected, so the wash-sale rule does not apply."}
        </p>
      </Inset>
    </DeskPanel>
  );
}
