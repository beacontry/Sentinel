// /tools — public calculator hub. Lists all 8 calculators and links
// to per-calculator pages. Each individual /tools/[slug] page renders
// the same component used inside the dashboard, just inside the
// public shell. Pure client-side math, no API calls, fully static.

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Coins,
  GraduationCap,
  PiggyBank,
  Shield,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";

export const metadata: Metadata = {
  title: "Free Trader Calculators — 8 Tools for Tax, Retirement & Risk | Beacontry",
  description: "Free financial calculators for active traders: compound interest, FIRE number, quarterly tax estimator, Roth vs Traditional, tax-loss harvesting, employer match, college funding, term vs whole life.",
  openGraph: {
    title: "Free Trader Calculators",
    description: "8 financial calculators for active traders and investors.",
    url: "https://beacontry.com/tools",
    siteName: "Beacontry",
  },
  alternates: { canonical: "https://beacontry.com/tools" },
};

const TOOLS = [
  {
    slug: "compound-interest",
    name: "Compound Interest",
    desc: "Project the future value of a single investment compounding over time. Toggle annual / monthly / daily compounding.",
    icon: TrendingUp,
    category: "Wealth",
  },
  {
    slug: "fire-number",
    name: "FIRE Number",
    desc: "Calculate your Financial Independence number using the 4% rule. Plus the years-to-FIRE based on your current savings rate.",
    icon: PiggyBank,
    category: "Retirement",
  },
  {
    slug: "roth-vs-traditional",
    name: "Roth vs Traditional",
    desc: "Compare Roth and Traditional retirement accounts under different tax-rate assumptions for now and retirement.",
    icon: Coins,
    category: "Retirement",
  },
  {
    slug: "employer-match",
    name: "Employer Match Optimizer",
    desc: "Find your sweet spot — the contribution % that captures the full employer match without leaving free money on the table.",
    icon: Wallet,
    category: "Retirement",
  },
  {
    slug: "quarterly-tax-estimator",
    name: "Quarterly Tax Estimator",
    desc: "For trader-tax-status active traders. Calculates required Q1-Q4 estimated tax payments based on YTD trading gains.",
    icon: Receipt,
    category: "Tax",
  },
  {
    slug: "tax-loss-harvesting",
    name: "Tax-Loss Harvesting",
    desc: "Model the after-tax benefit of realizing losses to offset gains. Wash-sale rule timing built in.",
    icon: Receipt,
    category: "Tax",
  },
  {
    slug: "college-funding",
    name: "College Funding Compare",
    desc: "Side-by-side: 529 plan vs taxable brokerage vs Roth IRA for funding college, accounting for tax treatment.",
    icon: GraduationCap,
    category: "Education",
  },
  {
    slug: "term-vs-whole-life",
    name: "Term vs Whole Life",
    desc: "Compare buying term life + investing the difference vs buying whole life. 30-year projection.",
    icon: Shield,
    category: "Insurance",
  },
];

export default function PublicToolsPage() {
  return (
    <PublicShell active="tools">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 mb-5">
          <Calculator className="h-4 w-4 text-ld-accent" />
          <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">
            Free tools
          </span>
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tighter mb-4">
          Calculators for traders &amp; investors
        </h1>
        <p className="mx-auto max-w-[680px] text-lg leading-relaxed text-ld-text-secondary">
          8 free calculators covering retirement, taxes, college funding, insurance, and
          long-term wealth. All client-side — your numbers never leave your browser.
        </p>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group flex flex-col rounded-2xl border border-ld-border bg-ld-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-ld-accent/30 hover:bg-ld-card-hover hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-ld-accent/[0.16] text-ld-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ld-text-muted">
                  {tool.category}
                </span>
              </div>
              <h3 className="text-lg font-bold leading-tight mb-2 group-hover:text-ld-accent transition-colors">
                {tool.name}
              </h3>
              <p className="text-[0.9rem] leading-relaxed text-ld-text-secondary mb-4 flex-1">
                {tool.desc}
              </p>
              <span className="inline-flex items-center gap-1 text-[0.85rem] text-ld-accent group-hover:gap-2 transition-all">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>

      {/* Sign-up CTA */}
      <section className="mt-16 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">More tools when you sign up</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Beacontry users get backtest, risk simulator, portfolio aggregator, and
          drawdown analysis — plus the full education hub.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-[10px] bg-ld-accent px-6 py-3 text-[0.94rem] font-semibold text-white hover:-translate-y-0.5 hover:bg-ld-accent-dim hover:shadow-[0_10px_34px_rgba(16,185,129,0.16)] transition-all"
        >
          Sign up free
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </PublicShell>
  );
}
