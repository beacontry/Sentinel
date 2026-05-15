"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Receipt,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Download,
  Leaf,
  Calendar,
  BookOpen,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { TaxStatusCard } from "@/components/education/tax-status-card";
import { PaywallBanner } from "@/components/tiers/paywall-banner";

interface TaxSummary {
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netGain: number;
  estimatedTax: number;
  tradeCount: number;
}

interface HarvestingSuggestion {
  symbol: string;
  currentLoss: number;
  potentialSavings: number;
  washSaleDate: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - i),
  label: String(currentYear - i),
}));

export default function TaxCenterPage() {
  const [year, setYear] = useState(String(currentYear));
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [suggestions, setSuggestions] = useState<HarvestingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [harvestLoading, setHarvestLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tax/report?year=${year}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  const fetchHarvesting = useCallback(async () => {
    setHarvestLoading(true);
    try {
      const res = await fetch("/api/tax/harvesting");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setHarvestLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchHarvesting();
  }, [fetchHarvesting]);

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
      // Silent fail for export
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.journal} />
      <PaywallBanner minTier="trader" featureName="Tax Center" description="Realized gains + harvesting candidates merged from manual + engine trades." />
      <PageIntro
        eyebrow="Record"
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
          { label: "Net Gain", value: summary ? formatCurrency(summary.netGain) : "--", tone: summary ? (summary.netGain >= 0 ? "bullish" : "bearish") : "neutral" },
          { label: "Estimated Tax", value: summary ? formatCurrency(summary.estimatedTax) : "--" },
          { label: "Total Trades", value: summary ? String(summary.tradeCount) : "--" },
          { label: "Harvest Opps", value: String(suggestions.length), tone: suggestions.length > 0 ? "bullish" : "neutral" },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Short-Term Gains
                </p>
                <p className="text-xl font-bold text-bullish mt-1">
                  {formatCurrency(summary.shortTermGains)}
                </p>
                <p className="text-xs text-text-muted mt-1">22% tax rate</p>
              </div>
              <div className="p-2 rounded-lg bg-bullish/10">
                <TrendingUp className="w-4 h-4 text-bullish" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Long-Term Gains
                </p>
                <p className="text-xl font-bold text-bullish mt-1">
                  {formatCurrency(summary.longTermGains)}
                </p>
                <p className="text-xs text-text-muted mt-1">15% tax rate</p>
              </div>
              <div className="p-2 rounded-lg bg-bullish/10">
                <TrendingUp className="w-4 h-4 text-bullish" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Total Losses
                </p>
                <p className="text-xl font-bold text-bearish mt-1">
                  {formatCurrency(summary.shortTermLosses + summary.longTermLosses)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {summary.tradeCount} trades
                </p>
              </div>
              <div className="p-2 rounded-lg bg-bearish/10">
                <TrendingDown className="w-4 h-4 text-bearish" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Estimated Tax
                </p>
                <p className="text-xl font-bold text-warning mt-1">
                  {formatCurrency(summary.estimatedTax)}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Net: {formatCurrency(summary.netGain)}
                </p>
                <Link
                  href="/dashboard/education/guides/quarterly-estimated-taxes-for-traders"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                >
                  <BookOpen className="w-3 h-3" />
                  Owe quarterly?
                </Link>
              </div>
              <div className="p-2 rounded-lg bg-warning/10">
                <DollarSign className="w-4 h-4 text-warning" />
              </div>
            </div>
          </Card>
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
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-text-secondary">Gains</span>
                <span className="text-sm font-medium text-bullish">
                  +{formatCurrency(summary.shortTermGains)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-text-secondary">Losses</span>
                <span className="text-sm font-medium text-bearish">
                  -{formatCurrency(summary.shortTermLosses)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-text-primary">Net</span>
                <span
                  className={`text-sm font-bold ${
                    summary.shortTermGains - summary.shortTermLosses >= 0
                      ? "text-bullish"
                      : "text-bearish"
                  }`}
                >
                  {formatCurrency(summary.shortTermGains - summary.shortTermLosses)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text-secondary">
                Long-Term (held &gt; 1 year)
              </h4>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-text-secondary">Gains</span>
                <span className="text-sm font-medium text-bullish">
                  +{formatCurrency(summary.longTermGains)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-text-secondary">Losses</span>
                <span className="text-sm font-medium text-bearish">
                  -{formatCurrency(summary.longTermLosses)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-text-primary">Net</span>
                <span
                  className={`text-sm font-bold ${
                    summary.longTermGains - summary.longTermLosses >= 0
                      ? "text-bullish"
                      : "text-bearish"
                  }`}
                >
                  {formatCurrency(summary.longTermGains - summary.longTermLosses)}
                </span>
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

        {harvestLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" rounded="lg" />
            ))}
          </div>
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
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-bg-elevated border border-border"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="bearish">{s.symbol}</Badge>
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
                    <p className="text-sm font-semibold text-bearish">
                      -{formatCurrency(s.currentLoss)}
                    </p>
                    <p className="text-xs text-bullish">
                      Save ~{formatCurrency(s.potentialSavings)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Wash sale until {s.washSaleDate}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <p className="text-xs text-text-muted mt-2">
              * Tax-loss harvesting involves selling securities at a loss to offset
              capital gains. The wash-sale rule prevents repurchasing the same
              security within 30 days.{" "}
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

// ─── Personalized Education Footer ──────────────────────────────────────

interface EducationLink {
  href: string;
  title: string;
  blurb: string;
  /** Higher score = more prominent (sorted desc). */
  score: number;
  icon: typeof BookOpen;
}

function PersonalizedTaxEducation({
  summary,
  suggestionsCount,
}: {
  summary: TaxSummary | null;
  suggestionsCount: number;
}) {
  // Score education links based on user state. Each adds its baseline score
  // plus context-specific bumps; we surface the top 4.
  const links: EducationLink[] = [];

  // Wash sale guide — bumped if user has any harvesting opportunities (most
  // common reason wash sales become relevant).
  links.push({
    href: "/dashboard/education/guides/wash-sale-rules-deep-dive",
    title: "Wash Sale Rules: A Deep Dive",
    blurb: suggestionsCount > 0
      ? `You have ${suggestionsCount} harvesting candidate${suggestionsCount === 1 ? "" : "s"} — read this BEFORE selling`
      : "Cross-account traps, IRA disasters, ETF swap pairs that work",
    score: 50 + (suggestionsCount > 0 ? 30 : 0),
    icon: BookOpen,
  });

  // TLH calculator — directly actionable when there are opportunities
  links.push({
    href: "/dashboard/education#calculators",
    title: "Tax-Loss Harvesting Calculator",
    blurb: suggestionsCount > 0
      ? "Estimate this year's tax savings from your harvestable losses"
      : "Run hypothetical numbers — no opportunities yet",
    score: 40 + (suggestionsCount > 0 ? 25 : 0),
    icon: DollarSign,
  });

  // MTM guide — bumped for users who appear to be active traders (proxied by
  // high trade count or substantial short-term gains)
  const looksLikeActiveTrader =
    !!summary &&
    (summary.tradeCount > 50 || summary.shortTermGains > 50_000);
  links.push({
    href: "/dashboard/education/guides/trader-tax-status-and-mtm-election",
    title: "Trader Tax Status & §475(f) MTM",
    blurb: looksLikeActiveTrader
      ? "You look like an active trader — MTM election may apply"
      : "Who qualifies, what it does, and the irreversible commitment",
    score: 30 + (looksLikeActiveTrader ? 35 : 0),
    icon: BookOpen,
  });

  // Quarterly estimates — bumped when estimated tax > $1,000 (the trigger
  // threshold per IRS rules)
  const owesEstimates = !!summary && summary.estimatedTax > 1_000;
  links.push({
    href: "/dashboard/education/guides/quarterly-estimated-taxes-for-traders",
    title: "Quarterly Estimated Taxes",
    blurb: owesEstimates
      ? `Estimated tax: ${formatCurrency(summary.estimatedTax)} — you likely owe quarterly`
      : "Safe harbors, deadlines, and the withholding hack",
    score: 25 + (owesEstimates ? 35 : 0),
    icon: BookOpen,
  });

  // Asset location — bumped when there are mixed gain/loss patterns
  const hasMixedGains =
    !!summary && summary.shortTermGains > 0 && summary.longTermGains > 0;
  links.push({
    href: "/dashboard/education/guides/asset-location-strategy",
    title: "Asset Location Strategy",
    blurb: hasMixedGains
      ? "Mixed S/T and L/T gains — placing assets in the right account saves 30-100 bps/yr"
      : "Putting the right asset in the right account",
    score: 20 + (hasMixedGains ? 15 : 0),
    icon: BookOpen,
  });

  // Estate planning — always present at low priority
  links.push({
    href: "/dashboard/education/guides/estate-planning-basics",
    title: "Estate Planning Basics",
    blurb: "Wills, beneficiary designations, the step-up trick",
    score: 10,
    icon: BookOpen,
  });

  links.sort((a, b) => b.score - a.score);
  const top = links.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          Tax Education
        </CardTitle>
        <span className="text-[11px] text-text-muted">
          Personalized to your data
        </span>
      </CardHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {top.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated p-3 hover:border-border-hover transition-colors"
            >
              <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {link.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{link.blurb}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
