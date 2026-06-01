"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowRight,
  BookmarkCheck,
  BookMarked,
  Brain,
  Calculator as CalculatorIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  Layers,
  PiggyBank,
  Receipt,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
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
import { CompoundInterestCalculator } from "@/components/education/calculators/compound-interest";
import { FireNumberCalculator } from "@/components/education/calculators/fire-number";
import { QuarterlyTaxEstimatorCalculator } from "@/components/education/calculators/quarterly-tax-estimator";
import { GLOSSARY_TERMS, type GlossaryCategory } from "@/lib/glossary-data";
import {
  GUIDES,
  TOPIC_META,
  type GuideDifficulty,
} from "@/lib/education/guides-data";
import {
  PATHS,
  getPathProgress,
  getPathReadingMinutes,
  type LearningPath,
  type PathDifficulty,
} from "@/lib/education/learning-paths-data";

// ─── Top-level hub tabs ───────────────────────────────────────────────────

const HUB_TABS = [
  { id: "paths", label: "Paths" },
  { id: "glossary", label: "Glossary" },
  { id: "guides", label: "Guides" },
  { id: "calculators", label: "Calculators" },
];

// Path icon registry — paths declare icons by string so the data file
// stays serializable; we resolve to real Lucide components here.
const PATH_ICONS: Record<string, LucideIcon> = {
  Receipt,
  PiggyBank,
  Zap,
  GraduationCap,
  Layers,
};

function pathIconFor(name: string): LucideIcon {
  return PATH_ICONS[name] ?? Layers;
}

const PATH_DIFFICULTY_VARIANT: Record<
  PathDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  beginner: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

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
  const [hubTab, setHubTab] = useState("paths");
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

      {/* ─── Paths ─────────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "paths"}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary max-w-2xl">
              Curated, ordered guide sequences. Each path walks a topic from
              foundations to applied detail. Progress carries over from
              individual guides.
            </p>
            <Link
              href="/dashboard/education/paths"
              className="text-sm text-accent hover:underline whitespace-nowrap"
            >
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PATHS.map((path) => (
              <PathTabCard
                key={path.slug}
                path={path}
                progressBySlug={progressBySlug}
              />
            ))}
          </div>
        </div>
      </TabPanel>

      {/* ─── Glossary ──────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "glossary"}>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <SearchInput
              onSearch={setGlossarySearch}
              placeholder="Search terms, definitions..."
            />
            <Link
              href="/dashboard/education/review"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs font-medium text-text-secondary hover:border-accent/40 hover:text-accent transition-colors whitespace-nowrap"
            >
              <Brain className="h-3.5 w-3.5" />
              Spaced Review
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
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

      {/* ─── Calculators ──────────────────────────────────────────────
       *
       * Previously all calculators rendered always-expanded in a long
       * stack — fine when there were 2-3, awkward at 8. Replaced with a
       * click-to-expand accordion (one open at a time) so the user can:
       *   1. See every calculator's existence at a glance (browse beats
       *      search for a small fixed catalog)
       *   2. Open the one they want without scrolling past 7 others
       *   3. Switch quickly between them
       *
       * Also adds the 3 calculators that already existed on disk but
       * weren't imported (compound-interest, fire-number,
       * quarterly-tax-estimator). All 8 from CLAUDE.md now present.
       * ────────────────────────────────────────────────────────────── */}
      <TabPanel active={hubTab === "calculators"}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <CalculatorIcon className="h-5 w-5 text-accent" aria-hidden="true" />
            <p className="text-sm text-text-secondary max-w-2xl">
              Run your own numbers. All assumptions are editable; outputs are
              illustrative only. Click any calculator below to open it.
            </p>
          </div>

          <CalculatorAccordion items={CALCULATOR_REGISTRY} />
        </div>
      </TabPanel>
    </div>
  );
}

// ─── Calculator accordion ───────────────────────────────────────────────────

interface CalculatorRegistryEntry {
  id: string;
  title: string;
  description: string;
  Component: () => React.ReactNode;
}

const CALCULATOR_REGISTRY: CalculatorRegistryEntry[] = [
  {
    id: "employer-match",
    title: "Employer 401(k) match optimizer",
    description: "Make sure you're capturing every dollar of the company match.",
    Component: EmployerMatchOptimizerCalculator,
  },
  {
    id: "roth-vs-traditional",
    title: "Roth vs Traditional IRA",
    description: "Pay tax now or later — depends on your bracket trajectory.",
    Component: RothVsTraditionalCalculator,
  },
  {
    id: "compound-interest",
    title: "Compound interest",
    description: "What $X/month grows to over Y years at Z% return.",
    Component: CompoundInterestCalculator,
  },
  {
    id: "fire-number",
    title: "FIRE number",
    description: "How much you need to retire — and when you'll get there.",
    Component: FireNumberCalculator,
  },
  {
    id: "college-funding",
    title: "College funding compare",
    description: "529 vs UTMA vs taxable for your specific timeline.",
    Component: CollegeFundingCompareCalculator,
  },
  {
    id: "term-vs-whole-life",
    title: "Term vs whole life insurance",
    description: "Honest math on the buy-term-and-invest-the-difference debate.",
    Component: TermVsWholeLifeCalculator,
  },
  {
    id: "tax-loss-harvesting",
    title: "Tax loss harvesting",
    description: "What that realized loss is actually worth against ordinary income.",
    Component: TaxLossHarvestingCalculator,
  },
  {
    id: "quarterly-tax",
    title: "Quarterly tax estimator",
    description: "1040-ES estimate for trading gains and self-employment.",
    Component: QuarterlyTaxEstimatorCalculator,
  },
];

// ─── Path tab card ─────────────────────────────────────────────────────────

interface PathTabCardProps {
  path: LearningPath;
  progressBySlug: Map<
    string,
    { viewed: boolean; bookmarked: boolean; quizPassed: boolean }
  >;
}

function PathTabCard({ path, progressBySlug }: PathTabCardProps) {
  const Icon = pathIconFor(path.icon);
  const readingMinutes = getPathReadingMinutes(path);
  const state = getPathProgress(path, progressBySlug);
  const isComplete = state.fraction >= 1;
  const totalGuides = path.guideSlugs.length;
  const pct = Math.round(state.fraction * 100);

  return (
    <Link href={`/dashboard/education/paths/${path.slug}`} className="group">
      <Card hover className="h-full flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={PATH_DIFFICULTY_VARIANT[path.difficulty]}>
                {path.difficulty}
              </Badge>
              {isComplete && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-bullish"
                  title="Path complete"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complete
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-text-primary leading-snug">
              {path.title}
            </h3>
          </div>
          <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors shrink-0 mt-1" />
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">
          {path.tagline}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">
              {state.viewed} / {totalGuides} viewed
              {state.quizPassed > 0 && (
                <span className="text-bullish"> · {state.quizPassed} passed</span>
              )}
            </span>
            <span className="font-mono text-text-secondary">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="mt-auto pt-1 flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {totalGuides} {totalGuides === 1 ? "guide" : "guides"}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {readingMinutes} min
          </span>
        </div>
      </Card>
    </Link>
  );
}

function CalculatorAccordion({ items }: { items: CalculatorRegistryEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-bg-secondary overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-hover transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <CalculatorIcon className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-text-primary truncate">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-0.5 ml-[26px] text-xs text-text-muted truncate">
                  {item.description}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-text-muted shrink-0 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-border p-4">
                <item.Component />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
