"use client";

import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SignedValue } from "@/components/ui/signed-value";
import { SymbolLink } from "@/components/ui/symbol-link";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { fetchWidgetJson } from "@/lib/widget-load";
import { formatUsd } from "@/lib/format-pnl";
import { useWidgetLoad } from "./use-widget-load";
import { WidgetBody, WidgetList, WidgetRow, WidgetRowsSkeleton } from "./widget-body";

/**
 * Position shape from /api/trader/dashboard. `qty` is canonical and
 * `quantity` an alias; numeric fields are optional because the live and
 * cached paths have returned slightly different shapes. A missing price
 * or P&L is unknown and prints "n/a", never $0.00.
 */
interface Position {
  symbol: string;
  qty?: number;
  quantity?: number;
  entryPrice?: number;
  currentPrice?: number;
  unrealizedPnl?: number;
}

interface PositionsData {
  positions: Position[];
  connected: boolean;
}

const SHOWN = 6;

export function PositionsWidget() {
  const { pnlFormat } = useDisplayPrefs();
  const load = useWidgetLoad<PositionsData>(async (signal) => {
    const data = await fetchWidgetJson<{ positions?: Position[]; status?: { connected?: boolean } }>("/api/trader/dashboard", signal);
    return { positions: data.positions ?? [], connected: data.status?.connected !== false };
  });

  return (
    <WidgetBody
      load={load}
      label="open positions"
      skeleton={<WidgetRowsSkeleton rows={4} />}
      isEmpty={(d) => d.positions.length === 0}
      empty={
        load.data?.connected === false ? (
          <EmptyState compact kind="not-connected" icon={<Briefcase />} title="No broker connected" description="Connect a broker to see its positions here." />
        ) : (
          <EmptyState compact icon={<Briefcase />} title="No open positions" description="Positions the broker holds for you appear here." />
        )
      }
    >
      {({ positions }) => (
        <>
          <WidgetList>
            {positions.slice(0, SHOWN).map((pos) => {
              const qty = pos.qty ?? pos.quantity;
              const basis = pos.entryPrice !== undefined && qty !== undefined ? pos.entryPrice * qty : undefined;
              return (
                <WidgetRow key={pos.symbol}>
                  <span className="min-w-0">
                    <SymbolLink symbol={pos.symbol} className="text-sm font-semibold after:absolute after:inset-0" />
                    <span className="block text-xs text-text-muted tabular-nums">
                      {qty ?? "n/a"} sh
                      {pos.currentPrice !== undefined && <> · {formatUsd(pos.currentPrice)}</>}
                    </span>
                  </span>
                  <SignedValue value={pos.unrealizedPnl} basis={basis} format={pnlFormat} className="text-sm" />
                </WidgetRow>
              );
            })}
          </WidgetList>
          {positions.length > SHOWN && (
            <p className="mt-2 text-xs text-text-muted">{positions.length - SHOWN} more on the Trader page</p>
          )}
        </>
      )}
    </WidgetBody>
  );
}
