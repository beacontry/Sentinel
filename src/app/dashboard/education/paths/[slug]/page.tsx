"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { useEducationProgress } from "@/hooks/use-education-progress";
import {
  getPathBySlug,
  getPathProgress,
  getPathReadingMinutes,
  type PathDifficulty,
} from "@/lib/education/learning-paths-data";
import {
  GUIDES,
  TOPIC_META,
  type Guide,
  type GuideDifficulty,
} from "@/lib/education/guides-data";

const ICONS: Record<string, LucideIcon> = {
  Receipt,
  PiggyBank,
  Zap,
  GraduationCap,
  Layers,
};

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Layers;
}

const PATH_DIFFICULTY_VARIANT: Record<
  PathDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  beginner: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

const GUIDE_DIFFICULTY_VARIANT: Record<
  GuideDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  intro: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

export default function PathDetailPage() {
  const params = useParams<{ slug: string }>();
  const path = useMemo(() => getPathBySlug(params.slug), [params.slug]);
  const { progress } = useEducationProgress();

  const progressBySlug = useMemo(() => {
    const m = new Map<
      string,
      { viewed: boolean; quizPassed: boolean }
    >();
    for (const p of progress) {
      m.set(p.slug, {
        viewed: p.viewCount > 0,
        quizPassed: p.quizPassedAt !== null,
      });
    }
    return m;
  }, [progress]);

  if (!path) {
    return (
      <div className="p-4 lg:p-6 space-y-4">
        <EmptyState
          icon={<GraduationCap className="w-7 h-7" />}
          title="Path not found"
          description="That learning path doesn't exist or has been renamed."
        />
        <div className="text-center">
          <Link
            href="/dashboard/education/paths"
            className="text-sm text-accent hover:underline"
          >
            ← Back to all paths
          </Link>
        </div>
      </div>
    );
  }

  const Icon = iconFor(path.icon);
  const readingMinutes = getPathReadingMinutes(path);
  const state = getPathProgress(path, progressBySlug);
  const isComplete = state.fraction >= 1;

  // Resolve guides in order; carry index for the "1 / N" badge.
  const guides = path.guideSlugs
    .map((slug, idx) => {
      const guide = GUIDES.find((g) => g.slug === slug);
      return guide ? { guide, idx } : null;
    })
    .filter((x): x is { guide: Guide; idx: number } => x !== null);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <Link
        href="/dashboard/education/paths"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All paths
      </Link>

      <PageIntro
        eyebrow="Education / Paths"
        title={path.title}
        description={path.description}
        actions={
          state.nextSlug ? (
            <Link href={`/dashboard/education/guides/${state.nextSlug}`}>
              <Button variant="primary" size="md">
                {state.viewed === 0 ? "Start path" : "Continue"}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
          ) : isComplete ? (
            <Badge variant="bullish">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Complete
            </Badge>
          ) : null
        }
        stats={[
          { label: "Guides", value: String(path.guideSlugs.length) },
          { label: "Reading time", value: `${readingMinutes} min` },
          {
            label: "Progress",
            value: `${Math.round(state.fraction * 100)}%`,
            tone: state.fraction > 0 ? "brand" : "neutral",
          },
          {
            label: "Quizzes passed",
            value: `${state.quizPassed} / ${state.total}`,
            tone: state.quizPassed > 0 ? "bullish" : "neutral",
          },
        ]}
      />

      <EducationalDisclaimer />

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-accent/10 p-2 shrink-0">
          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
        </div>
        <Badge variant={PATH_DIFFICULTY_VARIANT[path.difficulty]}>
          {path.difficulty}
        </Badge>
      </div>

      {path.prerequisites && path.prerequisites.length > 0 && (
        <Card>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-primary">
              Recommended before this path
            </h3>
            <div className="flex flex-wrap gap-2">
              {path.prerequisites.map((preSlug) => {
                const pre = getPathBySlug(preSlug);
                if (!pre) return null;
                return (
                  <Link
                    key={preSlug}
                    href={`/dashboard/education/paths/${preSlug}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/40 hover:text-accent transition-colors"
                  >
                    {pre.title}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Guides</h2>
        <div className="space-y-2">
          {guides.map(({ guide, idx }) => {
            const p = progressBySlug.get(guide.slug);
            const passed = p?.quizPassed ?? false;
            const viewed = p?.viewed ?? false;
            return (
              <Link
                key={guide.slug}
                href={`/dashboard/education/guides/${guide.slug}`}
                className="group block"
              >
                <Card hover className="flex items-start gap-4">
                  <div className="flex flex-col items-center shrink-0">
                    {passed ? (
                      <Trophy
                        className="h-5 w-5 text-bullish"
                        aria-label="Quiz passed"
                      />
                    ) : viewed ? (
                      <CheckCircle2
                        className="h-5 w-5 text-accent"
                        aria-label="Viewed"
                      />
                    ) : (
                      <Circle
                        className="h-5 w-5 text-text-muted"
                        aria-label="Not started"
                      />
                    )}
                    <span className="mt-1 text-[11px] font-mono text-text-muted">
                      {idx + 1}/{guides.length}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="accent">
                        {TOPIC_META[guide.topic].label}
                      </Badge>
                      <Badge
                        variant={GUIDE_DIFFICULTY_VARIANT[guide.difficulty]}
                      >
                        {guide.difficulty}
                      </Badge>
                    </div>
                    <h3 className="text-base font-semibold text-text-primary leading-snug">
                      {guide.title}
                    </h3>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {guide.summary}
                    </p>
                    <div className="pt-1 flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {guide.readingMinutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        {guide.sections.length} sections
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors shrink-0 mt-1" />
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
