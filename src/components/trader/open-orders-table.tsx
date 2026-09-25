import { SymbolLink } from "@/components/ui/symbol-link";
import { OrderStatusChip, StatusChip } from "@/components/ui/status-chip";
import { CircleDashed } from "lucide-react";
import type { TraderOpenOrder } from "./types";
import { timeAgo } from "./types";

/**
 * Resting orders at the broker. Table from md up, a card list below.
 * Side prints its word and a glyph; status goes through the one status
 * map (OrderStatusChip), with a partial fill spelled out as filled/total.
 */

const price = (v: string | null) => `$${Number(v).toFixed(2)}`;

function typeLabel(o: TraderOpenOrder): string {
  if (o.type === "stop") return `Stop @ ${price(o.stopPrice)}`;
  if (o.type === "limit") return `Limit @ ${price(o.limitPrice)}`;
  if (o.type === "stop_limit") return `Stop-Limit ${price(o.stopPrice)}`;
  return o.type;
}

function Side({ side }: { side: string }) {
  const buy = side === "buy";
  return (
    <span className={buy ? "text-bullish" : "text-bearish"}>
      <span aria-hidden="true">{buy ? "▲ " : "▼ "}</span>
      {side.toUpperCase()}
    </span>
  );
}

function Status({ o }: { o: TraderOpenOrder }) {
  if (o.filledQty > 0) {
    return (
      <StatusChip tone="warning" icon={<CircleDashed className="h-3 w-3" />}>
        Partial {o.filledQty}/{o.qty}
      </StatusChip>
    );
  }
  return <OrderStatusChip status={o.status} />;
}

export function OpenOrdersTable({ orders }: { orders: TraderOpenOrder[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-secondary">
            <tr className="border-b border-border text-left text-text-muted">
              <th scope="col" className="pb-2 pr-4 font-medium">Symbol</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Side</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Type</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Qty</th>
              <th scope="col" className="pb-2 pr-4 text-right font-medium">Price</th>
              <th scope="col" className="pb-2 pr-4 font-medium">TIF</th>
              <th scope="col" className="pb-2 pr-4 font-medium">Status</th>
              <th scope="col" className="pb-2 font-medium">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-hairline-inner)] font-mono tabular-nums">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="py-2.5 pr-4 font-medium text-text-primary">
                  <SymbolLink symbol={o.symbol} className="font-medium" />
                </td>
                <td className="py-2.5 pr-4"><Side side={o.side} /></td>
                <td className="py-2.5 pr-4 text-text-secondary">{typeLabel(o)}</td>
                <td className="py-2.5 pr-4 text-right">{o.qty}</td>
                <td className="py-2.5 pr-4 text-right text-text-secondary">
                  {o.stopPrice ? price(o.stopPrice) : o.limitPrice ? price(o.limitPrice) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-xs uppercase text-text-muted">{o.timeInForce}</td>
                <td className="py-2.5 pr-4 font-sans"><Status o={o} /></td>
                <td className="whitespace-nowrap py-2.5 text-xs text-text-muted" title={o.submittedAt}>
                  {timeAgo(o.submittedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[var(--color-hairline-inner)] md:hidden">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-sm">
                <SymbolLink symbol={o.symbol} className="font-semibold" />
                <Side side={o.side} />
              </div>
              <p className="font-mono text-xs text-text-muted tabular-nums">
                {o.qty} · {typeLabel(o)} · {o.timeInForce.toUpperCase()}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Status o={o} />
              <span className="text-xs text-text-muted" title={o.submittedAt}>
                {timeAgo(o.submittedAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
