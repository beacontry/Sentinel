import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedValue } from "@/components/ui/signed-value";
import { DEFAULT_ORDINARY_INCOME } from "@/lib/tax-inputs";
import { formatCurrency, type TaxSummary } from "./tax-format";

/**
 * The Tax Center's lead panel: what the year realized and what it may
 * cost, then the one breakdown behind both. Rendering only; the page owns
 * the fetch, the year and every non-ready state.
 *
 * It replaces a readout strip, a row of four tiles and a breakdown card
 * that printed the same short-term and long-term figures three times.
 */

const QUARTERLY_GUIDE = "/dashboard/education/guides/quarterly-estimated-taxes-for-traders";

interface TermRow {
  term: string;
  held: string;
  gains: number;
  losses: number;
}

export function YearSummary({ year, summary }: { year: string; summary: TaxSummary }) {
  const rows: TermRow[] = [
    { term: "Short-term", held: "Held one year or less", gains: summary.shortTermGains, losses: summary.shortTermLosses },
    { term: "Long-term", held: "Held more than one year", gains: summary.longTermGains, losses: summary.longTermLosses },
  ];
  const totalGains = summary.shortTermGains + summary.longTermGains;
  const totalLosses = summary.shortTermLosses + summary.longTermLosses;

  return (
    <section
      aria-labelledby="tax-year-summary"
      className="rounded-xl border border-border bg-bg-secondary shadow-card"
    >
      <div className="flex flex-col gap-1 px-5 pt-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 id="tax-year-summary" className="text-base font-semibold text-text-primary">
          Realized in {year}
        </h2>
        <p className="text-sm text-text-muted">
          {summary.tradeCount} {summary.tradeCount === 1 ? "lot" : "lots"} matched, FIFO
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 pt-5 pb-6 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm text-text-secondary">Net realized gain</dt>
          <dd className="mt-1">
            <SignedValue value={summary.netGain} className="text-2xl font-semibold" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-text-secondary">Estimated federal tax</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text-primary">
            {formatCurrency(summary.estimatedTax)}
          </dd>
          <dd className="mt-1 text-xs text-text-muted">
            Assumes a single filer with ${DEFAULT_ORDINARY_INCOME.toLocaleString("en-US")} of other income.{" "}
            <Link href={`/dashboard/tax?year=${year}`} className="text-accent hover:underline">
              The Tax Report lets you try other assumptions
            </Link>
            .
          </dd>
        </div>
      </dl>

      <h3 className="sr-only">Gains and losses by holding period</h3>

      {/* sm and up: one table, terms as rows. */}
      <div className="hidden border-t border-[var(--color-hairline-inner)] px-5 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted">
              <th scope="col" className="py-3 pr-4 font-medium">Holding period</th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">Gains</th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">Losses</th>
              <th scope="col" className="py-3 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)]">
            {rows.map((r) => (
              <tr key={r.term}>
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  <span className="block font-medium text-text-primary">{r.term}</span>
                  <span className="block text-xs text-text-muted">{r.held}</span>
                </th>
                <td className="py-3 pr-4 text-right"><SignedValue value={r.gains} glyph={false} /></td>
                <td className="py-3 pr-4 text-right"><SignedValue value={-r.losses} glyph={false} /></td>
                <td className="py-3 text-right font-semibold"><SignedValue value={r.gains - r.losses} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border">
            <tr>
              <th scope="row" className="py-3 pr-4 text-left font-semibold text-text-primary">Total</th>
              <td className="py-3 pr-4 text-right font-semibold"><SignedValue value={totalGains} glyph={false} /></td>
              <td className="py-3 pr-4 text-right font-semibold"><SignedValue value={-totalLosses} glyph={false} /></td>
              <td className="py-3 text-right font-semibold"><SignedValue value={summary.netGain} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phone: the same figures, one block per holding period. */}
      <div className="divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)] px-5 sm:hidden">
        {rows.map((r) => (
          <div key={r.term} className="py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-text-primary">{r.term}</p>
              <p className="flex items-baseline gap-2">
                <span className="text-xs text-text-muted">Net</span>
                <SignedValue value={r.gains - r.losses} className="font-semibold" />
              </p>
            </div>
            <p className="text-xs text-text-muted">{r.held}</p>
            <dl className="mt-2 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-text-secondary">Gains</dt>
                <dd><SignedValue value={r.gains} glyph={false} /></dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-text-secondary">Losses</dt>
                <dd><SignedValue value={-r.losses} glyph={false} /></dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--color-hairline-inner)] px-5 py-1">
        <Link
          href={QUARTERLY_GUIDE}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Do you owe quarterly estimated tax?
        </Link>
      </div>
    </section>
  );
}

/** The panel's shape while the year loads, so nothing jumps when it lands. */
export function YearSummarySkeleton() {
  return (
    <Card aria-busy="true">
      <span className="sr-only">Loading the year summary</span>
      <Skeleton className="h-5 w-40" />
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </Card>
  );
}
