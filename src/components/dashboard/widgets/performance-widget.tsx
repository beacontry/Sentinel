"use client";

import { Target } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedPercent } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetFacts, WidgetFigure } from "./widget-body";

interface PerformanceData {
  totalSignals: number;
  correctSignals: number;
  accuracy: number;
  /** Already a percent: /api/performance computes pnl * 100 / cost basis. */
  avgReturn: number;
}

/**
 * Win rate on closed trades as the headline, with the counts behind it
 * and the average return. The win rate is a proportion, not a gain or a
 * loss, so it prints in the text colour; it was green above 50% and
 * amber below, a judgement carried by colour alone.
 */
export function PerformanceWidget() {
  const load = useWidgetLoad<PerformanceData | null>(async (signal) => {
    const data = await fetchWidgetJson<{ overall?: PerformanceData }>("/api/performance", signal);
    return data.overall ?? null;
  });

  return (
    <WidgetBody
      load={load}
      label="performance"
      skeleton={
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1.5 h-8 w-24" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        </div>
      }
      isEmpty={(d) => d === null || d.totalSignals === 0}
      empty={
        <EmptyState
          compact
          icon={<Target />}
          title="No closed trades yet"
          description="Win rate and returns appear once a position has been closed."
        />
      }
    >
      {(stats) =>
        stats && (
          <div>
            <WidgetFigure label="Win rate">
              <span className="font-mono text-text-primary">{(stats.accuracy * 100).toFixed(1)}%</span>
            </WidgetFigure>
            <WidgetFacts
              items={[
                { label: "Closed trades", value: stats.totalSignals },
                { label: "Winners", value: stats.correctSignals },
                { label: "Average return", value: <SignedPercent value={stats.avgReturn} /> },
              ]}
            />
          </div>
        )
      }
    </WidgetBody>
  );
}
