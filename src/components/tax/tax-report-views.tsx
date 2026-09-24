import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignedValue } from "@/components/ui/signed-value";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, DollarSign, Info } from "lucide-react";
import type { Form8949Line, ScheduleDSummary } from "@/lib/tax-engine";
import { filingStatusOptions, formatCurrency, formatDate } from "./tax-format";

/**
 * The Tax Report's two views, Form 8949 lot tables and the Schedule D
 * summary. Rendering only; the page owns the report fetch, the year, the
 * filing status and the export. Every gain or loss goes through
 * SignedValue.
 */

// ─── Form 8949 View ───────────────────────────────────────────────

export function Form8949View({
  shortTermLines,
  longTermLines,
}: {
  shortTermLines: Form8949Line[];
  longTermLines: Form8949Line[];
}) {
  return (
    <div className="space-y-6">
      {/* Part I — Short-Term */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Part I &mdash; Short-Term Capital Gains and Losses</CardTitle>
            <Badge variant="neutral">{shortTermLines.length} lots</Badge>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Assets held one year or less. Taxed as ordinary income.
          </p>
        </CardHeader>
        {shortTermLines.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">
            No short-term transactions for this period.
          </p>
        ) : (
          <LotTable lines={shortTermLines} />
        )}
      </Card>

      {/* Part II — Long-Term */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Part II &mdash; Long-Term Capital Gains and Losses</CardTitle>
            <Badge variant="neutral">{longTermLines.length} lots</Badge>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Assets held more than one year. Taxed at preferential rates.
          </p>
        </CardHeader>
        {longTermLines.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">
            No long-term transactions for this period.
          </p>
        ) : (
          <LotTable lines={longTermLines} />
        )}
      </Card>
    </div>
  );
}

// ─── Lot Table ────────────────────────────────────────────────────

function LotTable({ lines }: { lines: Form8949Line[] }) {
  const sorted = [...lines].sort((a, b) => a.dateSold.localeCompare(b.dateSold));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-muted text-left">
            <th className="pb-2 pr-4 font-medium">Description</th>
            <th className="pb-2 pr-4 font-medium">Date Acquired</th>
            <th className="pb-2 pr-4 font-medium">Date Sold</th>
            <th className="pb-2 pr-4 font-medium text-right">Proceeds</th>
            <th className="pb-2 pr-4 font-medium text-right">Cost Basis</th>
            <th className="pb-2 pr-4 font-medium text-center">Adj</th>
            <th className="pb-2 font-medium text-right">Gain/Loss</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {sorted.map((line, i) => (
            <tr
              key={`${line.symbol}-${line.dateAcquired}-${line.dateSold}-${i}`}
              className="border-b border-border/50"
            >
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-sans font-medium text-text-primary">
                    {line.quantity} sh {line.symbol}
                  </span>
                  {line.washSale && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="w-3 h-3" />
                      W
                    </span>
                  )}
                  <Badge
                    variant="neutral"
                    className="text-xs px-1.5 py-0"
                  >
                    {line.source === "engine" ? "ENG" : "PTF"}
                  </Badge>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-text-secondary font-sans text-xs">
                {formatDate(line.dateAcquired)}
              </td>
              <td className="py-2.5 pr-4 text-text-secondary font-sans text-xs">
                {formatDate(line.dateSold)}
              </td>
              <td className="py-2.5 pr-4 text-right text-text-primary">
                {formatCurrency(line.proceeds)}
              </td>
              <td className="py-2.5 pr-4 text-right text-text-primary">
                {formatCurrency(line.costBasis)}
              </td>
              <td className="py-2.5 pr-4 text-center">
                {line.washSale ? (
                  <span className="text-warning text-xs font-sans">
                    W {formatCurrency(line.washSaleDisallowed)}
                  </span>
                ) : (
                  <span className="text-text-muted">&mdash;</span>
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
            <td colSpan={3} className="py-3 font-sans font-semibold text-text-primary">
              Total ({lines.length} lots)
            </td>
            <td className="py-3 text-right font-semibold text-text-primary">
              {formatCurrency(lines.reduce((s, l) => s + l.proceeds, 0))}
            </td>
            <td className="py-3 text-right font-semibold text-text-primary">
              {formatCurrency(lines.reduce((s, l) => s + l.costBasis, 0))}
            </td>
            <td className="py-3 text-center">
              {lines.some((l) => l.washSale) ? (
                <span className="text-warning text-xs font-sans">
                  {formatCurrency(lines.reduce((s, l) => s + l.washSaleDisallowed, 0))}
                </span>
              ) : (
                <span className="text-text-muted">&mdash;</span>
              )}
            </td>
            <td className="py-3 text-right font-bold">
              <SignedValue value={lines.reduce((s, l) => s + l.gainLoss, 0)} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Schedule D View ──────────────────────────────────────────────

export function ScheduleDView({ summary }: { summary: ScheduleDSummary }) {
  const filingLabel =
    filingStatusOptions.find((o) => o.value === summary.filingStatus)?.label ??
    summary.filingStatus;

  return (
    <div className="space-y-6">
      {/* Part I — Short-Term */}
      <Card>
        <CardHeader>
          <CardTitle>Part I &mdash; Short-Term Capital Gains and Losses</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <SummaryRow label="Total Proceeds" value={summary.shortTermProceeds} />
          <SummaryRow label="Total Cost Basis" value={summary.shortTermCostBasis} />
          {summary.shortTermWashSaleAdj > 0 && (
            <SummaryRow
              label="Wash Sale Adjustments"
              value={summary.shortTermWashSaleAdj}
              variant="warning"
            />
          )}
          <div className="border-t border-border pt-3">
            <SummaryRow
              label="Net Short-Term Capital Gain/Loss"
              value={summary.netShortTerm}
              bold
              colored
            />
          </div>
        </div>
      </Card>

      {/* Part II — Long-Term */}
      <Card>
        <CardHeader>
          <CardTitle>Part II &mdash; Long-Term Capital Gains and Losses</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <SummaryRow label="Total Proceeds" value={summary.longTermProceeds} />
          <SummaryRow label="Total Cost Basis" value={summary.longTermCostBasis} />
          {summary.longTermWashSaleAdj > 0 && (
            <SummaryRow
              label="Wash Sale Adjustments"
              value={summary.longTermWashSaleAdj}
              variant="warning"
            />
          )}
          <div className="border-t border-border pt-3">
            <SummaryRow
              label="Net Long-Term Capital Gain/Loss"
              value={summary.netLongTerm}
              bold
              colored
            />
          </div>
        </div>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Part III &mdash; Summary</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <SummaryRow
            label="Net Short-Term (from Part I)"
            value={summary.netShortTerm}
            colored
          />
          <SummaryRow
            label="Net Long-Term (from Part II)"
            value={summary.netLongTerm}
            colored
          />
          <div className="border-t border-border pt-3">
            <SummaryRow
              label="Total Capital Gain/Loss"
              value={summary.totalGainLoss}
              bold
              colored
            />
          </div>

          {summary.capitalLossCarryforward > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
              <p className="text-sm text-warning flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Capital loss carryforward: {formatCurrency(summary.capitalLossCarryforward)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Net capital losses exceeding $
                {summary.filingStatus === "married_separate" ? "1,500" : "3,000"} are
                carried forward to future tax years.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Tax Estimate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-text-muted" />
            Estimated Tax Impact
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="eyebrow text-text-muted">
              Filing Status
            </p>
            <p className="text-sm font-medium text-text-primary mt-1">{filingLabel}</p>
          </div>
          <div>
            <p className="eyebrow text-text-muted">
              Other Income
            </p>
            <p className="text-sm font-mono text-text-primary mt-1">
              {formatCurrency(summary.ordinaryIncome)}
            </p>
          </div>
          <div>
            <p className="eyebrow text-text-muted">
              Estimated Tax on Gains
            </p>
            <p className="text-lg font-mono font-bold text-text-primary tabular-nums mt-1">
              {formatCurrency(summary.estimatedTax)}
            </p>
          </div>
          <div>
            <p className="eyebrow text-text-muted">
              Effective Rate
            </p>
            <p className="text-sm font-mono text-text-primary mt-1 flex items-center gap-1">
              {summary.effectiveRate}%
              {summary.totalGainLoss > 0 ? (
                <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5 text-text-muted" />
              ) : summary.totalGainLoss < 0 ? (
                <ArrowDownRight aria-hidden="true" className="w-3.5 h-3.5 text-text-muted" />
              ) : null}
            </p>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-4 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Short-term gains taxed at your marginal ordinary income rate. Long-term gains
          taxed at 0%/15%/20% depending on income. Does not include state taxes, NIIT
          (3.8%), or AMT.
        </p>
      </Card>
    </div>
  );
}

// ─── Summary Row ──────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  bold = false,
  colored = false,
  variant,
}: {
  label: string;
  value: number;
  bold?: boolean;
  colored?: boolean;
  variant?: "warning";
}) {
  const valueClass = variant === "warning" ? "text-warning" : "text-text-primary";

  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-sm ${bold ? "font-semibold text-text-primary" : "text-text-secondary"}`}
      >
        {label}
      </span>
      {colored ? (
        // A gain or loss: sign, glyph and hidden word, not colour alone.
        <SignedValue value={value} className={`text-sm ${bold ? "font-bold" : "font-medium"}`} />
      ) : (
        <span className={`font-mono text-sm tabular-nums ${bold ? "font-bold" : "font-medium"} ${valueClass}`}>
          {formatCurrency(value)}
        </span>
      )}
    </div>
  );
}
