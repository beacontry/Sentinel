"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookmarkCheck,
  BookMarked,
  Check,
  Clock,
  GraduationCap,
  Trophy,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { useEducationProgress } from "@/hooks/use-education-progress";
import {
  GUIDES,
  TOPIC_META,
  type GuideTopic,
  type GuideDifficulty,
} from "@/lib/education/guides-data";

const TOPIC_TABS: { id: "all" | GuideTopic; label: string }[] = [
  { id: "all", label: "All" },
  { id: "retirement", label: "Retirement" },
  { id: "education-funding", label: "Education Funding" },
  { id: "insurance", label: "Insurance" },
  { id: "tax", label: "Tax" },
  { id: "estate", label: "Estate" },
];

const DIFFICULTY_VARIANT: Record<
  GuideDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  intro: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

export default function EducationGuidesIndex() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | GuideTopic>("all");
  const { progress, readCount, bookmarkCount, passedQuizCount } =
    useEducationProgress();

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

  const filtered = useMemo(() => {
    let g = GUIDES;
    if (activeTab !== "all") g = g.filter((x) => x.topic === activeTab);
    const q = search.trim().toLowerCase();
    if (q) {
      g = g.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.summary.toLowerCase().includes(q),
      );
    }
    return g;
  }, [search, activeTab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: GUIDES.length };
    for (const g of GUIDES) c[g.topic] = (c[g.topic] ?? 0) + 1;
    return c;
  }, []);

  const tabs = TOPIC_TABS.map((t) => ({
    id: t.id,
    label: `${t.label} (${counts[t.id] ?? 0})`,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Education / Guides"
        title="Financial Guides"
        description="Long-form, plain-English breakdowns of retirement accounts, education funding, insurance products, and tax strategy. Honest takes — no sales copy."
        stats={[
          { label: "Total Guides", value: String(GUIDES.length) },
          {
            label: "Read",
            value: `${readCount} / ${GUIDES.length}`,
            tone: readCount > 0 ? "brand" : "neutral",
          },
          {
            label: "Quizzes Passed",
            value: `${passedQuizCount} / ${GUIDES.length}`,
            tone: passedQuizCount > 0 ? "bullish" : "neutral",
          },
          {
            label: "Bookmarked",
            value: String(bookmarkCount),
          },
        ]}
      />

      <EducationalDisclaimer />

      <SearchInput
        onSearch={setSearch}
        placeholder="Search guides..."
      />

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as "all" | GuideTopic)}
      />

      {TOPIC_TABS.map((cat) => (
        <TabPanel key={cat.id} active={activeTab === cat.id}>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="w-7 h-7" />}
              title="No guides match"
              description={
                search
                  ? `Nothing found for "${search}".`
                  : "More guides coming soon."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((guide) => {
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
                        <span className="ml-auto">
                          Updated {guide.lastReviewed}
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabPanel>
      ))}
    </div>
  );
}
