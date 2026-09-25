import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedPercent, SignedValue } from "@/components/ui/signed-value";
import type { TraderData, TraderPosition } from "./types";

/**
 * After a halt, with positions still open: what is left at risk and a
 * way out. Once the engine is halted, only the broker-side stops stand
 * between the account and further losses, so the open-position bleed is
 * listed worst first, beside Flatten all. Rendering only; the page owns
 * the flatten confirmation.
 *
 * Two different halts share this panel, and the copy never claims the
 * wrong one: a user emergency halt submitted market sells for everything
 * (rows still here are awaiting fills or were rejected); a safeguard halt
 * (daily loss, equity collapse, losing streak) blocks new BUYs and does
 * not flatten.
 */

interface HaltPanelProps {
  todayPnl: NonNullable<TraderData["todayPnl"]>;
  positions: TraderPosition[];
  flattening: boolean;
  onFlattenAll: () => void;
}

export function HaltPanel({ todayPnl, positions, flattening, onFlattenAll }: HaltPanelProps) {
  const openUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const losers = positions.filter((p) => p.unrealizedPnl < 0).sort((a, b) => a.unrealizedPnl - b.unrealizedPnl);
  const userHalt =
    todayPnl.haltReason?.includes("user_emergency_halt") || todayPnl.haltReason?.includes("flatten");
  return (
    <section
      aria-labelledby="halt-panel-heading"
      className="rounded-xl border border-bearish-line bg-bearish-fill p-4 lg:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bearish-fg" />
          <div className="min-w-0">
            <h2 id="halt-panel-heading" className="text-sm font-semibold text-bearish-fg">
              Engine halted with open positions
            </h2>
            {todayPnl.haltReason && (
              <p className="mt-0.5 font-mono text-xs text-text-secondary wrap-anywhere">{todayPnl.haltReason}</p>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              {userHalt
                ? "Your emergency halt submitted market sells for every position. Anything still listed below is awaiting fills, or its sell was rejected. Flatten again if these rows persist."
                : "This safeguard halt blocks new BUYs but does not flatten. Existing broker stops still fire, but mark-to-market keeps moving. Review or flatten below."}
            </p>
          </div>
        </div>
        <Button variant="destructive" size="sm" loading={flattening} onClick={onFlattenAll} className="shrink-0">
          Flatten all
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--color-hairline-inner)] pt-3">
        <div className="min-w-0">
          <dt className="eyebrow text-text-muted">Open</dt>
          <dd className="font-mono text-lg font-semibold text-text-primary tabular-nums">{positions.length}</dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow text-text-muted">Unrealized</dt>
          <dd className="text-base font-semibold sm:text-lg">
            <SignedValue value={openUnrealized} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow text-text-muted">Realized today</dt>
          <dd className="text-base font-semibold sm:text-lg">
            <SignedValue value={todayPnl.realizedPnl} />
          </dd>
        </div>
      </dl>

      {losers.length > 0 && (
        <div className="mt-3 border-t border-[var(--color-hairline-inner)] pt-3">
          <h3 className="eyebrow mb-2 text-text-muted">
            Worst bleeding ({Math.min(losers.length, 5)} of {losers.length})
          </h3>
          <ul className="space-y-1.5">
            {losers.slice(0, 5).map((p) => {
              const movePct = p.entryPrice > 0 ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100 : null;
              return (
                <li key={p.symbol} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-mono font-medium text-text-primary">{p.symbol}</span>
                    <span className="text-xs text-text-muted">
                      {p.quantity} sh @ ${p.entryPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3 font-mono text-xs">
                    <SignedPercent value={movePct} glyph={false} />
                    <SignedValue value={p.unrealizedPnl} glyph={false} className="min-w-20 justify-end" />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
