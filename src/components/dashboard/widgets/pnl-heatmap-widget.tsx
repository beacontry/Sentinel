"use client";

// Per-symbol realized P&L: which symbols add to or take from the bottom
// line. Source: /api/performance/attribution (SELL and manual_close fills
// from trader_trades). The Performance page's AttributionCard shows the
// top 10 with win rates; this shows the top five.

import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedValue } from "@/components/ui/signed-value";
import { SymbolLink } from "@/components/ui/symbol-link";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { fetchWidgetJson } from "@/lib/widget-load";
import { pnlDirection } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetFacts, WidgetRowsSkeleton } from "./widget-body";

interface AttributionRow {
  symbol: string;
  pnl: number;
  tradeCount: number;
  winCount: number;
  pctOfTotal: number;
}

interface AttributionData {
  totalPnl: number;
  rows: AttributionRow[];
}

export function PnlHeatmapWidget() {
  const { pnlFormat } = useDisplayPrefs();
  // A failed read used to be swallowed and shown as "No closed trades yet".
  const load = useWidgetLoad<AttributionData>((signal) =>
    fetchWidgetJson<AttributionData>("/api/performance/attribution", signal),
  );

  return (
    <WidgetBody
      load={load}
      label="P&L by symbol"
      skeleton={<WidgetRowsSkeleton rows={5} />}
      isEmpty={(d) => !d.rows || d.rows.length === 0}
      empty={
        <EmptyState
          compact
          icon={<TrendingUp />}
          title="No closed trades yet"
          description="Each symbol's realized P&L appears once a position has been closed."
        />
      }
    >
      {(data) => {
        const top = data.rows.slice(0, 5);
        const maxAbs = top.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0);
        return (
          <div>
            <ul className="divide-y divide-[var(--color-hairline-inner)]">
              {top.map((r) => {
                const width = maxAbs === 0 ? 0 : (Math.abs(r.pnl) / maxAbs) * 100;
                const dir = pnlDirection(r.pnl);
                return (
                  <li
                    key={r.symbol}
                    className="relative grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5"
                  >
                    <SymbolLink symbol={r.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
                    {/* The bar shows size only; the figure beside it carries the sign. */}
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-bg-surface">
                      <span
                        className={`block h-full rounded-full ${dir === "loss" ? "bg-bearish-line" : "bg-bullish-line"}`}
                        style={{ width: `${width}%` }}
                      />
                    </span>
                    <SignedValue value={r.pnl} format={pnlFormat} className="text-sm" />
                  </li>
                );
              })}
            </ul>
            <WidgetFacts items={[{ label: "Lifetime realized", value: <SignedValue value={data.totalPnl} format={pnlFormat} /> }]} />
          </div>
        );
      }}
    </WidgetBody>
  );
}
