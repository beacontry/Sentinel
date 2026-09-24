import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SignedValue } from "@/components/ui/signed-value";
import type { PnlFormat } from "@/lib/format-pnl";
import type { TraderAnalytics, TraderData } from "./types";
import { usd } from "./types";

/**
 * The account and P&L figures as readouts: one card per group holding
 * borderless tiles, instead of eight separate cards. Gains and losses go
 * through SignedValue, so direction is printed, not only coloured.
 */

/** One bordered strip holding the tiles; Card is not used so the padding is not fought over. */
const STRIP = "rounded-xl border border-border bg-bg-secondary p-2 shadow-card";

function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-bg-surface p-3">
      <dt className="eyebrow text-text-muted">{label}</dt>
      <dd className="mt-1 wrap-anywhere font-mono text-xl font-semibold tabular-nums text-text-primary">{children}</dd>
      {sub && <dd className="mt-0.5 font-mono text-xs text-text-muted tabular-nums">{sub}</dd>}
    </div>
  );
}

export function AccountReadout({ account }: { account: NonNullable<TraderData["brokerAccount"]> }) {
  return (
    <section aria-labelledby="trader-account" className={STRIP}>
      <h2 id="trader-account" className="sr-only">Account</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Total equity">{usd(account.equity)}</Tile>
        <Tile
          label="Long market value"
          // Negative cash is a margin loan: LMV − equity. Shown so the loan
          // size reads at a glance.
          sub={account.cash < 0 ? `${usd(Math.abs(account.cash))} on margin` : undefined}
        >
          {usd(account.longMarketValue)}
        </Tile>
        <Tile label="Cash">{usd(account.cash)}</Tile>
        <Tile label="Buying power">{usd(account.buyingPower)}</Tile>
      </dl>
    </section>
  );
}

interface PnlReadoutProps {
  todayPnl: TraderData["todayPnl"];
  lifetimePnl: TraderData["lifetimePnl"];
  /** Account equity, the basis for a percent; undefined shows dollars only. */
  basis: number | undefined;
  pnlFormat: PnlFormat;
}

export function PnlReadout({ todayPnl, lifetimePnl, basis, pnlFormat }: PnlReadoutProps) {
  const total = lifetimePnl?.totalPnl ?? todayPnl?.totalPnl ?? 0;
  const realized = lifetimePnl?.realizedPnl ?? todayPnl?.realizedPnl ?? 0;
  const unrealized = lifetimePnl?.unrealizedPnl ?? todayPnl?.unrealizedPnl ?? 0;
  return (
    <section aria-labelledby="trader-pnl" className={STRIP}>
      <h2 id="trader-pnl" className="sr-only">Profit and loss</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label="Total P&L"
          sub={
            lifetimePnl && todayPnl ? (
              <>Today: <SignedValue value={todayPnl.totalPnl ?? 0} basis={basis} format={pnlFormat} glyph={false} /></>
            ) : undefined
          }
        >
          <SignedValue value={total} basis={basis} format={pnlFormat} />
        </Tile>
        <Tile
          label="Realized"
          sub={
            lifetimePnl ? (
              <>Today: <SignedValue value={lifetimePnl.realizedPnlToday} basis={basis} format={pnlFormat} glyph={false} /></>
            ) : undefined
          }
        >
          <SignedValue value={realized} basis={basis} format={pnlFormat} />
        </Tile>
        <Tile label="Unrealized">
          <SignedValue value={unrealized} basis={basis} format={pnlFormat} />
        </Tile>
        <Tile label="Trades today">{todayPnl?.tradesCount ?? 0}</Tile>
      </dl>
    </section>
  );
}

export function PerformanceAnalytics({ analytics }: { analytics: TraderAnalytics }) {
  // Profit factor with no losing trade is undefined, sent as 999: shown as ∞.
  const pf = analytics.profitFactor === 999 ? "∞" : (analytics.profitFactor ?? 0).toFixed(2);
  return (
    <Card>
      <CardHeader className="p-0 pb-3">
        <CardTitle as="h2">Performance analytics (all time)</CardTitle>
      </CardHeader>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Net P&L">
          <SignedValue value={analytics.netPnl ?? 0} />
        </Tile>
        <Tile label="Win rate" sub={`${analytics.winningTrades}W / ${analytics.losingTrades}L`}>
          {(analytics.winRate ?? 0).toFixed(1)}%
        </Tile>
        <Tile label="Profit factor">{pf}</Tile>
        <Tile label="Avg win">
          <span className="text-bullish">{usd(analytics.avgWin ?? 0)}</span>
        </Tile>
        <Tile label="Avg loss">
          <span className="text-bearish">{usd(analytics.avgLoss ?? 0)}</span>
        </Tile>
        <Tile label="Max drawdown">
          <span className="text-bearish">{usd(analytics.maxDrawdown ?? 0)}</span>
        </Tile>
      </dl>
      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-hairline-inner)] pt-3 text-xs text-text-muted">
        <div className="flex gap-1">
          <dt>Sharpe:</dt>
          <dd className="font-mono font-medium text-text-primary">{(analytics.sharpeRatio ?? 0).toFixed(2)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Gross profit:</dt>
          <dd className="font-mono text-bullish">{usd(analytics.grossProfit ?? 0)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Gross loss:</dt>
          <dd className="font-mono text-bearish">{usd(analytics.grossLoss ?? 0)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Total trades:</dt>
          <dd className="font-mono text-text-primary">{analytics.totalTrades}</dd>
        </div>
      </dl>
    </Card>
  );
}
