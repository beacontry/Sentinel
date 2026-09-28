"use client";

import { useState, useEffect, Suspense } from "react";
import { Receipt, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/toast";
import { PageIntro } from "@/components/layout/page-intro";
import { TaxStatusCard } from "@/components/education/tax-status-card";
import { PaywallBanner } from "@/components/tiers/paywall-banner";
import { useLatestRequest } from "@/hooks/use-latest-request";
import { useUrlParam } from "@/hooks/use-url-param";
import {
  CURRENT_TAX_YEAR,
  TAX_YEAR_OPTIONS,
  TAX_YEAR_VALUES,
  type TaxSummary,
} from "@/components/tax/tax-format";
import { NoLotsForYear } from "@/components/tax/no-lots-for-year";
import { PersonalizedTaxEducation } from "@/components/tax/tax-education";
import { YearSummary, YearSummarySkeleton } from "@/components/tax/year-summary";
import {
  HarvestSuggestions,
  type HarvestState,
  type HarvestingSuggestion,
} from "@/components/tax/harvest-suggestions";

// useUrlParam reads useSearchParams, which needs a Suspense boundary so
// the SSR shell can render while the client hydrates.
export default function TaxCenterPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TaxCenterPage />
    </Suspense>
  );
}

function TaxCenterPage() {
  const { toast } = useToast();
  // The year lives in the URL, like the Tax Report's, so a reload or a
  // shared link shows the same year.
  const [year, setYear] = useUrlParam("year", CURRENT_TAX_YEAR, TAX_YEAR_VALUES);
  // The summary is stored with the year it was fetched for and shown only
  // while that year is selected, so a slower response for the previous
  // year cannot paint over this one. A failed fetch is its own state, not
  // "No Trade Data".
  const [report, setReport] = useState<{ year: string; summary: TaxSummary | null } | null>(null);
  const [reportError, setReportError] = useState<{ year: string; locked: boolean } | null>(null);
  const [reportNonce, setReportNonce] = useState(0);
  const reportRequest = useLatestRequest();
  const [suggestions, setSuggestions] = useState<HarvestingSuggestion[]>([]);
  const [unpricedSymbols, setUnpricedSymbols] = useState<string[]>([]);
  const [harvestLoading, setHarvestLoading] = useState(true);
  const [harvestError, setHarvestError] = useState(false);
  const [harvestNonce, setHarvestNonce] = useState(0);
  const harvestRequest = useLatestRequest();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const ticket = reportRequest.begin();
    // An error left by an earlier request for the same inputs must not
    // show while this one is in flight; the skeleton does until it lands.
    setReportError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tax/report?year=${year}`, { signal: ticket.signal });
        if (!ticket.isCurrent()) return;
        if (!res.ok) {
          // 402 is the tier gate. The PaywallBanner explains it, so it
          // gets no Retry.
          setReportError({ year, locked: res.status === 402 });
          return;
        }
        const data = await res.json();
        if (!ticket.isCurrent()) return;
        setReport({ year, summary: data?.summary ?? null });
      } catch {
        if (ticket.isCurrent()) setReportError({ year, locked: false });
      }
    })();
  }, [year, reportNonce, reportRequest]);

  useEffect(() => {
    const ticket = harvestRequest.begin();
    setHarvestLoading(true);
    setHarvestError(false);
    (async () => {
      try {
        const res = await fetch("/api/tax/harvesting", { signal: ticket.signal });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!ticket.isCurrent()) return;
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        setUnpricedSymbols(Array.isArray(data?.unpricedSymbols) ? data.unpricedSymbols : []);
      } catch {
        if (!ticket.isCurrent()) return;
        setSuggestions([]);
        setUnpricedSymbols([]);
        setHarvestError(true);
      } finally {
        if (ticket.isCurrent()) setHarvestLoading(false);
      }
    })();
  }, [harvestNonce, harvestRequest]);

  const reportForYear = report?.year === year ? report : null;
  const summary = reportForYear?.summary ?? null;
  const failed = !reportForYear && reportError?.year === year ? reportError : null;
  const loading = !reportForYear && !failed;

  const retryReport = () => {
    setReportError(null);
    setReportNonce((n) => n + 1);
  };

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/tax/report?year=${year}&format=csv`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tax-trades-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ type: "error", message: "Tax CSV export failed. Try again in a moment." });
    } finally {
      setExporting(false);
    }
  }

  const harvestState: HarvestState = harvestLoading
    ? { status: "loading" }
    : harvestError
      ? { status: "error", retry: () => setHarvestNonce((n) => n + 1) }
      : { status: "ready", suggestions, unpricedSymbols };

  return (
    <div className="p-4 lg:p-6">
      <PaywallBanner minTier="trader" featureName="Tax Center" description="Realized gains + harvesting candidates merged from manual + engine trades." />
      <PageIntro
        title="Tax Center"
        description="What your closed trades realized this year, the tax they may carry, and the open losses that could offset it."
        actions={
          <>
            <Select
              options={TAX_YEAR_OPTIONS}
              value={year}
              onChange={(value) => setYear(value)}
              className="w-32"
              aria-label="Tax year"
            />
            <Button
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {loading ? (
            <YearSummarySkeleton />
          ) : summary && summary.tradeCount > 0 ? (
            <YearSummary year={year} summary={summary} />
          ) : failed?.locked ? (
            <div className="rounded-xl border border-border bg-bg-secondary">
              <EmptyState
                headingLevel={2}
                icon={<Receipt className="h-7 w-7" />}
                title="The Tax Center needs the Trader plan"
                description="Upgrade to see realized gains and estimated tax from your trades."
              />
            </div>
          ) : failed ? (
            <div className="rounded-xl border border-border bg-bg-secondary">
              <ErrorState
                headingLevel={2}
                title="Could not load the tax report"
                description={`The ${year} summary did not load, so nothing here reflects your trades yet.`}
                onRetry={retryReport}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-bg-secondary">
              <NoLotsForYear year={year} onYearChange={setYear} />
            </div>
          )}

          <HarvestSuggestions state={harvestState} />
        </div>

        <aside aria-label="Tax status and guides" className="min-w-0 space-y-6">
          <TaxStatusCard />
          <PersonalizedTaxEducation summary={summary} suggestionsCount={suggestions.length} />
        </aside>
      </div>
    </div>
  );
}
