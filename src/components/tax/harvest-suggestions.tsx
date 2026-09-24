import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { SignedValue } from "@/components/ui/signed-value";
import { formatCurrency, formatDate } from "./tax-format";

/**
 * Tax-loss harvesting candidates: open positions at a loss, what selling
 * each might save, and the earliest date it could be bought back without
 * a wash sale. A table from md up and a card list below it, so the loss
 * column is never the one scrolled out of view. Rendering only; the page
 * owns the fetch.
 */

export interface HarvestingSuggestion {
  symbol: string;
  currentLoss: number;
  potentialSavings: number;
  washSaleDate: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  isLongTerm: boolean;
  holdingPeriodKnown: boolean;
}

export type HarvestState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; suggestions: HarvestingSuggestion[]; unpricedSymbols: string[] };

const WASH_SALE_GUIDE = "/dashboard/education/guides/wash-sale-rules-deep-dive";

/** The rate the saving was valued at, in words rather than an LT/ST code. */
function rateBasis(s: HarvestingSuggestion): string {
  if (!s.holdingPeriodKnown) return "holding period unknown, short-term rate assumed";
  return s.isLongTerm ? "at the long-term rate" : "at the short-term rate";
}

function rebuyDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso) : iso;
}

export function HarvestSuggestions({ state }: { state: HarvestState }) {
  const count = state.status === "ready" ? state.suggestions.length : null;

  return (
    <Card>
      <section aria-labelledby="tax-harvesting">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="tax-harvesting" className="text-base font-semibold text-text-primary">
              Tax-loss harvesting
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {count === null || count === 0
                ? "Open positions at a loss that could offset this year’s gains."
                : `${count} open ${count === 1 ? "position is" : "positions are"} at a loss that could offset this year’s gains.`}
            </p>
          </div>
          <Link
            href={WASH_SALE_GUIDE}
            className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Wash sale rules</span>
            <span className="sm:hidden">Rules</span>
          </Link>
        </div>

        {state.status === "loading" ? (
          <div aria-busy="true" className="space-y-2">
            <span className="sr-only">Loading harvesting candidates</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" rounded="lg" />
            ))}
          </div>
        ) : state.status === "error" ? (
          <ErrorState
            compact
            headingLevel={3}
            title="Could not load harvesting candidates"
            description="This is not the same as having none."
            onRetry={state.retry}
          />
        ) : (
          <HarvestBody suggestions={state.suggestions} unpricedSymbols={state.unpricedSymbols} />
        )}
      </section>
    </Card>
  );
}

function HarvestBody({
  suggestions,
  unpricedSymbols,
}: {
  suggestions: HarvestingSuggestion[];
  unpricedSymbols: string[];
}) {
  return (
    <>
      {unpricedSymbols.length > 0 && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-fill px-3 py-2 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            No current price for {unpricedSymbols.join(", ")}. These positions
            are left out of the candidates below; reload to try again.
          </span>
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="py-6 text-sm">
          <p className="text-text-secondary">
            {unpricedSymbols.length > 0
              ? "None of the priced positions is at a loss right now."
              : "No open position is at a loss right now, so there is nothing to harvest."}
          </p>
          <p className="mt-2 text-text-muted">
            To see how harvesting works,{" "}
            <Link href="/dashboard/education#calculators" className="text-accent hover:underline">
              try the tax-loss harvesting calculator
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th scope="col" className="pb-2 pr-4 font-medium">Symbol</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Shares</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Cost / now</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Unrealized</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Est. saving</th>
                  <th scope="col" className="pb-2 text-right font-medium">Earliest rebuy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-hairline-inner)]">
                {suggestions.map((s) => (
                  <tr key={s.symbol} className="align-top">
                    <th scope="row" className="py-3 pr-4 text-left font-mono font-semibold text-text-primary">
                      {s.symbol}
                    </th>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-text-primary">{s.quantity}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      <span className="block text-text-primary">{formatCurrency(s.entryPrice)}</span>
                      <span className="block text-xs text-text-muted">{formatCurrency(s.currentPrice)}</span>
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold">
                      <SignedValue value={-Math.abs(s.currentLoss)} />
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className="block font-mono tabular-nums text-text-primary">~{formatCurrency(s.potentialSavings)}</span>
                      <span className="block text-xs text-text-muted">{rateBasis(s)}</span>
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-text-secondary">{rebuyDate(s.washSaleDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[var(--color-hairline-inner)] md:hidden">
            {suggestions.map((s) => (
              <li key={s.symbol} className="py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono font-semibold text-text-primary">{s.symbol}</span>
                  <SignedValue value={-Math.abs(s.currentLoss)} className="font-semibold" />
                </div>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-text-muted">
                  {s.quantity} sh · cost {formatCurrency(s.entryPrice)} · now {formatCurrency(s.currentPrice)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <dt className="text-xs text-text-muted">Est. saving</dt>
                    <dd className="font-mono tabular-nums text-text-primary">~{formatCurrency(s.potentialSavings)}</dd>
                    <dd className="text-xs text-text-muted">{rateBasis(s)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-text-muted">Earliest rebuy</dt>
                    <dd className="font-mono tabular-nums text-text-secondary">{rebuyDate(s.washSaleDate)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-4 max-w-prose text-xs leading-relaxed text-text-muted">
            Estimated saving is the loss times the rate for its holding period,
            and it is an upper bound: with no gains to offset, losses deducted
            against ordinary income are capped at $3,000 a year ($1,500 married
            filing separately). Buying the same security back within 30 days is
            a wash sale and defers the loss; buying it in an IRA can lose it for
            good.{" "}
            <Link href={WASH_SALE_GUIDE} className="text-accent hover:underline">
              Read the wash sale deep dive
            </Link>{" "}
            before acting.
          </p>
        </>
      )}
    </>
  );
}

