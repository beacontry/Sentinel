import { AlertTriangle, Info } from "lucide-react";
import { SignedValue } from "@/components/ui/signed-value";
import type { ScheduleDSummary } from "@/lib/tax-engine";
import { filingStatusOptions, formatCurrency } from "./tax-format";

/**
 * The Tax Report's Schedule D view: one panel with the three parts side
 * by side from md (stacked below it), then the estimate in one sentence.
 * It replaces four cards, the last of which repeated the filing status,
 * income and estimated tax the report's lead panel already shows.
 * Rendering only.
 */

interface Row {
  label: string;
  value: number;
  /** A gain or loss: printed through SignedValue. */
  signed?: boolean;
  warning?: boolean;
  total?: boolean;
}

function PartColumn({ id, title, rows }: { id: string; title: string; rows: Row[] }) {
  return (
    <section aria-labelledby={id} className="min-w-0 p-5">
      <h3 id={id} className="text-sm font-semibold text-text-primary">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-baseline justify-between gap-3 ${r.total ? "border-t border-[var(--color-hairline-inner)] pt-2" : ""}`}
          >
            <dt className={r.total ? "font-medium text-text-primary" : "text-text-secondary"}>{r.label}</dt>
            <dd className={`shrink-0 ${r.total ? "font-semibold" : ""}`}>
              {r.signed ? (
                <SignedValue value={r.value} glyph={Boolean(r.total)} />
              ) : (
                <span className={`font-mono tabular-nums ${r.warning ? "text-warning-fg" : "text-text-primary"}`}>
                  {formatCurrency(r.value)}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ScheduleDView({ summary }: { summary: ScheduleDSummary }) {
  const filingLabel =
    filingStatusOptions.find((o) => o.value === summary.filingStatus)?.label ?? summary.filingStatus;
  const lossLimit = summary.filingStatus === "married_separate" ? "$1,500" : "$3,000";

  const shortRows: Row[] = [
    { label: "Proceeds", value: summary.shortTermProceeds },
    { label: "Cost basis", value: summary.shortTermCostBasis },
    ...(summary.shortTermWashSaleAdj > 0
      ? [{ label: "Wash sale adjustments", value: summary.shortTermWashSaleAdj, warning: true }]
      : []),
    { label: "Net short-term", value: summary.netShortTerm, signed: true, total: true },
  ];
  const longRows: Row[] = [
    { label: "Proceeds", value: summary.longTermProceeds },
    { label: "Cost basis", value: summary.longTermCostBasis },
    ...(summary.longTermWashSaleAdj > 0
      ? [{ label: "Wash sale adjustments", value: summary.longTermWashSaleAdj, warning: true }]
      : []),
    { label: "Net long-term", value: summary.netLongTerm, signed: true, total: true },
  ];
  const totalRows: Row[] = [
    { label: "Net short-term (Part I)", value: summary.netShortTerm, signed: true },
    { label: "Net long-term (Part II)", value: summary.netLongTerm, signed: true },
    { label: "Total gain or loss", value: summary.totalGainLoss, signed: true, total: true },
  ];

  return (
    <section
      aria-labelledby="schedule-d"
      className="rounded-xl border border-border bg-bg-secondary shadow-card"
    >
      <h2 id="schedule-d" className="px-5 pt-5 text-base font-semibold text-text-primary">
        Schedule D summary
      </h2>
      <div className="grid grid-cols-1 divide-y divide-[var(--color-hairline-inner)] md:grid-cols-3 md:divide-x md:divide-y-0">
        <PartColumn id="schedule-d-1" title="Part I: Short-term" rows={shortRows} />
        <PartColumn id="schedule-d-2" title="Part II: Long-term" rows={longRows} />
        <PartColumn id="schedule-d-3" title="Part III: Summary" rows={totalRows} />
      </div>

      <div className="space-y-3 border-t border-[var(--color-hairline-inner)] p-5">
        {summary.capitalLossCarryforward > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-fill px-3 py-2 text-sm text-warning-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Capital loss carryforward of {formatCurrency(summary.capitalLossCarryforward)}. Net
              capital losses above {lossLimit} a year carry forward to later tax years.
            </p>
          </div>
        )}
        <p className="text-sm text-text-secondary">
          Estimated tax on these gains:{" "}
          <span className="font-mono font-semibold tabular-nums text-text-primary">
            {formatCurrency(summary.estimatedTax)}
          </span>
          , an effective{" "}
          <span className="font-mono tabular-nums text-text-primary">{summary.effectiveRate}%</span>{" "}
          of the net gain. Assumes the {filingLabel} filing status and{" "}
          {formatCurrency(summary.ordinaryIncome)} of other income.
        </p>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Short-term gains are taxed at your marginal ordinary rate; long-term
            gains at 0%, 15% or 20% depending on income. Excludes state tax, the
            3.8% NIIT and AMT.
          </span>
        </p>
      </div>
    </section>
  );
}
