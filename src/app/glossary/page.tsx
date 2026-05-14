// /glossary — public glossary of 95 trader terms.
//
// SEO-dense single page. Every term has a definition + worked
// examples. Pure static content (sourced from src/lib/glossary-data.ts)
// so this renders identically forever and Google indexes the whole
// page in one shot — ideal for long-tail "what is X" queries.
//
// Companion to /learn (long-form guides) and /tools (calculators).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
import { GLOSSARY_TERMS, type GlossaryCategory } from "@/lib/glossary-data";

const CATEGORIES: { id: GlossaryCategory; label: string; desc: string }[] = [
  { id: "basics", label: "Basics", desc: "Foundational concepts every trader should know" },
  { id: "technical", label: "Technical Analysis", desc: "Indicators, chart patterns, price action" },
  { id: "fundamental", label: "Fundamentals", desc: "Financial metrics, valuation, balance sheets" },
  { id: "options", label: "Options", desc: "Derivatives, Greeks, strategies" },
  { id: "risk", label: "Risk", desc: "Position sizing, stops, exposure management" },
  { id: "wealth", label: "Wealth", desc: "Tax, retirement accounts, long-term planning" },
];

export const metadata: Metadata = {
  title: "Trader Glossary — 95 Terms Explained | Beacontry",
  description: "Plain-English definitions for 95 trader, investor, and finance terms — covering technical analysis, fundamentals, options, risk management, and wealth strategy.",
  openGraph: {
    title: "Trader Glossary — 95 Terms Explained",
    description: "Plain-English definitions for trader, investor, and finance terms across 6 categories.",
    url: "https://beacontry.com/glossary",
    siteName: "Beacontry",
  },
  alternates: {
    canonical: "https://beacontry.com/glossary",
  },
};

export default function PublicGlossaryPage() {
  // Group terms by category so the page reads as a structured reference
  // rather than a flat list of 95 entries.
  const byCategory = new Map<GlossaryCategory, typeof GLOSSARY_TERMS>();
  for (const term of GLOSSARY_TERMS) {
    if (!byCategory.has(term.category)) byCategory.set(term.category, []);
    byCategory.get(term.category)!.push(term);
  }
  // Sort terms alphabetically within each category for predictable scanning.
  for (const arr of byCategory.values()) {
    arr.sort((a, b) => a.term.localeCompare(b.term));
  }

  return (
    <PublicShell active="glossary">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 mb-5">
          <BookOpen className="h-4 w-4 text-ld-accent" />
          <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">Reference</span>
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tighter mb-4">
          Trader Glossary
        </h1>
        <p className="mx-auto max-w-[680px] text-lg leading-relaxed text-ld-text-secondary">
          {GLOSSARY_TERMS.length} terms across {CATEGORIES.length} categories — every entry
          includes worked examples. Updated as trader vocabulary evolves.
        </p>
      </section>

      {/* Quick nav — jump to category */}
      <nav className="mb-12 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((cat) => {
          const count = byCategory.get(cat.id)?.length ?? 0;
          if (count === 0) return null;
          return (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-ld-border bg-ld-card px-3.5 py-1.5 text-[0.85rem] font-medium text-ld-text-secondary hover:border-ld-accent/40 hover:text-ld-text transition-colors"
            >
              {cat.label}
              <span className="font-mono text-[10px] text-ld-text-muted">{count}</span>
            </a>
          );
        })}
      </nav>

      {/* Category sections */}
      <div className="space-y-16 max-w-3xl mx-auto">
        {CATEGORIES.map((cat) => {
          const terms = byCategory.get(cat.id);
          if (!terms || terms.length === 0) return null;
          return (
            <section key={cat.id} id={cat.id}>
              <div className="border-b border-ld-border pb-4 mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-ld-text mb-1">
                  {cat.label}
                </h2>
                <p className="text-[0.94rem] text-ld-text-secondary">{cat.desc}</p>
              </div>

              <dl className="space-y-8">
                {terms.map((term) => (
                  <article
                    key={term.id}
                    id={term.id}
                    className="scroll-mt-24 rounded-xl border border-ld-border bg-ld-card p-6"
                  >
                    <dt className="text-lg font-bold text-ld-text mb-2">
                      <a href={`#${term.id}`} className="hover:text-ld-accent">
                        {term.term}
                      </a>
                    </dt>
                    <dd className="text-[0.94rem] leading-relaxed text-ld-text-secondary">
                      <p className="mb-3">{term.definition}</p>
                      {term.examples.length > 0 && (
                        <div className="mt-4 rounded-lg border border-ld-border bg-ld-deep/40 p-4">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-ld-text-muted mb-2">
                            Examples
                          </p>
                          <ul className="space-y-2 text-[0.88rem]">
                            {term.examples.map((ex, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-ld-accent shrink-0">→</span>
                                <span>{ex}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </dd>
                  </article>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      {/* Sign-up CTA */}
      <section className="mt-16 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Want deeper context for each term?</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Sign up free for the full education hub — {GLOSSARY_TERMS.length} terms with
          spaced-repetition review, plus 14 long-form guides and 8 calculators.
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
