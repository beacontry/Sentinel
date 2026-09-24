import Link from "next/link";
import { BookOpen, DollarSign } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, type TaxSummary } from "./tax-format";

/**
 * The Tax Center's education footer: guides ranked by what the user's own
 * numbers make relevant. Split out of the Tax Center page, which keeps
 * the report and harvesting data.
 */

interface EducationLink {
  href: string;
  title: string;
  blurb: string;
  /** Higher score = more prominent (sorted desc). */
  score: number;
  icon: typeof BookOpen;
}

export function PersonalizedTaxEducation({
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
          <BookOpen className="w-4 h-4 text-accent" aria-hidden="true" />
          Tax Education
        </CardTitle>
        <span className="text-xs text-text-muted">
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
              className="flex min-h-11 items-start gap-3 rounded-lg bg-bg-surface p-3 transition-colors hover:bg-bg-hover"
            >
              <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
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
