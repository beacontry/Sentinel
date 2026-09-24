"use client";

import { Button } from "@/components/ui/button";
import { SignedValue } from "@/components/ui/signed-value";
import type { PnlFormat } from "@/lib/format-pnl";
import type { TraderPosition } from "./types";

/**
 * Open positions: a table from md up, a card list below it (a 7-column
 * table at 390px scrolls sideways and hides the P&L). Rendering only; the
 * page owns the detail sheet and the close confirmation.
 *
 * The symbol is a real button that opens the detail sheet, so the row's
 * click target is also reachable by keyboard. P&L goes through
 * SignedValue: glyph, sign and a hidden gain/loss, not colour alone.
 */

interface PositionsTableProps {
  positions: TraderPosition[];
  pnlFormat: PnlFormat;
  /** Commands are in flight: Close is disabled. */
  busy: boolean;
  onOpen: (symbol: string) => void;
  onClose: (position: TraderPosition) => void;
}

const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;

export function PositionsTable({ positions, pnlFormat, busy, onOpen, onClose }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p className="py-4 text-center text-sm text-text-muted">No open positions</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-secondary">
            <tr className="border-b border-border text-left text-text-muted">
              <th scope="col" className="pb-2 pr-4 font-medium">Symbol</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Qty</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Entry</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Current</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Stop</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">P&L</th>
              <th scope="col" className="pb-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-hairline-inner)] font-mono tabular-nums">
            {positions.map((p) => (
              <tr
                key={p.symbol}
                className="cursor-pointer transition-colors hover:bg-bg-hover"
                onClick={() => onOpen(p.symbol)}
              >
                <td className="py-1 pr-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p.symbol);
                    }}
                    className="-ml-3 font-mono"
                    aria-label={`${p.symbol} details`}
                  >
                    {p.symbol}
                  </Button>
                </td>
                <td className="py-1 pr-4 text-right">{p.quantity ?? 0}</td>
                <td className="py-1 pr-4 text-right">{money(p.entryPrice)}</td>
                <td className="py-1 pr-4 text-right">{money(p.currentPrice)}</td>
                <td className="py-1 pr-4 text-right text-text-muted">{p.stopPrice ? money(p.stopPrice) : "—"}</td>
                <td className="py-1 pr-4 text-right">
                  <SignedValue
                    value={p.unrealizedPnl ?? 0}
                    basis={(p.entryPrice ?? 0) * (p.quantity ?? 0)}
                    format={pnlFormat}
                  />
                </td>
                <td className="py-1 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(p);
                    }}
                    disabled={busy}
                    aria-label={`Close ${p.symbol}`}
                  >
                    Close
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[var(--color-hairline-inner)] md:hidden">
        {positions.map((p) => (
          <li key={p.symbol} className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => onOpen(p.symbol)}
              className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left"
              aria-label={`${p.symbol} details`}
            >
              <span className="font-mono font-semibold text-text-primary">{p.symbol}</span>
              <span className="font-mono text-xs text-text-muted tabular-nums">
                {p.quantity ?? 0} sh · avg {money(p.entryPrice)}
                {p.stopPrice ? ` · stop ${money(p.stopPrice)}` : ""}
              </span>
            </button>
            <SignedValue
              value={p.unrealizedPnl ?? 0}
              basis={(p.entryPrice ?? 0) * (p.quantity ?? 0)}
              format={pnlFormat}
              className="shrink-0 text-sm"
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onClose(p)}
              disabled={busy}
              aria-label={`Close ${p.symbol}`}
              className="shrink-0"
            >
              Close
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
