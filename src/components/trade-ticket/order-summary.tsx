"use client";

import type { ReactNode } from "react";
import { AlertTriangle, HelpCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Inset } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { usd } from "@/components/trader/types";
import type { TicketEngineState } from "@/lib/trader-view";
import {
  blockedReason,
  describePosition,
  submitLabel,
  type OrderSide,
  type ResultingPosition,
  type TicketAccount,
} from "@/lib/order-ticket";

/**
 * What the order would do, and the one button that sends it. Sticky beside
 * the form from lg up; below the form on a phone.
 *
 * The estimated cost (or proceeds) first, at display size, with what it is
 * taken on; then buying power, what is held now and what a full fill would
 * leave. Each figure has its own unknown:
 * "Price unavailable", "Unavailable" when the broker read failed, never a
 * zero that reads as a real balance or "none held".
 *
 * The button names the account and the side ("Place paper buy", "Place
 * LIVE sell") and prints why it is disabled under it. The engine's state
 * closes the panel, since a running engine is what most often blocks it.
 */

interface OrderSummaryProps {
  side: OrderSide;
  estimate: number | null;
  /** What the estimate is taken on ("25 shares at the last price, $228.40"). */
  basis: string | null;
  /** The estimate is missing because no price could be read (market and stop orders). */
  estimateNeedsPrice: boolean;
  /** Null when the balance could not be read. */
  buyingPower: number | null;
  /** Signed shares held; null when the positions could not be read. */
  held: number | null;
  result: ResultingPosition | null;
  account: TicketAccount;
  engine: TicketEngineState;
  /** The account is being read (first load, or again after a switch). */
  reading: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onRetryEngine: () => void;
}

const PANEL = "min-w-0 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:sticky lg:top-4 lg:p-5";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 last:pb-0">
      <dt className="shrink-0 text-sm text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-sm tabular-nums text-text-primary">{children}</dd>
    </div>
  );
}

const unavailable = <span className="font-sans text-text-muted">Unavailable</span>;

export function OrderSummary(p: OrderSummaryProps) {
  const pending = <Skeleton className="ml-auto h-4 w-20" />;
  const overBuyingPower =
    p.side === "buy" && p.estimate !== null && p.buyingPower !== null && p.estimate > p.buyingPower;
  const disabled =
    p.reading || p.submitting || p.engine !== "stopped" || (p.account !== "paper" && p.account !== "live");

  return (
    <section aria-labelledby="ticket-summary-heading" className={PANEL}>
      <h2 id="ticket-summary-heading" className="mb-3 text-sm font-semibold text-text-primary">
        Order summary
      </h2>

      <Inset as="dl">
        <div className="pb-3">
          <dt className="eyebrow text-text-muted">{p.side === "buy" ? "Estimated cost" : "Estimated proceeds"}</dt>
          <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
            {p.estimate !== null ? (
              usd(p.estimate)
            ) : (
              <span className="font-sans text-sm font-normal text-text-muted">
                {p.estimateNeedsPrice ? "Price unavailable" : "Enter a size"}
              </span>
            )}
          </dd>
          {p.estimate !== null && p.basis && <dd className="mt-0.5 text-xs text-text-secondary">{p.basis}</dd>}
        </div>
        <div className="divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)]">
          <Row label="Buying power">
            {p.reading ? pending : p.buyingPower !== null ? usd(p.buyingPower) : unavailable}
          </Row>
          <Row label="Held now">{p.reading ? pending : p.held !== null ? describePosition(p.held) : unavailable}</Row>
          <Row label="After fill">
            {p.reading ? (
              pending
            ) : p.result ? (
              describePosition(p.result.qty, p.result.approximate)
            ) : p.held === null ? (
              unavailable
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </Row>
        </div>
      </Inset>

      {overBuyingPower && (
        <p className="mt-3 flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          More than your buying power. The broker is likely to reject it.
        </p>
      )}

      <div className="mt-4 [&>span]:w-full">
        <Button
          variant={p.side === "buy" ? "primary" : "destructive"}
          onClick={p.onSubmit}
          disabled={disabled}
          disabledReason={p.reading ? undefined : blockedReason(p.engine, p.account)}
          loading={p.submitting}
          className="w-full"
        >
          {submitLabel(p.side, p.account)}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-hairline-inner)] pt-3">
        <span className="text-xs text-text-muted">Trading engine</span>
        <EngineChip engine={p.engine} />
      </div>
      {p.engine === "unknown" && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-warning">
          Orders are off until the engine status is read.
          <Button variant="ghost" size="sm" onClick={p.onRetryEngine} loading={p.reading}>
            Retry
          </Button>
        </p>
      )}
    </section>
  );
}

function EngineChip({ engine }: { engine: TicketEngineState }) {
  if (engine === "running") {
    return (
      <StatusChip tone="warning" icon={<ShieldAlert className="h-3 w-3" />}>
        Running, orders blocked
      </StatusChip>
    );
  }
  if (engine === "stopped") {
    return <StatusChip>Stopped</StatusChip>;
  }
  if (engine === "unknown") {
    return (
      <StatusChip tone="warning" icon={<HelpCircle className="h-3 w-3" />}>
        Status unknown
      </StatusChip>
    );
  }
  return <StatusChip>Checking</StatusChip>;
}

/** The summary's shape while the first read is in flight. */
export function OrderSummarySkeleton() {
  return (
    <div className={PANEL} aria-hidden="true">
      <Skeleton className="mb-3 h-4 w-28" />
      <div className="space-y-3 rounded-lg bg-bg-surface p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-4 h-11" rounded="lg" />
    </div>
  );
}
