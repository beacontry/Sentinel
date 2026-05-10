"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  BookmarkCheck,
  BookMarked,
  Calculator as CalculatorIcon,
  Check,
  Clock,
  GraduationCap,
  Trophy,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { SearchInput } from "@/components/ui/search-input";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GlossaryTermCard } from "@/components/education/glossary-term";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { useEducationProgress } from "@/hooks/use-education-progress";
import { RothVsTraditionalCalculator } from "@/components/education/calculators/roth-vs-traditional";
import { CollegeFundingCompareCalculator } from "@/components/education/calculators/college-funding-compare";
import { TermVsWholeLifeCalculator } from "@/components/education/calculators/term-vs-whole-life";
import { TaxLossHarvestingCalculator } from "@/components/education/calculators/tax-loss-harvesting";
import { EmployerMatchOptimizerCalculator } from "@/components/education/calculators/employer-match-optimizer";
import { GLOSSARY_TERMS, type GlossaryCategory } from "@/lib/glossary-data";
import {
  GUIDES,
  TOPIC_META,
  type GuideDifficulty,
} from "@/lib/education/guides-data";

// ─── Top-level hub tabs ───────────────────────────────────────────────────

const HUB_TABS = [
  { id: "glossary", label: "Glossary" },
  { id: "guides", label: "Guides" },
  { id: "calculators", label: "Calculators" },
];

// ─── Glossary categories ──────────────────────────────────────────────────

const GLOSSARY_CATEGORIES: {
  id: string;
  label: string;
  category: GlossaryCategory | "all";
}[] = [
  { id: "all", label: "All", category: "all" },
  { id: "basics", label: "Basics", category: "basics" },
  { id: "wealth", label: "Wealth", category: "wealth" },
  { id: "technical", label: "Technical", category: "technical" },
  { id: "fundamental", label: "Fundamental", category: "fundamental" },
  { id: "options", label: "Options", category: "options" },
  { id: "risk", label: "Risk", category: "risk" },
];

const DIFFICULTY_VARIANT: Record<
  GuideDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  intro: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

export default function EducationPage() {
  const [hubTab, setHubTab] = useState("glossary");
  const { progress, readCount, passedQuizCount } = useEducationProgress();

  const progressBySlug = useMemo(() => {
    const m = new Map<
      string,
      { viewed: boolean; bookmarked: boolean; quizPassed: boolean }
    >();
    for (const p of progress) {
      m.set(p.slug, {
        viewed: p.viewCount > 0,
        bookmarked: p.bookmarked,
        quizPassed: p.quizPassedAt !== null,
      });
    }
    return m;
  }, [progress]);

  // Glossary state
  const [glossarySearch, setGlossarySearch] = useState("");
  const [glossaryCat, setGlossaryCat] = useState("all");

  const glossaryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: GLOSSARY_TERMS.length };
    for (const term of GLOSSARY_TERMS) {
      counts[term.category] = (counts[term.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const filteredTerms = useMemo(() => {
    let terms = GLOSSARY_TERMS;
    if (glossaryCat !== "all") {
      terms = terms.filter((t) => t.category === glossaryCat);
    }
    const q = glossarySearch.trim().toLowerCase();
    if (q) {
      terms = terms.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q),
      );
    }
    return terms;
  }, [glossarySearch, glossaryCat]);

  const glossaryTabs = GLOSSARY_CATEGORIES.map((c) => ({
    id: c.id,
    label: `${c.label} (${glossaryCounts[c.id] ?? 0})`,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.research} />

      <PageIntro
        eyebrow="Research"
        title="Education"
        description="Trading concept glossary, long-form personal-finance guides, and interactive financial calculators. Built for clarity, not for selling you anything."
        stats={[
          { label: "Glossary Terms", value: String(GLOSSARY_TERMS.length) },
          { label: "Guides", value: String(GUIDES.length) },
          { label: "Guides Read", value: `${readCount} / ${GUIDES.length}`, tone: readCount > 0 ? "brand" : "neutral" },
          { label: "Quizzes Passed", value: `${passedQuizCount} / ${GUIDES.length}`, tone: passedQuizCount > 0 ? "bullish" : "neutral" },
        ]}
      />

      <EducationalDisclaimer />

      {/* Hub-level tabs */}
      <Tabs tabs={HUB_TABS} activeTab={hubTab} onChange={setHubTab} />

      {/* ─── Glossary ──────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "glossary"}>
        <div className="space-y-6">
          <SearchInput
            onSearch={setGlossarySearch}
            placeholder="Search terms, definitions..."
          />
          <Tabs
            tabs={glossaryTabs}
            activeTab={glossaryCat}
            onChange={setGlossaryCat}
          />
          {GLOSSARY_CATEGORIES.map((cat) => (
            <TabPanel key={cat.id} active={glossaryCat === cat.id}>
              {filteredTerms.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="w-10 h-10 text-text-muted mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">
                    No terms found
                    {glossarySearch ? ` matching "${glossarySearch}"` : ""}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredTerms.map((term) => (
                    <GlossaryTermCard
                      key={term.id}
                      term={term.term}
                      definition={term.definition}
                      category={term.category}
                      examples={term.examples}
                    />
                  ))}
                </div>
              )}
            </TabPanel>
          ))}
        </div>
      </TabPanel>

      {/* ─── Guides ────────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "guides"}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary max-w-2xl">
              Long-form, plain-English breakdowns of retirement accounts,
              education funding, insurance, and tax strategy. Honest takes — no
              sales copy.
            </p>
            <Link
              href="/dashboard/education/guides"
              className="text-sm text-accent hover:underline whitespace-nowrap"
            >
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GUIDES.map((guide) => {
              const p = progressBySlug.get(guide.slug);
              return (
                <Link
                  key={guide.slug}
                  href={`/dashboard/education/guides/${guide.slug}`}
                  className="group"
                >
                  <Card hover className="h-full flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="accent">
                          {TOPIC_META[guide.topic].label}
                        </Badge>
                        <Badge variant={DIFFICULTY_VARIANT[guide.difficulty]}>
                          {guide.difficulty}
                        </Badge>
                        {p?.quizPassed && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-bullish"
                            title="Quiz passed"
                          >
                            <Trophy className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {p?.bookmarked && !p?.quizPassed && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-accent"
                            title="Bookmarked"
                          >
                            <BookmarkCheck className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {p?.viewed && !p?.bookmarked && !p?.quizPassed && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-bullish"
                            title="Viewed"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors shrink-0" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-semibold text-text-primary leading-snug">
                        {guide.title}
                      </h3>
                      <p className="text-sm text-text-secondary leading-relaxed">
                        {guide.summary}
                      </p>
                    </div>
                    <div className="mt-auto pt-2 flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {guide.readingMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                        {guide.sections.length} sections
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </TabPanel>

      {/* ─── Calculators ────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "calculators"}>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CalculatorIcon className="h-5 w-5 text-accent" aria-hidden="true" />
            <p className="text-sm text-text-secondary max-w-2xl">
              Run your own numbers. All assumptions are editable; outputs are
              illustrative only.
            </p>
          </div>

          <EmployerMatchOptimizerCalculator />
          <RothVsTraditionalCalculator />
          <CollegeFundingCompareCalculator />
          <TermVsWholeLifeCalculator />
          <TaxLossHarvestingCalculator />
        </div>
      </TabPanel>
    </div>
  );
}
