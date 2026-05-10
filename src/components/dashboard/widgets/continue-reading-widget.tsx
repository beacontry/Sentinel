"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Trophy } from "lucide-react";
import {
  GUIDES,
  TOPIC_META,
} from "@/lib/education/guides-data";
import { useEducationProgress } from "@/hooks/use-education-progress";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Surfaces the next education guide for the user. Heuristic:
 *   1. If user has viewed but not passed quiz → suggest taking/retrying that quiz
 *   2. Else if user has unread guides → suggest the highest-priority unread one
 *      (intro guides first, then by reading order)
 *   3. Else show "all caught up" state with a random reread suggestion
 */
export function ContinueReadingWidget() {
  const { progress, loading } = useEducationProgress();

  const next = useMemo(() => {
    const passedSet = new Set(
      progress.filter((p) => p.quizPassedAt !== null).map((p) => p.slug),
    );
    const viewedNotPassed = progress.filter(
      (p) => p.viewCount > 0 && p.quizPassedAt === null,
    );

    // Priority 1: viewed but quiz not passed — finish what you started
    if (viewedNotPassed.length > 0) {
      // Most recently viewed first
      const sorted = [...viewedNotPassed].sort(
        (a, b) =>
          new Date(b.lastViewedAt).getTime() -
          new Date(a.lastViewedAt).getTime(),
      );
      const guide = GUIDES.find((g) => g.slug === sorted[0].slug);
      if (guide) {
        return {
          guide,
          mode:
            sorted[0].quizAttempts > 0
              ? ("retry-quiz" as const)
              : ("take-quiz" as const),
          attempts: sorted[0].quizAttempts,
        };
      }
    }

    // Priority 2: unread guide — suggest the next one
    const unread = GUIDES.filter(
      (g) => !progress.some((p) => p.slug === g.slug),
    );
    if (unread.length > 0) {
      // Order: intro first, then intermediate, then advanced
      const order: Record<string, number> = {
        intro: 0,
        intermediate: 1,
        advanced: 2,
      };
      const sorted = [...unread].sort(
        (a, b) => (order[a.difficulty] ?? 99) - (order[b.difficulty] ?? 99),
      );
      return { guide: sorted[0], mode: "read" as const, attempts: 0 };
    }

    // Priority 3: all guides read & quizzes passed — suggest a refresher
    if (passedSet.size === GUIDES.length) {
      // Pick the oldest-viewed one (longest since touched)
      const oldest = [...progress].sort(
        (a, b) =>
          new Date(a.lastViewedAt).getTime() -
          new Date(b.lastViewedAt).getTime(),
      )[0];
      const guide = oldest ? GUIDES.find((g) => g.slug === oldest.slug) : null;
      if (guide) return { guide, mode: "refresher" as const, attempts: 0 };
    }

    return null;
  }, [progress]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/2" rounded="lg" />
        <Skeleton className="h-12 w-full" rounded="lg" />
      </div>
    );
  }

  if (!next) {
    return (
      <div className="py-3 space-y-3 text-center">
        <GraduationCap className="h-8 w-8 text-text-muted mx-auto" />
        <div>
          <p className="text-sm text-text-secondary">
            All {GUIDES.length} guides read. 🎉
          </p>
          <Link
            href="/dashboard/education"
            className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Browse glossary <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  const { guide, mode, attempts } = next;
  const labels: Record<typeof mode, { label: string; sub: string }> = {
    "take-quiz": {
      label: "Test what you read",
      sub: "Take the 5-question quiz",
    },
    "retry-quiz": {
      label: `Retry quiz (${attempts} attempt${attempts === 1 ? "" : "s"})`,
      sub: "Pass at 4/5 to earn the trophy",
    },
    read: {
      label: "Pick up reading",
      sub: `${guide.readingMinutes} min · ${guide.difficulty}`,
    },
    refresher: {
      label: "Refresher",
      sub: "It's been a while — review this one",
    },
  };
  const cta = labels[mode];

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {cta.label}
      </p>

      <Link
        href={`/dashboard/education/guides/${guide.slug}`}
        className="block rounded-lg border border-border bg-bg-elevated p-3 hover:border-accent/40 transition-colors group"
      >
        <div className="flex items-start gap-3">
          {mode === "retry-quiz" || mode === "take-quiz" ? (
            <Trophy
              className="h-4 w-4 text-warning shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <BookOpen
              className="h-4 w-4 text-accent shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary leading-snug truncate">
              {guide.title}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {TOPIC_META[guide.topic].label} · {cta.sub}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-accent transition-colors shrink-0" />
        </div>
      </Link>

      <Link
        href="/dashboard/education"
        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent transition-colors"
      >
        All guides <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
