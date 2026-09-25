"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SymbolLink } from "@/components/ui/symbol-link";
import { SignedPercent } from "@/components/ui/signed-value";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWidgetJson } from "@/lib/widget-load";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetList, WidgetRow, WidgetRowsSkeleton } from "./widget-body";

interface MarketMover {
  symbol: string;
  change: number;
}

interface Movers {
  gainers: MarketMover[];
  losers: MarketMover[];
}

// /api/breadth computes change% from the last two closes; the screener
// cache carries no change, which is why this widget once read 0.0%
// everywhere. The server sends changePct; older shapes sent change.
function normalize(rows: { symbol: string; changePct?: number; change?: number }[] | undefined): MarketMover[] {
  return (rows ?? []).map((r) => ({ symbol: r.symbol, change: r.changePct ?? r.change ?? 0 }));
}

/**
 * Gainers and losers side by side, a phone included (stacked, ten rows
 * pushed everything else a screen down). Each
 * column is headed in words with an icon, and every change prints its
 * glyph and sign, so neither column rests on its colour.
 */
export function MarketOverviewWidget() {
  const load = useWidgetLoad<Movers>(async (signal) => {
    const data = await fetchWidgetJson<{ topGainers?: MarketMover[]; topLosers?: MarketMover[] }>("/api/breadth", signal);
    return { gainers: normalize(data.topGainers), losers: normalize(data.topLosers) };
  });

  return (
    <WidgetBody
      load={load}
      label="market movers"
      skeleton={
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="mb-1 h-4 w-20" />
              <WidgetRowsSkeleton rows={5} />
            </div>
          ))}
        </div>
      }
      isEmpty={(d) => d.gainers.length === 0 && d.losers.length === 0}
      empty={
        <EmptyState
          compact
          icon={<TrendingUp />}
          title="No market data yet"
          description="Movers appear once the screener has scanned today's closes."
          action={{ label: "Open the screener", href: "/dashboard/screener" }}
        />
      }
    >
      {({ gainers, losers }) => (
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6">
          <MoverColumn title="Gainers" icon={<TrendingUp className="h-3.5 w-3.5" />} rows={gainers} />
          <MoverColumn title="Losers" icon={<TrendingDown className="h-3.5 w-3.5" />} rows={losers} />
        </div>
      )}
    </WidgetBody>
  );
}

function MoverColumn({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: MarketMover[] }) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <span aria-hidden="true">{icon}</span>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-text-muted">None today</p>
      ) : (
        <WidgetList>
          {rows.map((m) => (
            <WidgetRow key={m.symbol}>
              <SymbolLink symbol={m.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
              <SignedPercent value={m.change} className="text-sm" />
            </WidgetRow>
          ))}
        </WidgetList>
      )}
    </div>
  );
}
