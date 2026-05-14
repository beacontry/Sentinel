// /tools/[slug] — public route for an individual calculator.
//
// Dynamic-but-static-renderable: generateStaticParams pre-bakes one
// HTML page per calculator at build time. Each page mounts the
// existing calculator component (zero rewrite — same React component
// used inside /dashboard/education) inside the public shell.
//
// All calculators are pure client-side math. No DB, no API, no PII —
// the user's numbers never leave their browser.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";

// Import each calculator component. Each is fully self-contained
// (own state, own UI, own math). PublicShell just wraps the component
// with the navbar + footer.
import { CompoundInterestCalculator } from "@/components/education/calculators/compound-interest";
import { FireNumberCalculator } from "@/components/education/calculators/fire-number";
import { RothVsTraditionalCalculator } from "@/components/education/calculators/roth-vs-traditional";
import { EmployerMatchOptimizerCalculator } from "@/components/education/calculators/employer-match-optimizer";
import { QuarterlyTaxEstimatorCalculator } from "@/components/education/calculators/quarterly-tax-estimator";
import { TaxLossHarvestingCalculator } from "@/components/education/calculators/tax-loss-harvesting";
import { CollegeFundingCompareCalculator } from "@/components/education/calculators/college-funding-compare";
import { TermVsWholeLifeCalculator } from "@/components/education/calculators/term-vs-whole-life";

// Single source of truth for the calculator map. Slug → metadata +
// React component. Keep in sync with /tools/page.tsx (the listing
// page reads metadata from a parallel array there; the slugs MUST
// match for the cards on /tools to route here correctly).
const CALCULATORS: Record<
  string,
  { name: string; desc: string; component: React.ComponentType }
> = {
  "compound-interest": {
    name: "Compound Interest Calculator",
    desc: "Project the future value of a single investment compounding over time. Toggle annual / monthly / daily compounding.",
    component: CompoundInterestCalculator,
  },
  "fire-number": {
    name: "FIRE Number Calculator",
    desc: "Calculate your Financial Independence number using the 4% rule. See years-to-FIRE at your current savings rate.",
    component: FireNumberCalculator,
  },
  "roth-vs-traditional": {
    name: "Roth vs Traditional Calculator",
    desc: "Compare Roth and Traditional retirement accounts under different tax-rate assumptions for now vs retirement.",
    component: RothVsTraditionalCalculator,
  },
  "employer-match": {
    name: "Employer Match Optimizer",
    desc: "Find the contribution percentage that captures your full employer 401(k) match without leaving money on the table.",
    component: EmployerMatchOptimizerCalculator,
  },
  "quarterly-tax-estimator": {
    name: "Quarterly Tax Estimator",
    desc: "For trader-tax-status active traders. Calculates required Q1–Q4 estimated tax payments based on YTD trading gains.",
    component: QuarterlyTaxEstimatorCalculator,
  },
  "tax-loss-harvesting": {
    name: "Tax-Loss Harvesting Calculator",
    desc: "Model the after-tax benefit of realizing losses to offset gains. Wash-sale rule timing built in.",
    component: TaxLossHarvestingCalculator,
  },
  "college-funding": {
    name: "College Funding Compare",
    desc: "Side-by-side: 529 plan vs taxable brokerage vs Roth IRA for funding college, accounting for tax treatment.",
    component: CollegeFundingCompareCalculator,
  },
  "term-vs-whole-life": {
    name: "Term vs Whole Life Calculator",
    desc: "Compare buying term life + investing the difference vs buying whole life. 30-year side-by-side projection.",
    component: TermVsWholeLifeCalculator,
  },
};

export function generateStaticParams() {
  return Object.keys(CALCULATORS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const calc = CALCULATORS[slug];
  if (!calc) return { title: "Tool not found — Beacontry" };
  const url = `https://beacontry.com/tools/${slug}`;
  return {
    title: `${calc.name} — Beacontry`,
    description: calc.desc,
    openGraph: {
      title: calc.name,
      description: calc.desc,
      url,
      siteName: "Beacontry",
    },
    alternates: { canonical: url },
  };
}

export default async function PublicCalculatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const calc = CALCULATORS[slug];
  if (!calc) notFound();
  const Calc = calc.component;

  return (
    <PublicShell active="tools">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-ld-text-muted hover:text-ld-accent transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        All tools
      </Link>

      <header className="space-y-3 max-w-3xl mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ld-text">
          {calc.name}
        </h1>
        <p className="text-base leading-relaxed text-ld-text-secondary">
          {calc.desc}
        </p>
        <p className="text-[0.8rem] text-ld-text-muted">
          All math runs in your browser. Your numbers are never sent to a server.
        </p>
      </header>

      {/* Mount the actual calculator component inside the public shell */}
      <div className="max-w-3xl">
        <Calc />
      </div>

      {/* Sign-up CTA */}
      <section className="mt-12 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center max-w-3xl">
        <h2 className="text-xl font-bold mb-2">More tools when you sign up</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Beacontry users get backtest, risk simulator, portfolio aggregator, and
          drawdown analysis — plus the full education hub.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim transition-all"
        >
          Sign up free
        </Link>
      </section>
    </PublicShell>
  );
}
