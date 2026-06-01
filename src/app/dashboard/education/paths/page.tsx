"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  PiggyBank,
  Receipt,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageIntro } from "@/components/layout/page-intro";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { useEducationProgress } from "@/hooks/use-education-progress";
import {
  PATHS,
  getPathReadingMinutes,
  getPathProgress,
  type LearningPath,
  type PathDifficulty,
} from "@/lib/education/learning-paths-data";

// ── Icon mapping ───────────────────────────────────────────────────
//
// Paths declare an icon by string (LearningPath.icon: "Receipt") so the
// data file stays serializable. We resolve to a real Lucide component here.

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

const DIFFICULTY_VARIANT: Record<
  PathDifficulty,
  "default" | "bullish" | "warning" | "bearish"
> = {
  beginner: "bullish",
  intermediate: "warning",
  advanced: "bearish",
};

export default function PathsIndex() {
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

  const pathStates = useMemo(
    () =>
      PATHS.map((path) => ({
        path,
        readingMinutes: getPathReadingMinutes(path),
        state: getPathProgress(path, progressBySlug),
      })),
    [progressBySlug]
  );

  const completedPaths = pathStates.filter((p) => p.state.fraction >= 1).length;
  const inProgressPaths = pathStates.filter(
    (p) => p.state.fraction > 0 && p.state.fraction < 1
  ).length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <PageIntro
        eyebrow="Education / Paths"
        title="Learning Paths"
        description="Curated, ordered guide sequences. Each path walks a topic from foundations to applied detail. Progress carries over from individual guides — no re-reading required."
        stats={[
          { label: "Total Paths", value: String(PATHS.length) },
          {
            label: "In Progress",
            value: String(inProgressPaths),
            tone: inProgressPaths > 0 ? "brand" : "neutral",
          },
          {
            label: "Completed",
            value: String(completedPaths),
            tone: completedPaths > 0 ? "bullish" : "neutral",
          },
        ]}
      />

      <EducationalDisclaimer />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pathStates.map(({ path, readingMinutes, state }) => (
          <PathCard
            key={path.slug}
            path={path}
            readingMinutes={readingMinutes}
            viewed={state.viewed}
            quizPassed={state.quizPassed}
            fraction={state.fraction}
          />
        ))}
      </div>
    </div>
  );
}

interface PathCardProps {
  path: LearningPath;
  readingMinutes: number;
  viewed: number;
  quizPassed: number;
  fraction: number;
}

function PathCard({ path, readingMinutes, viewed, quizPassed, fraction }: PathCardProps) {
  const Icon = iconFor(path.icon);
  const isComplete = fraction >= 1;
  const totalGuides = path.guideSlugs.length;

  return (
    <Link href={`/dashboard/education/paths/${path.slug}`} className="group">
      <Card hover className="h-full flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={DIFFICULTY_VARIANT[path.difficulty]}>
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

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">
              {viewed} / {totalGuides} viewed
              {quizPassed > 0 && (
                <span className="text-bullish"> · {quizPassed} passed</span>
              )}
            </span>
            <span className="font-mono text-text-secondary">
              {Math.round(fraction * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.round(fraction * 100)}%` }}
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
