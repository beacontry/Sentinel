import type { CSSProperties, ReactNode } from "react";
import { Inset } from "@/components/ui/card";
import { SignedValue, signedValueCh } from "@/components/ui/signed-value";
import { tileRowVars } from "@/lib/figure-fit";
import type { PnlFormat } from "@/lib/format-pnl";
import { DeskPanel } from "./desk-panel";
import type { TraderAnalytics, TraderData } from "./types";
import { usd } from "./types";

/**
 * The desk's figures as one readout with a hierarchy, instead of two
 * strips of eight equal tiles:
 *
 * - Lead: total equity, and today's P&L under it. The two numbers a
 *   returning trader looks for first, at display size.
 * - Balances beside it: buying power, cash and long market value as a
 *   short list.
 * - A row of P&L tiles under both: total, realized, unrealized and
 *   trades today.
 *
 * Every gain or loss goes through SignedValue, so direction is printed,
 * not only coloured. A figure is never split mid-number: the "both" P&L
 * format breaks only between "+$1,234.57" and "(+10.00%)", and the tiles
 * fit the widest whole token instead (tile-grid and figure-fit in
 * globals.css). Each tile row steps its figures down from the container
 * ladder towards the 12px floor to fit, and a figure too wide even at the
 * floor drops the grid a column. A tile that ran past the page edge would
 * cut the figure off and scroll the whole desk sideways.
 */

type Account = NonNullable<TraderData["brokerAccount"]>;

/** A tile inside a readout: a label and one figure. */
function Tile({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <Inset className="@container min-w-0">
      <dt className="eyebrow text-text-muted">{label}</dt>
      <dd className="mt-1 figure-fit font-mono font-semibold text-text-primary tabular-nums [--figure-max:var(--text-base)] @min-[9.5rem]:[--figure-max:var(--text-lg)] @min-[11.5rem]:[--figure-max:var(--text-xl)]">
        {children}
      </dd>
      {sub && <dd className="mt-0.5 font-mono text-xs text-text-muted tabular-nums">{sub}</dd>}
    </Inset>
  );
}

function Balance({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-mono text-text-primary tabular-nums">{children}</dd>
    </div>
  );
}

interface DeskReadoutProps {
  /** Null when the broker did not return balances on the last read. */
  account: Account | null | undefined;
  todayPnl: TraderData["todayPnl"];
  lifetimePnl: TraderData["lifetimePnl"];
  pnlFormat: PnlFormat;
}

export function DeskReadout({ account, todayPnl, lifetimePnl, pnlFormat }: DeskReadoutProps) {
  // Account equity is the basis for a percent ("X% of account"); without
  // it, dollars only.
  const basis = account && account.equity > 0 ? account.equity : undefined;
  const total = lifetimePnl?.totalPnl ?? todayPnl?.totalPnl ?? 0;
  const realized = lifetimePnl?.realizedPnl ?? todayPnl?.realizedPnl ?? 0;
  const unrealized = lifetimePnl?.unrealizedPnl ?? todayPnl?.unrealizedPnl ?? 0;
  const hasPnl = Boolean(lifetimePnl || todayPnl);
  // An eight-figure equity is wider than a phone at display size: it steps
  // down to fit rather than running past the card.
  const equity = account ? usd(account.equity) : "—";

  return (
    <section
      aria-labelledby="desk-readout-heading"
      className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4 shadow-card lg:p-5"
    >
      <h2 id="desk-readout-heading" className="sr-only">
        Account and profit and loss
      </h2>

      <div className="grid gap-3 md:grid-cols-2 md:gap-6">
        <dl className="@container min-w-0" style={{ "--figure-ch": equity.length } as CSSProperties}>
          <dt className="eyebrow text-text-muted">Total equity</dt>
          <dd className="mt-1 figure-fit font-mono font-semibold text-text-primary tabular-nums [--figure-max:var(--text-2xl)]">
            {equity}
          </dd>
          {todayPnl && (
            <>
              <dt className="sr-only">Today</dt>
              <dd className="mt-1 flex items-baseline gap-2 text-sm">
                <SignedValue value={todayPnl.totalPnl ?? 0} basis={basis} format={pnlFormat} className="text-base font-semibold" />
                <span aria-hidden="true" className="text-text-muted">
                  today
                </span>
              </dd>
            </>
          )}
        </dl>
        {account ? (
          <dl className="min-w-0 divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)] text-sm md:border-t-0">
            <Balance label="Buying power">{usd(account.buyingPower)}</Balance>
            <Balance label="Cash">
              {usd(account.cash)}
              {/* Negative cash is a margin loan: LMV minus equity. */}
              {account.cash < 0 && (
                <span className="block text-xs text-warning">{usd(Math.abs(account.cash))} on margin</span>
              )}
            </Balance>
            <Balance label="Long market value">{usd(account.longMarketValue)}</Balance>
          </dl>
        ) : (
          <p className="border-t border-[var(--color-hairline-inner)] pt-3 text-sm text-text-secondary md:border-t-0 md:pt-0">
            Balances unavailable: the broker did not return them on the last read.
          </p>
        )}
      </div>

      {hasPnl && (
        <dl
          className="tile-grid [--tile-cols:2] md:[--tile-cols:4]"
          style={tileRowVars(
            Math.max(
              signedValueCh(total, basis, pnlFormat),
              signedValueCh(realized, basis, pnlFormat),
              signedValueCh(unrealized, basis, pnlFormat),
              String(todayPnl?.tradesCount ?? 0).length,
            ),
            lifetimePnl ? signedValueCh(lifetimePnl.realizedPnlToday, basis, pnlFormat, false) : 0,
          )}
        >
          <Tile label="Total P&L">
            <SignedValue value={total} basis={basis} format={pnlFormat} />
          </Tile>
          <Tile
            label="Realized"
            sub={
              lifetimePnl ? (
                <>
                  Today <SignedValue value={lifetimePnl.realizedPnlToday} basis={basis} format={pnlFormat} glyph={false} />
                </>
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
      )}
    </section>
  );
}

export function PerformanceAnalytics({ analytics }: { analytics: TraderAnalytics }) {
  // Profit factor with no losing trade is undefined, sent as 999: shown as ∞.
  const pf = analytics.profitFactor === 999 ? "∞" : (analytics.profitFactor ?? 0).toFixed(2);
  const winRate = `${(analytics.winRate ?? 0).toFixed(1)}%`;
  const avgWin = usd(analytics.avgWin ?? 0);
  const avgLoss = usd(analytics.avgLoss ?? 0);
  const maxDrawdown = usd(analytics.maxDrawdown ?? 0);
  const figureCh = Math.max(
    signedValueCh(analytics.netPnl ?? 0),
    winRate.length,
    pf.length,
    avgWin.length,
    avgLoss.length,
    maxDrawdown.length,
  );
  return (
    <DeskPanel id="trader-analytics" title="Performance" description="Closed trades, all time." container>
      <dl className="tile-grid [--tile-cols:2] @xl:[--tile-cols:3] @4xl:[--tile-cols:6]" style={tileRowVars(figureCh)}>
        <Tile label="Net P&L">
          <SignedValue value={analytics.netPnl ?? 0} />
        </Tile>
        <Tile label="Win rate" sub={`${analytics.winningTrades}W / ${analytics.losingTrades}L`}>
          {winRate}
        </Tile>
        <Tile label="Profit factor">{pf}</Tile>
        <Tile label="Avg win">
          <span className="text-bullish">{avgWin}</span>
        </Tile>
        <Tile label="Avg loss">
          <span className="text-bearish">{avgLoss}</span>
        </Tile>
        <Tile label="Max drawdown">
          <span className="text-bearish">{maxDrawdown}</span>
        </Tile>
      </dl>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-hairline-inner)] pt-3 text-xs">
        <div className="flex gap-1">
          <dt className="text-text-muted">Sharpe</dt>
          <dd className="font-mono font-medium text-text-primary">{(analytics.sharpeRatio ?? 0).toFixed(2)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-text-muted">Trades</dt>
          <dd className="font-mono text-text-primary">{analytics.totalTrades}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-text-muted">Gross profit</dt>
          <dd className="font-mono text-bullish">{usd(analytics.grossProfit ?? 0)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-text-muted">Gross loss</dt>
          <dd className="font-mono text-bearish">{usd(analytics.grossLoss ?? 0)}</dd>
        </div>
      </dl>
    </DeskPanel>
  );
}
