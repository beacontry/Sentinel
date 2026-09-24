"use client";

import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedPercent } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWidgetJson } from "@/lib/widget-load";
import { formatUsd } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetFacts, WidgetFigure } from "./widget-body";

interface PortfolioEntry {
  id: string;
  name: string;
  initialBalance: number;
  currentValue: number;
  totalReturn: number;
}

/** The combined value of the paper portfolios, their return, and the first three by name. */
export function PortfolioWidget() {
  const load = useWidgetLoad<PortfolioEntry[]>(async (signal) => {
    const data = await fetchWidgetJson<{ portfolios?: PortfolioEntry[] }>("/api/portfolio", signal);
    return data.portfolios ?? [];
  });

  return (
    <WidgetBody
      load={load}
      label="your portfolios"
      skeleton={
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1.5 h-8 w-40" />
          <Skeleton className="mt-3 h-5 w-full" />
        </div>
      }
      isEmpty={(d) => d.length === 0}
      empty={
        <EmptyState
          compact
          icon={<Wallet />}
          title="No paper portfolios yet"
          description="Practise with a paper portfolio before trading real money."
          action={{ label: "Create a portfolio", href: "/dashboard/portfolio" }}
        />
      }
    >
      {(portfolios) => {
        const totalValue = portfolios.reduce((sum, p) => sum + p.currentValue, 0);
        const totalInitial = portfolios.reduce((sum, p) => sum + p.initialBalance, 0);
        // A return needs a starting balance; without one it is unknown, not 0%.
        const totalReturn = totalInitial > 0 ? ((totalValue - totalInitial) / totalInitial) * 100 : null;
        return (
          <div>
            <WidgetFigure label={`${portfolios.length} portfolio${portfolios.length === 1 ? "" : "s"}`}>
              <span className="font-mono text-text-primary">{formatUsd(totalValue)}</span>
            </WidgetFigure>
            <p className="mt-1 text-sm">
              <SignedPercent value={totalReturn} /> <span className="text-text-muted">since start</span>
            </p>
            {portfolios.length > 1 && (
              <WidgetFacts
                items={portfolios.slice(0, 3).map((p) => ({ label: p.name, value: <SignedPercent value={p.totalReturn} /> }))}
              />
            )}
          </div>
        );
      }}
    </WidgetBody>
  );
}
