"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Receipt,
  AlertTriangle,
  Download,
  Leaf,
  Calendar,
  BookOpen,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { TaxStatusCard } from "@/components/education/tax-status-card";
import { PaywallBanner } from "@/components/tiers/paywall-banner";
import { useToast } from "@/components/ui/toast";
import { useLatestRequest } from "@/hooks/use-latest-request";
import { ErrorState } from "@/components/ui/error-state";
import { SignedValue } from "@/components/ui/signed-value";
import { formatCurrency, type TaxSummary } from "@/components/tax/tax-format";
import { PersonalizedTaxEducation } from "@/components/tax/tax-education";


interface HarvestingSuggestion {
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


const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i),
}));

export default function TaxCenterPage() {
  const { toast } = useToast();
  const [year, setYear] = useState(String(currentYear));
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

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PaywallBanner minTier="trader" featureName="Tax Center" description="Realized gains + harvesting candidates merged from manual + engine trades." />
      <PageIntro
        title="Tax Center"
        description="Monitor your realized gains, estimated tax liability, and harvesting opportunities."
        actions={
          <div className="flex items-center gap-3">
            <Select
              options={yearOptions}
              value={year}
              onChange={(value) => setYear(value)}
              className="w-32"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              loading={exporting}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        }
        stats={[
          { label: "Net Gain", value: summary ? <SignedValue value={summary.netGain} /> : "--" },
          { label: "Estimated Tax", value: summary ? formatCurrency(summary.estimatedTax) : "--" },
          { label: "Total Trades", value: summary ? String(summary.tradeCount) : "--" },
          { label: "Harvest Opps", value: harvestLoading || harvestError ? "--" : String(suggestions.length) },
        ]}
      />

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" rounded="lg" />
          ))}
        </div>
      ) : summary ? (
        <section aria-labelledby="tax-summary" className="rounded-xl border border-border bg-bg-secondary p-2 shadow-card">
          <h2 id="tax-summary" className="sr-only">{year} summary</h2>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-bg-surface p-3">
              <dt className="eyebrow text-text-muted">Short-term gains</dt>
              <dd className="mt-1 text-xl font-semibold"><SignedValue value={summary.shortTermGains} /></dd>
              <dd className="mt-1 text-xs text-text-muted">22% tax rate</dd>
            </div>
            <div className="rounded-lg bg-bg-surface p-3">
              <dt className="eyebrow text-text-muted">Long-term gains</dt>
              <dd className="mt-1 text-xl font-semibold"><SignedValue value={summary.longTermGains} /></dd>
              <dd className="mt-1 text-xs text-text-muted">15% tax rate</dd>
            </div>
            <div className="rounded-lg bg-bg-surface p-3">
              <dt className="eyebrow text-text-muted">Total losses</dt>
              <dd className="mt-1 text-xl font-semibold">
                <SignedValue value={-(summary.shortTermLosses + summary.longTermLosses)} />
              </dd>
              <dd className="mt-1 text-xs text-text-muted">{summary.tradeCount} trades</dd>
            </div>
            <div className="rounded-lg bg-bg-surface p-3">
              <dt className="eyebrow text-text-muted">Estimated tax</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-text-primary">
                {formatCurrency(summary.estimatedTax)}
              </dd>
              <dd className="mt-1 text-xs text-text-muted">
                Net: <SignedValue value={summary.netGain} glyph={false} />
              </dd>
              <dd>
                <Link
                  href="/dashboard/education/guides/quarterly-estimated-taxes-for-traders"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs text-accent hover:underline"
                >
                  <BookOpen className="w-3 h-3" aria-hidden="true" />
                  Owe quarterly?
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      ) : failed?.locked ? (
        <EmptyState
          icon={<Receipt className="w-12 h-12" />}
          title="Tax Center Needs the Trader Plan"
          description="Upgrade to see realized gains and estimated tax from your trades."
        />
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
        <EmptyState
          icon={<Receipt className="w-12 h-12" />}
          title="No Trade Data"
          description="Create a portfolio and make some trades to see your tax report."
        />
      )}

      {/* Gains Breakdown */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Gains & Losses Breakdown</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text-secondary">
                Short-Term (held &lt; 1 year)
              </h4>
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-hairline-inner)]">
                <span className="text-sm text-text-secondary">Gains</span>
                <SignedValue value={summary.shortTermGains} glyph={false} className="text-sm font-medium" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-hairline-inner)]">
                <span className="text-sm text-text-secondary">Losses</span>
                <SignedValue value={-summary.shortTermLosses} glyph={false} className="text-sm font-medium" />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-text-primary">Net</span>
                <SignedValue value={summary.shortTermGains - summary.shortTermLosses} className="text-sm font-bold" />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text-secondary">
                Long-Term (held &gt; 1 year)
              </h4>
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-hairline-inner)]">
                <span className="text-sm text-text-secondary">Gains</span>
                <SignedValue value={summary.longTermGains} glyph={false} className="text-sm font-medium" />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[var(--color-hairline-inner)]">
                <span className="text-sm text-text-secondary">Losses</span>
                <SignedValue value={-summary.longTermLosses} glyph={false} className="text-sm font-medium" />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-text-primary">Net</span>
                <SignedValue value={summary.longTermGains - summary.longTermLosses} className="text-sm font-bold" />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tax Status — TTS / MTM declaration */}
      <TaxStatusCard />

      {/* Tax-Loss Harvesting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-bullish" />
            Tax-Loss Harvesting Suggestions
          </CardTitle>
          <Link
            href="/dashboard/education/guides/wash-sale-rules-deep-dive"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Wash sale rules
          </Link>
        </CardHeader>

        {!harvestLoading && unpricedSymbols.length > 0 && (
          <div role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-fill px-3 py-2 text-xs text-warning-fg">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              No current price for {unpricedSymbols.join(", ")}. These positions
              are left out of the suggestions below; reload to try again.
            </span>
          </div>
        )}

        {harvestLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" rounded="lg" />
            ))}
          </div>
        ) : harvestError ? (
          <ErrorState
            compact
            headingLevel={3}
            title="Could not load harvesting suggestions"
            description="This is not the same as having none."
            onRetry={() => setHarvestNonce((n) => n + 1)}
          />
        ) : suggestions.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-text-muted">
              No harvesting opportunities found. Positions with unrealized
              losses will appear here.
            </p>
            <p className="text-xs text-text-muted">
              Want to see how harvesting actually works?{" "}
              <Link
                href="/dashboard/education#calculators"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" />
                Try the Tax-Loss Harvesting calculator
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div
                key={s.symbol}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-bg-surface"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-text-primary">{s.symbol}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {s.quantity} shares at {formatCurrency(s.entryPrice)}
                    </p>
                    <p className="text-xs text-text-muted">
                      Current: {formatCurrency(s.currentPrice)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      <SignedValue value={-Math.abs(s.currentLoss)} />
                    </p>
                    <p className="text-xs text-bullish">
                      Save ~{formatCurrency(s.potentialSavings)}
                      <span
                        className="text-text-muted"
                        title={
                          s.holdingPeriodKnown
                            ? s.isLongTerm
                              ? "Long-term: valued at the LTCG rate"
                              : "Short-term: valued at the ordinary rate"
                            : "Holding period unknown (broker lot) — estimated at the short-term/ordinary rate"
                        }
                      >
                        {" "}
                        ({s.holdingPeriodKnown ? (s.isLongTerm ? "LT" : "ST") : "est."})
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Wash sale until {s.washSaleDate}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <p className="text-xs text-text-muted mt-2">
              * Estimated savings = loss × the rate matching its holding period
              (LT = long-term/LTCG, ST = short-term/ordinary, est. = holding
              period unknown, assumed short-term). It&apos;s a gross upper bound:
              losses deducted against ordinary income are capped at $3,000/yr
              ($1,500 married-separate) when you have no offsetting capital gains.
              Tax-loss harvesting sells at a loss to offset gains; the wash-sale
              rule prevents repurchasing the same security within 30 days.{" "}
              <Link
                href="/dashboard/education/guides/wash-sale-rules-deep-dive"
                className="text-accent hover:underline"
              >
                Read the deep-dive on wash sales
              </Link>{" "}
              before acting — IRA replacements can permanently kill the loss.
            </p>
          </div>
        )}
      </Card>

      {/* Education footer — data-driven ranking based on user state */}
      <PersonalizedTaxEducation
        summary={summary}
        suggestionsCount={suggestions.length}
      />
    </div>
  );
}
