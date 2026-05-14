"use client";

// /learn — public education hub. SEO surface for guides on trader
// taxes, retirement accounts, options, risk, etc. Anonymous traffic
// gets the full guide content; authenticated users see the same
// catalog inside /dashboard/education with progress tracking layered
// on top. Both routes render content from the same TS data source
// (src/lib/education/guides-data.ts) so they never drift.
//
// No DB calls, no per-request API spend — fully static-renderable
// (Next.js will SSG these by default given there's no data fetching).

import Link from "next/link";
import { useMemo, useState } from "react";
import { PublicShell } from "@/components/layout/public-shell";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Clock,
  GraduationCap,
} from "lucide-react";
import {
  GUIDES,
  TOPIC_META,
  type GuideTopic,
  type GuideDifficulty,
} from "@/lib/education/guides-data";

const TOPIC_TABS: { id: "all" | GuideTopic; label: string }[] = [
  { id: "all", label: "All" },
  { id: "retirement", label: "Retirement" },
  { id: "education-funding", label: "Education" },
  { id: "insurance", label: "Insurance" },
  { id: "tax", label: "Tax" },
  { id: "estate", label: "Estate" },
];

const DIFFICULTY_COLOR: Record<GuideDifficulty, string> = {
  intro: "bg-ld-green/10 text-ld-green border-ld-green/30",
  intermediate: "bg-ld-amber/10 text-ld-amber border-ld-amber/30",
  advanced: "bg-bearish/10 text-bearish border-bearish/30",
};

export default function PublicLearnPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | GuideTopic>("all");

  const filtered = useMemo(() => {
    let g = GUIDES;
    if (activeTab !== "all") g = g.filter((x) => x.topic === activeTab);
    const q = search.trim().toLowerCase();
    if (q) {
      g = g.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.summary.toLowerCase().includes(q)
      );
    }
    return g;
  }, [search, activeTab]);

  return (
    <PublicShell active="learn">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-ld-accent/22 bg-ld-accent/10 px-4 py-1.5 mb-5">
          <GraduationCap className="h-4 w-4 text-ld-accent" />
          <span className="font-mono text-xs uppercase tracking-wider text-ld-accent">Free trader education</span>
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.05] tracking-tighter mb-4">
          Learn how to actually trade.
        </h1>
        <p className="mx-auto max-w-[680px] text-lg leading-relaxed text-ld-text-secondary">
          {GUIDES.length} long-form guides on retirement, taxes, options, and risk —
          written for active traders, not casual savers. Plus a glossary, calculators,
          and quizzes to test what you learned.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/glossary"
            className="inline-flex items-center gap-2 rounded-[10px] border border-ld-border px-4 py-2 text-[0.92rem] font-medium text-ld-text hover:border-ld-accent hover:bg-ld-accent/[0.06] transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Glossary (95 terms)
          </Link>
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 rounded-[10px] border border-ld-border px-4 py-2 text-[0.92rem] font-medium text-ld-text hover:border-ld-accent hover:bg-ld-accent/[0.06] transition-colors"
          >
            <Calculator className="h-4 w-4" />
            Calculators (8 tools)
          </Link>
        </div>
      </section>

      {/* Filters */}
      <div className="mb-8 space-y-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guides…"
          className="w-full rounded-lg border border-ld-border bg-ld-card px-4 py-2.5 text-[0.94rem] text-ld-text placeholder:text-ld-text-muted focus:border-ld-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {TOPIC_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-ld-accent text-white"
                  : "border border-ld-border bg-ld-card text-ld-text-secondary hover:border-ld-accent/40 hover:text-ld-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guide grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-ld-text-muted">
          No guides match your search. Try a different term or clear filters.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((guide) => (
            <Link
              key={guide.slug}
              href={`/learn/guides/${guide.slug}`}
              className="group block rounded-2xl border border-ld-border bg-ld-card p-6 transition-all duration-200 hover:-translate-y-1 hover:border-ld-accent/30 hover:bg-ld-card-hover hover:shadow-[0_22px_60px_rgba(0,0,0,0.32)]"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ld-accent">
                  {TOPIC_META[guide.topic].label}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${DIFFICULTY_COLOR[guide.difficulty]}`}>
                  {guide.difficulty}
                </span>
              </div>

              <h3 className="text-lg font-bold leading-tight mb-2 group-hover:text-ld-accent transition-colors">
                {guide.title}
              </h3>
              <p className="text-[0.9rem] leading-relaxed text-ld-text-secondary line-clamp-3 mb-4">
                {guide.summary}
              </p>

              <div className="flex items-center justify-between text-[0.78rem] text-ld-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {guide.readingMinutes} min read
                </span>
                <span className="inline-flex items-center gap-1 text-ld-accent group-hover:gap-2 transition-all">
                  Read <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Sign-up CTA */}
      <section className="mt-16 rounded-2xl border border-ld-accent/30 bg-ld-accent/[0.06] p-8 text-center">
        <h2 className="text-xl font-bold mb-2">Want to track your progress?</h2>
        <p className="text-ld-text-secondary mb-5 max-w-[520px] mx-auto">
          Sign up free to save guides as bookmarks, take quizzes, and use spaced
          repetition to actually remember what you read.
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
