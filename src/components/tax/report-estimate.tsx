import Link from "next/link";
import type { ReactNode } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedValue } from "@/components/ui/signed-value";
import type { FilingStatus } from "@/lib/tax-engine";
import { filingStatusOptions, formatCurrency } from "./tax-format";

/**
 * The Tax Report's lead panel: the year's figures over the two
 * assumptions that move the estimate, so the inputs sit next to what they
 * change. It replaces a readout strip over a separate "Filing Assumptions"
 * card, which repeated the header's filing status Select and gave a third
 * of its width to a "Tax Year" label that restated the header.
 *
 * Rendering only. The page owns the fetch, the URL params and the income
 * draft (committed on blur or Enter, never per keystroke).
 */

export interface ReportFigures {
  totalGainLoss: number;
  estimatedTax: number;
  lotCount: number;
  washSaleCount: number;
}

interface ReportEstimateProps {
  year: string;
  /** Null while loading or after a failure. */
  figures: ReportFigures | null;
  loading: boolean;
  filingStatus: FilingStatus;
  onFilingStatusChange: (status: FilingStatus) => void;
  incomeDraft: string;
  onIncomeDraftChange: (draft: string) => void;
  onIncomeCommit: () => void;
}

function Figure({ label, children, loading }: { label: string; children: ReactNode; loading: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {loading ? <Skeleton className="h-7 w-24" /> : children}
      </dd>
    </div>
  );
}

export function ReportEstimate({
  year,
  figures,
  loading,
  filingStatus,
  onFilingStatusChange,
  incomeDraft,
  onIncomeDraftChange,
  onIncomeCommit,
}: ReportEstimateProps) {
  // A failed load prints a dash, not a zero: nothing is known yet.
  const unknown = <span className="text-text-muted">&mdash;</span>;

  return (
    <section
      aria-labelledby="tax-report-estimate"
      aria-busy={loading || undefined}
      className="rounded-xl border border-border bg-bg-secondary shadow-card"
    >
      <div className="p-5">
        <h2 id="tax-report-estimate" className="text-base font-semibold text-text-primary">
          {year} capital gains
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Figure label="Total gain or loss" loading={loading}>
            {figures ? <SignedValue value={figures.totalGainLoss} /> : unknown}
          </Figure>
          <Figure label="Estimated tax" loading={loading}>
            {figures ? formatCurrency(figures.estimatedTax) : unknown}
          </Figure>
          <Figure label="Lots matched" loading={loading}>
            {figures ? figures.lotCount : unknown}
          </Figure>
          <Figure label="Wash sales" loading={loading}>
            {figures ? figures.washSaleCount : unknown}
          </Figure>
        </dl>
      </div>

      <fieldset className="min-w-0 border-t border-[var(--color-hairline-inner)] p-5">
        <legend className="sr-only">Assumptions for the estimate</legend>
        <p aria-hidden="true" className="text-sm font-medium text-text-primary">Assumptions</p>
        {/* Inputs and their caption in one row from lg, so the panel is as
            tall as its content rather than as tall as a side column. */}
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[16rem_16rem_minmax(0,1fr)] lg:items-end">
          <Select
            label="Filing status"
            options={filingStatusOptions}
            value={filingStatus}
            onChange={(v) => onFilingStatusChange(v as FilingStatus)}
          />
          <Input
            label="Other ordinary income"
            type="number"
            inputMode="decimal"
            value={incomeDraft}
            onChange={(e) => onIncomeDraftChange(e.target.value)}
            onBlur={onIncomeCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onIncomeCommit();
            }}
            min="0"
            step="1000"
          />
          <p className="text-xs leading-relaxed text-text-muted sm:col-span-2 lg:col-span-1 lg:pb-1">
            FIFO cost basis and 2024 federal brackets. An estimate, not filing
            advice. Owe estimated taxes?{" "}
            <Link
              href="/dashboard/education/guides/quarterly-estimated-taxes-for-traders"
              className="text-accent hover:underline"
            >
              Read the quarterly estimates guide
            </Link>
            .
          </p>
        </div>
      </fieldset>
    </section>
  );
}
