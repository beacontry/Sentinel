"use client";

import { useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt, Download } from "lucide-react";
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
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/button";
import {
  CURRENT_TAX_YEAR,
  TAX_YEAR_OPTIONS,
  TAX_YEAR_VALUES,
  filingStatusOptions,
} from "@/components/tax/tax-format";
import { ReportEstimate } from "@/components/tax/report-estimate";
import { NoLotsForYear } from "@/components/tax/no-lots-for-year";
import { Form8949View, LotTableSkeleton, ScheduleDView } from "@/components/tax/tax-report-views";
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



const FILING_STATUSES = filingStatusOptions.map((o) => o.value);

const TAB_IDS = ["form8949", "scheduled"] as const;
type TaxTab = (typeof TAB_IDS)[number];

const TABS: { id: TaxTab; label: string }[] = [
  { id: "form8949", label: "Form 8949" },
  { id: "scheduled", label: "Schedule D" },
];


// ─── Page ─────────────────────────────────────────────────────────

// Wrap in Suspense: useUrlParam reads useSearchParams, and Next.js 15
// requires a Suspense boundary so the SSR shell can render while the
// client hydrates.
export default function TaxReportPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Spinner className="h-6 w-6 text-accent" />
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
  const [year, setYear] = useUrlParam("year", CURRENT_TAX_YEAR, TAX_YEAR_VALUES);
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
    // An error left by an earlier request for the same inputs must not
    // show while this one is in flight; the skeleton does until it lands.
    setReportError(null);
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

  const figures = data
    ? {
        totalGainLoss: data.scheduleDSummary.totalGainLoss,
        estimatedTax: data.scheduleDSummary.estimatedTax,
        lotCount: data.summary.tradeCount,
        washSaleCount,
      }
    : null;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Tax Reports" description="Form 8949 generator from engine fills." />
      <PageIntro
        title="Tax Report"
        description="Form 8949 lots and the Schedule D summary for one tax year, from your portfolio trades and engine fills."
        actions={
          <>
            <Select
              options={TAX_YEAR_OPTIONS}
              value={year}
              onChange={(v) => setYear(v)}
              className="w-32"
              aria-label="Tax year"
            />
            <Button variant="secondary" onClick={handleExport} loading={exporting}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      <ReportEstimate
        year={year}
        figures={figures}
        loading={loading}
        filingStatus={filingStatus}
        onFilingStatusChange={setFilingStatus}
        incomeDraft={incomeDraft}
        onIncomeDraftChange={setIncomeDraft}
        onIncomeCommit={commitIncome}
      />

      <div className="space-y-4">
        <Tabs
          tabs={TABS}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as TaxTab)}
        />

        {loading ? (
          <LotTableSkeleton />
        ) : failed?.locked ? (
          <div className="rounded-xl border border-border bg-bg-secondary">
            <EmptyState
              headingLevel={2}
              icon={<Receipt className="h-7 w-7" />}
              title="Tax reports need the Trader plan"
              description="Upgrade to generate Form 8949 and Schedule D from your trades."
            />
          </div>
        ) : failed || !data ? (
          <div className="rounded-xl border border-border bg-bg-secondary">
            <ErrorState
              headingLevel={2}
              title="Could not load the tax report"
              description={`The ${year} report did not load, so nothing here reflects your trades yet.`}
              onRetry={retryReport}
            />
          </div>
        ) : data.lines.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-secondary">
            <NoLotsForYear year={year} onYearChange={setYear} />
          </div>
        ) : activeTab === "form8949" ? (
          <Form8949View
            shortTermLines={shortTermLines}
            longTermLines={longTermLines}
          />
        ) : (
          <ScheduleDView summary={data.scheduleDSummary} />
        )}
      </div>
    </div>
  );
}
