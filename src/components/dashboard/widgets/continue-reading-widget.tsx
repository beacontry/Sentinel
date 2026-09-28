"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Trophy } from "lucide-react";
import { GUIDES, TOPIC_META } from "@/lib/education/guides-data";
import { useEducationProgress } from "@/hooks/use-education-progress";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingRegion } from "@/components/ui/live-region";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Surfaces the next education guide for the user. Heuristic:
 *   1. If user has viewed but not passed quiz → suggest taking/retrying that quiz
 *   2. Else if user has unread guides → suggest the highest-priority unread one
 *      (intro guides first, then by reading order)
 *   3. Else show "all caught up" state with a reread suggestion
 */
export function ContinueReadingWidget() {
  const { progress, loading } = useEducationProgress();

  const next = useMemo(() => {
    const passedSet = new Set(progress.filter((p) => p.quizPassedAt !== null).map((p) => p.slug));
    const viewedNotPassed = progress.filter((p) => p.viewCount > 0 && p.quizPassedAt === null);

    // Priority 1: viewed but quiz not passed — finish what you started
    if (viewedNotPassed.length > 0) {
      const sorted = [...viewedNotPassed].sort(
        (a, b) => new Date(b.lastViewedAt).getTime() - new Date(a.lastViewedAt).getTime(),
      );
      const guide = GUIDES.find((g) => g.slug === sorted[0].slug);
      if (guide) {
        return {
          guide,
          mode: sorted[0].quizAttempts > 0 ? ("retry-quiz" as const) : ("take-quiz" as const),
          attempts: sorted[0].quizAttempts,
        };
      }
    }

    // Priority 2: unread guide — suggest the next one
    const unread = GUIDES.filter((g) => !progress.some((p) => p.slug === g.slug));
    if (unread.length > 0) {
      const order: Record<string, number> = { intro: 0, intermediate: 1, advanced: 2 };
      const sorted = [...unread].sort((a, b) => (order[a.difficulty] ?? 99) - (order[b.difficulty] ?? 99));
      return { guide: sorted[0], mode: "read" as const, attempts: 0 };
    }

    // Priority 3: all guides read & quizzes passed — suggest a refresher
    if (passedSet.size === GUIDES.length) {
      const oldest = [...progress].sort(
        (a, b) => new Date(a.lastViewedAt).getTime() - new Date(b.lastViewedAt).getTime(),
      )[0];
      const guide = oldest ? GUIDES.find((g) => g.slug === oldest.slug) : null;
      if (guide) return { guide, mode: "refresher" as const, attempts: 0 };
    }

    return null;
  }, [progress]);

  if (loading) {
    return (
      <LoadingRegion label="your next guide" busy>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-14 w-full" rounded="lg" />
      </LoadingRegion>
    );
  }

  if (!next) {
    return (
      <EmptyState
        compact
        icon={<GraduationCap />}
        title={`All ${GUIDES.length} guides read`}
        description="Every quiz passed. The glossary is there when you need it."
        action={{ label: "Browse the glossary", href: "/dashboard/education" }}
      />
    );
  }

  const { guide, mode, attempts } = next;
  const labels: Record<typeof mode, { label: string; sub: string }> = {
    "take-quiz": { label: "Test what you read", sub: "Take the 5-question quiz" },
    "retry-quiz": {
      label: `Retry the quiz (${attempts} attempt${attempts === 1 ? "" : "s"})`,
      sub: "Pass at 4 of 5 to earn the trophy",
    },
    read: { label: "Pick up reading", sub: `${guide.readingMinutes} min, ${guide.difficulty}` },
    refresher: { label: "Refresher", sub: "It has been a while; review this one" },
  };
  const cta = labels[mode];
  const Icon = mode === "retry-quiz" || mode === "take-quiz" ? Trophy : BookOpen;

  return (
    <div>
      <p className="text-xs text-text-muted">{cta.label}</p>
      <Link
        href={`/dashboard/education/guides/${guide.slug}`}
        className="group mt-2 flex items-start gap-3 rounded-lg bg-bg-surface p-3 transition-colors duration-150 hover:bg-bg-hover"
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-snug text-text-primary">{guide.title}</span>
          <span className="mt-0.5 block text-xs text-text-secondary">
            {TOPIC_META[guide.topic].label} · {cta.sub}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted group-hover:text-text-primary" aria-hidden="true" />
      </Link>
    </div>
  );
}
