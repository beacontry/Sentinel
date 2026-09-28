import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedValue } from "@/components/ui/signed-value";
import { StatusChip } from "@/components/ui/status-chip";
import type { Form8949Line } from "@/lib/tax-engine";
import { formatCurrency, formatDate } from "./tax-format";

export { ScheduleDView } from "./schedule-d-view";

/**
 * The Tax Report's Form 8949 view: one panel per part, each a lot table
 * from lg up and a card list below it. A seven-column table at 390px
 * scrolled sideways and hid Gain/Loss, the one column that matters, so
 * below lg each lot is a card led by its gain or loss. Rendering only;
 * the page owns the report fetch, the year, the filing status and the
 * export. Every gain or loss goes through SignedValue.
 */

const PARTS = [
  {
    id: "short",
    part: "Part I",
    title: "Short-term",
    description: "Held one year or less. Taxed as ordinary income.",
    none: "No short-term lots closed in this year.",
  },
  {
    id: "long",
    part: "Part II",
    title: "Long-term",
    description: "Held more than one year. Taxed at the long-term rates.",
    none: "No long-term lots closed in this year.",
  },
] as const;

export function Form8949View({
  shortTermLines,
  longTermLines,
}: {
  shortTermLines: Form8949Line[];
  longTermLines: Form8949Line[];
}) {
  const byPart = { short: shortTermLines, long: longTermLines };
  return (
    <div className="space-y-6">
      {PARTS.map((p) => {
        const lines = byPart[p.id];
        const headingId = `form8949-${p.id}`;
        return (
          <Card key={p.id}>
            <section aria-labelledby={headingId}>
              <div className="mb-4 min-w-0">
                <h2 id={headingId} className="text-base font-semibold text-text-primary">
                  {p.part}: {p.title}
                  <span className="ml-2 font-normal text-text-muted">
                    {lines.length} {lines.length === 1 ? "lot" : "lots"}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-text-secondary">{p.description}</p>
              </div>
              {lines.length === 0 ? (
                <p className="border-t border-[var(--color-hairline-inner)] pt-4 text-sm text-text-muted">{p.none}</p>
              ) : (
                <LotTable lines={lines} />
              )}
            </section>
          </Card>
        );
      })}
    </div>
  );
}

function sourceLabel(line: Form8949Line): string {
  return line.source === "engine" ? "Engine" : "Portfolio";
}

function WashSaleChip() {
  return (
    <StatusChip tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
      Wash sale
    </StatusChip>
  );
}

function None() {
  return (
    <>
      <span aria-hidden="true" className="text-text-muted">&mdash;</span>
      <span className="sr-only">None</span>
    </>
  );
}

function LotTable({ lines }: { lines: Form8949Line[] }) {
  const sorted = [...lines].sort((a, b) => a.dateSold.localeCompare(b.dateSold));
  const totalProceeds = lines.reduce((s, l) => s + l.proceeds, 0);
  const totalBasis = lines.reduce((s, l) => s + l.costBasis, 0);
  const totalGain = lines.reduce((s, l) => s + l.gainLoss, 0);
  const anyWash = lines.some((l) => l.washSale);
  const totalDisallowed = lines.reduce((s, l) => s + l.washSaleDisallowed, 0);
  const lotWord = `${lines.length} ${lines.length === 1 ? "lot" : "lots"}`;
  const keyOf = (line: Form8949Line, i: number) => `${line.symbol}-${line.dateAcquired}-${line.dateSold}-${i}`;

  return (
    <>
      {/* lg and up: the form's columns, the header pinned while the lots scroll. */}
      <table className="hidden w-full text-sm lg:table">
        <thead className="sticky top-0 z-10 bg-bg-secondary">
          <tr className="border-b border-border text-left text-text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Description</th>
            <th scope="col" className="py-2 pr-4 font-medium">Acquired</th>
            <th scope="col" className="py-2 pr-4 font-medium">Sold</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Proceeds</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Cost basis</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Adjustment</th>
            <th scope="col" className="py-2 text-right font-medium">Gain or loss</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-hairline-inner)]">
          {sorted.map((line, i) => (
            <tr key={keyOf(line, i)}>
              <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-text-primary">
                    {line.quantity} sh <span className="font-mono">{line.symbol}</span>
                  </span>
                  <span className="text-xs text-text-muted">{sourceLabel(line)}</span>
                  {line.washSale && <WashSaleChip />}
                </span>
              </th>
              <td className="py-2.5 pr-4 font-mono tabular-nums text-text-secondary">{formatDate(line.dateAcquired)}</td>
              <td className="py-2.5 pr-4 font-mono tabular-nums text-text-secondary">{formatDate(line.dateSold)}</td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-text-primary">{formatCurrency(line.proceeds)}</td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-text-primary">{formatCurrency(line.costBasis)}</td>
              <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                {line.washSale ? (
                  <span className="text-warning-fg">{formatCurrency(line.washSaleDisallowed)}</span>
                ) : (
                  <None />
                )}
              </td>
              <td className="py-2.5 text-right font-semibold">
                <SignedValue value={line.gainLoss} glyph={false} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" colSpan={3} className="py-3 pr-4 text-left font-semibold text-text-primary">
              Total, {lotWord}
            </th>
            <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-text-primary">{formatCurrency(totalProceeds)}</td>
            <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-text-primary">{formatCurrency(totalBasis)}</td>
            <td className="py-3 pr-4 text-right font-mono tabular-nums">
              {anyWash ? <span className="text-warning-fg">{formatCurrency(totalDisallowed)}</span> : <None />}
            </td>
            <td className="py-3 text-right font-semibold">
              <SignedValue value={totalGain} />
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Below lg: a card per lot, the gain or loss on the title line. */}
      <ul className="divide-y divide-[var(--color-hairline-inner)] border-t border-[var(--color-hairline-inner)] lg:hidden">
        {sorted.map((line, i) => (
          <li key={keyOf(line, i)} className="py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-medium text-text-primary">
                {line.quantity} sh <span className="font-mono">{line.symbol}</span>
              </span>
              <SignedValue value={line.gainLoss} className="shrink-0 font-semibold" />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              <span className="font-mono tabular-nums">
                {formatDate(line.dateAcquired)} to {formatDate(line.dateSold)}
              </span>
              <span>{sourceLabel(line)}</span>
              {line.washSale && <WashSaleChip />}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
              <div className="min-w-0">
                <dt className="text-text-muted">Proceeds</dt>
                <dd className="font-mono text-sm tabular-nums text-text-primary">{formatCurrency(line.proceeds)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-text-muted">Cost basis</dt>
                <dd className="font-mono text-sm tabular-nums text-text-primary">{formatCurrency(line.costBasis)}</dd>
              </div>
              {line.washSale && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-text-muted">Wash sale adjustment</dt>
                  <dd className="font-mono text-sm tabular-nums text-warning-fg">{formatCurrency(line.washSaleDisallowed)}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
        <li className="pt-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-text-primary">Total, {lotWord}</span>
            <SignedValue value={totalGain} className="shrink-0 font-semibold" />
          </div>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-text-muted">
            Proceeds {formatCurrency(totalProceeds)} · basis {formatCurrency(totalBasis)}
            {anyWash && <> · adjusted {formatCurrency(totalDisallowed)}</>}
          </p>
        </li>
      </ul>
    </>
  );
}

/** The Form 8949 panel's shape while the report loads. */
export function LotTableSkeleton() {
  return (
    <Card aria-busy="true">
      <span className="sr-only">Loading the tax report</span>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </Card>
  );
}
