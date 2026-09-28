"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedValue } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWidgetJson } from "@/lib/widget-load";
import { formatUsd } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetFacts, WidgetFigure } from "./widget-body";

interface NetWorthSummary {
  total: number;
  manual: { total: number; portfolios: { id: string; name: string; value: number }[] };
  broker: {
    total: number;
    positions: { symbol: string; qty: number; marketValue: number; unrealizedPnl: number }[];
    /** Seconds since the broker position cache was filled; null when never. */
    cacheAge: number | null;
  };
}

/**
 * Paper portfolios plus broker positions from /api/portfolio/summary. The
 * broker half comes from a cache; past five minutes old it says its age.
 */
export function NetWorthWidget() {
  const load = useWidgetLoad<NetWorthSummary>((signal) =>
    fetchWidgetJson<NetWorthSummary>("/api/portfolio/summary", signal, { cache: "no-store" }),
  );

  return (
    <WidgetBody
      load={load}
      label="net worth"
      skeleton={
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1.5 h-8 w-40" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        </div>
      }
      isEmpty={(d) => !(d.manual.total > 0 || d.broker.total > 0)}
      empty={
        <EmptyState
          compact
          kind="not-connected"
          icon={<Landmark />}
          title="Nothing to add up yet"
          description="Connect a broker or create a paper portfolio."
        />
      }
    >
      {({ total, manual, broker }) => {
        const unrealized = broker.positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
        const facts = [
          ...(broker.total > 0 ? [{ label: "Broker positions", value: formatUsd(broker.total) }] : []),
          ...(broker.positions.length > 0 ? [{ label: "Unrealized", value: <SignedValue value={unrealized} /> }] : []),
          ...(manual.total > 0 ? [{ label: "Paper portfolios", value: formatUsd(manual.total) }] : []),
        ];
        return (
          <div>
            <WidgetFigure label="Total">
              <span className="font-mono text-text-primary">{formatUsd(total)}</span>
            </WidgetFigure>
            <WidgetFacts items={facts} />
            {broker.cacheAge !== null && broker.cacheAge > 300 && (
              <p className="mt-2 text-xs text-text-muted">Broker figures are {Math.floor(broker.cacheAge / 60)}m old.</p>
            )}
            <Link
              href="/dashboard/education#calculators"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:text-accent-hover"
            >
              FIRE number calculator
            </Link>
          </div>
        );
      }}
    </WidgetBody>
  );
}
