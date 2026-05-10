"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Leaf, AlertTriangle, BookOpen, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";

interface NetWorthSummary {
  broker: {
    positions: { symbol: string; qty: number; marketValue: number; unrealizedPnl: number }[];
  };
}

interface TaxStatus {
  hasTraderTaxStatus: boolean;
  mtmElectionYear: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Trader page tax callouts.
 *
 * Reads the broker position cache and the user's self-attested tax status,
 * and surfaces actionable callouts:
 *   - Total harvestable unrealized losses across open positions
 *   - MTM-elected: simplified messaging (no wash-sale concern)
 *   - Quick links to TLH calculator + wash-sale guide
 *
 * Renders nothing if there are no positions or no notable losses.
 */
export function TraderTaxCallouts() {
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [taxStatus, setTaxStatus] = useState<TaxStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s1, s2] = await Promise.all([
          fetch("/api/portfolio/summary", { cache: "no-store" }),
          fetch("/api/tax-status", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (s1.ok) setSummary(await s1.json());
        if (s2.ok) setTaxStatus(await s2.json());
      } catch {
        // Silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const harvestable = useMemo(() => {
    if (!summary) return { total: 0, count: 0 };
    let total = 0;
    let count = 0;
    for (const p of summary.broker.positions) {
      if (p.unrealizedPnl < 0) {
        total += p.unrealizedPnl;
        count += 1;
      }
    }
    return { total: Math.abs(total), count };
  }, [summary]);

  if (loading) return null;
  if (!summary || summary.broker.positions.length === 0) return null;

  const hasMtm = !!taxStatus && taxStatus.mtmElectionYear !== null;
  const hasNotableLosses = harvestable.total >= 100;

  // Don't render if there's nothing actionable
  if (!hasNotableLosses && !hasMtm) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Leaf className="h-4 w-4 text-bullish" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">
          Tax-Aware Trading
        </span>
        {hasMtm && (
          <span className="inline-flex items-center gap-1 rounded-full border border-bullish/30 bg-bullish/10 px-2 py-0.5 text-[11px] font-medium text-bullish">
            <Scale className="h-3 w-3" />
            §475(f) MTM • {taxStatus!.mtmElectionYear}
          </span>
        )}
      </div>

      {hasNotableLosses && (
        <div
          className={`rounded-lg border p-3 ${
            hasMtm
              ? "border-bullish/20 bg-bullish/5"
              : "border-warning/20 bg-warning/5"
          }`}
        >
          <p className="text-sm text-text-primary">
            <span className="font-mono font-semibold">
              {fmt(harvestable.total)}
            </span>{" "}
            in unrealized losses across {harvestable.count} position
            {harvestable.count === 1 ? "" : "s"}.
          </p>
          {hasMtm ? (
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">
              Under §475(f) MTM, every loss is recognized as ordinary income
              regardless of when you close. No wash-sale concern — close
              positions for tax efficiency without 30-day waiting games.
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-1 leading-relaxed flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <span>
                Closing for the loss triggers wash-sale rules: don&apos;t buy back
                the same (or substantially identical) security for 30 days. IRA
                replacements PERMANENTLY kill the loss.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/dashboard/education/guides/wash-sale-rules-deep-dive"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
        >
          <BookOpen className="h-3 w-3" />
          Wash sale guide
        </Link>
        <Link
          href="/dashboard/education#calculators"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
        >
          <BookOpen className="h-3 w-3" />
          TLH calculator
        </Link>
        {!hasMtm && (
          <Link
            href="/dashboard/education/guides/trader-tax-status-and-mtm-election"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
          >
            <Scale className="h-3 w-3" />
            Should I elect MTM?
          </Link>
        )}
        <Link
          href="/dashboard/tax-center"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
        >
          Tax Center →
        </Link>
      </div>
    </Card>
  );
}
