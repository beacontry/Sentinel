"use client";

import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Receipt,
  Download,
  AlertTriangle,
  FileText,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import type {
  Form8949Line,
  ScheduleDSummary,
  TaxSummary,
  FilingStatus,
} from "@/lib/tax-engine";
import { PaywallBanner } from "@/components/tiers/paywall-banner";
import { useToast } from "@/components/ui/toast";
import { useUrlParam } from "@/hooks/use-url-param";
import { useLatestRequest } from "@/hooks/use-latest-request";
import {
  DEFAULT_ORDINARY_INCOME,
  commitIncomeDraft,
  isIncomeParam,
} from "@/lib/tax-inputs";

// ─── Types ────────────────────────────────────────────────────────

interface Form8949Response {
  year: number;
  lines: Form8949Line[];
  summary: TaxSummary;
  scheduleDSummary: ScheduleDSummary;
}

// ─── Constants ────────────────────────────────────────────────────

const currentYear = new Date().getFullYear();

const yearOptions = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i),
}));

const YEAR_VALUES = yearOptions.map((o) => o.value);

const filingStatusOptions: { value: FilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "married_joint", label: "Married Filing Jointly" },
  { value: "married_separate", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
];

const FILING_STATUSES = filingStatusOptions.map((o) => o.value);

const TAB_IDS = ["form8949", "scheduled"] as const;
type TaxTab = (typeof TAB_IDS)[number];

const TABS: { id: TaxTab; label: string }[] = [
  { id: "form8949", label: "Form 8949" },
  { id: "scheduled", label: "Schedule D" },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ─── Page ─────────────────────────────────────────────────────────

// Wrap in Suspense: useUrlParam reads useSearchParams, and Next.js 15
// requires a Suspense boundary so the SSR shell can render while the
// client hydrates.
export default function TaxReportPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <TaxReportPage />
    </Suspense>
  );
}

function isForm8949Response(json: unknown): json is Form8949Response {
  if (typeof json !== "object" || json === null) return false;
  const d = json as Record<string, unknown>;
  return (
    Array.isArray(d.lines) &&
    typeof d.summary === "object" && d.summary !== null &&
    typeof d.scheduleDSummary === "object" && d.scheduleDSummary !== null
  );
}

function TaxReportPage() {
  const { toast } = useToast();
  // View and filing inputs live in the URL, so a reload or the 401
  // redirect back from /login shows the same report.
  const [year, setYear] = useUrlParam("year", String(currentYear), YEAR_VALUES);
  const [filingStatus, setFilingStatus] = useUrlParam<FilingStatus>("filing", "single", FILING_STATUSES);
  const [ordinaryIncome, setOrdinaryIncome] = useUrlParam(
    "income",
    String(DEFAULT_ORDINARY_INCOME),
    isIncomeParam,
  );
  const [activeTab, setActiveTab] = useUrlParam<TaxTab>("tab", "form8949", TAB_IDS);
  // The income field is a draft, committed on blur or Enter. The report is
  // fetched for committed values only, never per keystroke, and an empty
  // or invalid field reverts rather than becoming the $50,000 default.
  const [incomeDraft, setIncomeDraft] = useState(ordinaryIncome);
  useEffect(() => {
    setIncomeDraft(ordinaryIncome);
  }, [ordinaryIncome]);
  const commitIncome = () => {
    const next = commitIncomeDraft(incomeDraft, ordinaryIncome);
    setIncomeDraft(next);
    if (next !== ordinaryIncome) setOrdinaryIncome(next);
  };

  // Responses are stored with the inputs they were computed for and shown
  // only while those are still the current inputs, so a slower response
  // for earlier inputs can never paint over the current ones. A failed
  // fetch is its own state, not "No Realized Trades".
  const reportKey = `${year}|${filingStatus}|${ordinaryIncome}`;
  const [report, setReport] = useState<{ key: string; data: Form8949Response } | null>(null);
  const [reportError, setReportError] = useState<{ key: string; locked: boolean } | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const reportRequest = useLatestRequest();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const ticket = reportRequest.begin();
    const key = `${year}|${filingStatus}|${ordinaryIncome}`;
    const params = new URLSearchParams({ year, filingStatus, ordinaryIncome });
    (async () => {
      try {
        const res = await fetch(`/api/tax/form8949?${params}`, { signal: ticket.signal });
        if (!ticket.isCurrent()) return;
        if (!res.ok) {
          // 402 is the tier gate. The PaywallBanner explains it, so it
          // gets no Retry.
          setReportError({ key, locked: res.status === 402 });
          return;
        }
        const json: unknown = await res.json();
        if (!ticket.isCurrent()) return;
        if (!isForm8949Response(json)) throw new Error("Unexpected tax report response");
        setReport({ key, data: json });
      } catch {
        if (ticket.isCurrent()) setReportError({ key, locked: false });
      }
    })();
  }, [year, filingStatus, ordinaryIncome, reloadNonce, reportRequest]);

  const data = report?.key === reportKey ? report.data : null;
  const failed = !data && reportError?.key === reportKey ? reportError : null;
  const loading = !data && !failed;

  const retryReport = () => {
    setReportError(null);
    setReloadNonce((n) => n + 1);
  };

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        year,
        filingStatus,
        // Clicking Export blurs the income field in the same gesture, before
        // its commit has re-rendered, so read the draft as the commit would.
        ordinaryIncome: commitIncomeDraft(incomeDraft, ordinaryIncome),
        format: "csv",
      });
      const res = await fetch(`/api/tax/form8949?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-8949-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ type: "error", message: "Form 8949 export failed. Try again in a moment." });
    } finally {
      setExporting(false);
    }
  }

  const shortTermLines = data?.lines.filter((l) => !l.isLongTerm) ?? [];
  const longTermLines = data?.lines.filter((l) => l.isLongTerm) ?? [];
  const washSaleCount = data?.lines.filter((l) => l.washSale).length ?? 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Tax Reports" description="Form 8949 generator from engine fills." />
      <PageIntro
        eyebrow="Record"
        title="Tax Report"
        description="Form 8949 and Schedule D capital gains report with lot-level detail."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              options={yearOptions}
              value={year}
              onChange={(v) => setYear(v)}
              className="w-28"
            />
            <Select
              options={filingStatusOptions}
              value={filingStatus}
              onChange={(v) => setFilingStatus(v as FilingStatus)}
              className="w-48"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              loading={exporting}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span> CSV
            </Button>
          </div>
        }
        stats={[
          {
            label: "Total Gain/Loss",
            value: data ? formatCurrency(data.scheduleDSummary.totalGainLoss) : "--",
            tone: data
              ? data.scheduleDSummary.totalGainLoss >= 0
                ? "bullish"
                : "bearish"
              : "neutral",
          },
          {
            label: "Est. Tax",
            value: data ? formatCurrency(data.scheduleDSummary.estimatedTax) : "--",
          },
          {
            label: "Lots Matched",
            value: data ? String(data.summary.tradeCount) : "--",
          },
          {
            label: "Wash Sales",
            value: data ? String(washSaleCount) : "--",
            tone: washSaleCount > 0 ? "bearish" : "neutral",
          },
        ]}
      />

      {/* Filing Assumptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-text-muted" />
            Filing Assumptions
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Filing Status"
            options={filingStatusOptions}
            value={filingStatus}
            onChange={(v) => setFilingStatus(v as FilingStatus)}
          />
          <Input
            label="Other Ordinary Income"
            type="number"
            value={incomeDraft}
            onChange={(e) => setIncomeDraft(e.target.value)}
            onBlur={commitIncome}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitIncome();
            }}
            min="0"
            step="1000"
          />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted mb-1.5">
              Tax Year
            </p>
            <p className="text-sm text-text-secondary mt-2">
              {year} tax year &middot; FIFO cost basis method
            </p>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Tax estimates are approximate. Uses 2024 federal brackets. Consult a
            tax professional for filing. Owe estimated taxes?{" "}
            <Link
              href="/dashboard/education/guides/quarterly-estimated-taxes-for-traders"
              className="text-accent hover:underline"
            >
              Read the quarterly estimates guide
            </Link>
            .
          </span>
        </p>
      </Card>

      {/* Tabs: Form 8949 / Schedule D */}
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as TaxTab)}
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" rounded="lg" />
          ))}
        </div>
      ) : failed?.locked ? (
        <EmptyState
          icon={<Receipt className="h-7 w-7" />}
          title="Tax Reports Need the Trader Plan"
          description="Upgrade to generate Form 8949 and Schedule D from your trades."
        />
      ) : failed || !data ? (
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7" />}
          title="Couldn't Load the Tax Report"
          description={`The ${year} report did not load, so nothing here reflects your trades yet.`}
          action={{ label: "Retry", onClick: retryReport }}
        />
      ) : data.lines.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-7 w-7" />}
          title="No Realized Trades"
          description={`No matched buy/sell lots found for ${year}. Trade data from both portfolios and the engine are included.`}
        />
      ) : activeTab === "form8949" ? (
        <Form8949View
          shortTermLines={shortTermLines}
          longTermLines={longTermLines}
        />
      ) : (
        <ScheduleDView summary={data.scheduleDSummary} />
      )}
    </div>
  );
}

// ─── Form 8949 View ───────────────────────────────────────────────

function Form8949View({
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
                    <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                      <AlertTriangle className="w-3 h-3" />
                      W
                    </span>
                  )}
                  <Badge
                    variant="neutral"
                    className="text-[10px] px-1.5 py-0"
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
              <td
                className={`py-2.5 text-right font-semibold ${
                  line.gainLoss >= 0 ? "text-bullish" : "text-bearish"
                }`}
              >
                {line.gainLoss >= 0 ? "+" : ""}
                {formatCurrency(line.gainLoss)}
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
            <td
              className={`py-3 text-right font-bold ${
                lines.reduce((s, l) => s + l.gainLoss, 0) >= 0
                  ? "text-bullish"
                  : "text-bearish"
              }`}
            >
              {formatCurrency(lines.reduce((s, l) => s + l.gainLoss, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Schedule D View ──────────────────────────────────────────────

function ScheduleDView({ summary }: { summary: ScheduleDSummary }) {
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
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Filing Status
            </p>
            <p className="text-sm font-medium text-text-primary mt-1">{filingLabel}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Other Income
            </p>
            <p className="text-sm font-mono text-text-primary mt-1">
              {formatCurrency(summary.ordinaryIncome)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Estimated Tax on Gains
            </p>
            <p className="text-lg font-mono font-bold text-warning mt-1">
              {formatCurrency(summary.estimatedTax)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Effective Rate
            </p>
            <p className="text-sm font-mono text-text-primary mt-1 flex items-center gap-1">
              {summary.effectiveRate}%
              {summary.totalGainLoss > 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-bearish" />
              ) : summary.totalGainLoss < 0 ? (
                <ArrowDownRight className="w-3.5 h-3.5 text-bullish" />
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
  let valueClass = "text-text-primary";
  if (colored) {
    valueClass = value >= 0 ? "text-bullish" : "text-bearish";
  }
  if (variant === "warning") {
    valueClass = "text-warning";
  }

  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-sm ${bold ? "font-semibold text-text-primary" : "text-text-secondary"}`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-sm ${bold ? "font-bold" : "font-medium"} ${valueClass}`}
      >
        {colored && value > 0 ? "+" : ""}
        {formatCurrency(value)}
      </span>
    </div>
  );
}
