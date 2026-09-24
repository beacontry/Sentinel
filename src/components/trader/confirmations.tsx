import type { ConfirmActionSpec } from "@/components/ui/confirm-action-modal";
import { SignedValue } from "@/components/ui/signed-value";
import type { TraderPosition } from "./types";
import { usd } from "./types";

/**
 * What each irreversible desk action asks before it runs: the words, the
 * figures and the confirm label. Pure builders; the page passes the work
 * to run on confirm, so every request and refresh stays in the page.
 */

type Work = () => Promise<void>;

const bookValue = (positions: TraderPosition[]) => positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
const bookUnrealized = (positions: TraderPosition[]) => positions.reduce((s, p) => s + p.unrealizedPnl, 0);

/** Close one position from its row: its numbers, then a market sell. */
export function closePositionConfirm(p: TraderPosition, onConfirm: Work): ConfirmActionSpec {
  return {
    title: `Close ${p.symbol}`,
    description: <>Market-sells the full position. Its broker stop is cancelled as the sell fills.</>,
    summary: [
      { label: "Shares", value: String(p.quantity ?? 0) },
      { label: "Current price", value: `$${(p.currentPrice ?? 0).toFixed(2)}` },
      { label: "Est. proceeds", value: usd((p.currentPrice ?? 0) * (p.quantity ?? 0)) },
      { label: "Unrealized P&L", value: <SignedValue value={p.unrealizedPnl} /> },
    ],
    confirmLabel: `Sell ${p.quantity} ${p.symbol}`,
    onConfirm,
  };
}

/** Close from the detail sheet, which may name a symbol no longer in the book. */
export function closeFromSheetConfirm(symbol: string, pos: TraderPosition | undefined, onConfirm: Work): ConfirmActionSpec {
  return {
    title: `Close ${symbol}`,
    description: <>Market-sells the full position. Its broker stop is cancelled as the sell fills.</>,
    summary: pos
      ? [
          { label: "Shares", value: String(pos.quantity ?? 0) },
          { label: "Current price", value: `$${(pos.currentPrice ?? 0).toFixed(2)}` },
          { label: "Unrealized P&L", value: <SignedValue value={pos.unrealizedPnl} /> },
        ]
      : undefined,
    confirmLabel: `Sell all ${symbol}`,
    onConfirm,
  };
}

/**
 * The emergency halt. No typed keyword on purpose: Halt is THE emergency
 * button, and friction defeats it. The modal still shows exactly what is
 * about to be liquidated.
 *
 * Outside regular hours the halt deliberately sells nothing and leaves
 * every broker stop in place (MARKET_CLOSED), so it does not promise a
 * liquidation then. The server's clock still decides.
 */
export function haltConfirm(positions: TraderPosition[], marketOpen: boolean, onConfirm: Work): ConfirmActionSpec {
  const posCount = positions.length;
  const willLiquidate = posCount > 0 && marketOpen;
  return {
    title: "Emergency halt",
    description: willLiquidate ? (
      <>
        Stops the engine, cancels pending orders, and{" "}
        <strong className="text-text-primary">liquidates ALL open positions at market</strong>.
        The engine stays down until you explicitly press Start. This cannot be undone.
      </>
    ) : posCount > 0 ? (
      <>
        Stops the engine and cancels pending buy orders.{" "}
        <strong className="text-text-primary">The market is closed, so no position will be sold</strong>{" "}
        and your existing broker stops stay in place. The engine stays down until you explicitly press Start.
      </>
    ) : (
      <>Stops the engine and cancels pending orders. The engine stays down until you explicitly press Start.</>
    ),
    summary:
      posCount > 0
        ? [
            { label: "Open positions", value: String(posCount) },
            { label: "Est. market value", value: usd(bookValue(positions)) },
            { label: "Unrealized P&L", value: <SignedValue value={bookUnrealized(positions)} /> },
          ]
        : [{ label: "Open positions", value: "0" }],
    confirmLabel: willLiquidate ? `Halt & liquidate ${posCount}` : "Halt engine",
    onConfirm,
  };
}

/**
 * Flatten the whole book after a halt. The one action that liquidates
 * everything gets the typed-keyword gate: unlike Halt, it is reached from
 * a reflective state (reviewing the bleed list), not a panic.
 */
export function flattenAllConfirm(positions: TraderPosition[], onConfirm: Work): ConfirmActionSpec {
  const count = positions.length;
  return {
    title: "Flatten all positions",
    description: (
      <>
        Market-sells <strong className="text-text-primary">every open position</strong> right now, at whatever the
        market pays. Broker stops on these symbols are cancelled as the sells fill. This cannot be undone.
      </>
    ),
    summary: [
      { label: "Positions to sell", value: String(count) },
      { label: "Est. market value", value: usd(bookValue(positions)) },
      { label: "Unrealized P&L", value: <SignedValue value={bookUnrealized(positions)} /> },
    ],
    typedKeyword: "FLATTEN",
    confirmLabel: `Flatten ${count} position${count === 1 ? "" : "s"}`,
    onConfirm,
  };
}
