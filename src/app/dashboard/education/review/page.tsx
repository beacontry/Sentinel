"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Brain, Check, X } from "lucide-react";
import Link from "next/link";
import { PageIntro } from "@/components/layout/page-intro";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { EducationalDisclaimer } from "@/components/education/educational-disclaimer";
import { GLOSSARY_TERMS } from "@/lib/glossary-data";
import { QUALITY_LABELS } from "@/lib/education/spaced-repetition";

interface ReviewQueue {
  dueTerms: string[];
  newTerms: string[];
  upcomingCount: number;
  totalReviewed: number;
  totalTerms: number;
  anonymous: boolean;
}

const TERM_BY_ID = new Map(GLOSSARY_TERMS.map((t) => [t.id, t]));

export default function GlossaryReviewPage() {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [pile, setPile] = useState<string[]>([]);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/education/review?limit=20", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as ReviewQueue;
      setQueue(data);
      // Combine due + new for the session pile (due first)
      setPile([...data.dueTerms, ...data.newTerms]);
    } catch {
      setQueue(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const currentId = pile[0];
  const currentTerm = currentId ? TERM_BY_ID.get(currentId) : undefined;

  const handleGrade = async (quality: number) => {
    if (!currentId || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/education/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: currentId, quality }),
      });
    } catch {
      // Ignore network errors — pile still advances locally
    } finally {
      setPile((p) => p.slice(1));
      setShowAnswer(false);
      setCompleted((c) => c + 1);
      setSubmitting(false);
    }
  };

  const sessionDone = !loading && pile.length === 0 && currentId === undefined;

  const stats = useMemo(() => {
    if (!queue) return null;
    return [
      { label: "Due Today", value: String(queue.dueTerms.length) },
      { label: "New", value: String(queue.newTerms.length) },
      {
        label: "Reviewed",
        value: `${queue.totalReviewed} / ${queue.totalTerms}`,
        tone: queue.totalReviewed > 0 ? ("brand" as const) : ("neutral" as const),
      },
      {
        label: "Completed Today",
        value: String(completed),
        tone: "bullish" as const,
      },
    ];
  }, [queue, completed]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <Link
        href="/dashboard/education"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Education
      </Link>

      <PageIntro
        eyebrow="Education / Review"
        title="Glossary Review"
        description="Spaced-repetition review of personal-finance terms. Grade your recall honestly — the algorithm schedules harder cards more often, easier cards less often."
        stats={stats ?? undefined}
      />

      <EducationalDisclaimer />

      {loading ? (
        <Card className="space-y-4">
          <Skeleton className="h-6 w-1/2" rounded="lg" />
          <Skeleton className="h-20 w-full" rounded="lg" />
        </Card>
      ) : queue?.anonymous ? (
        <EmptyState
          icon={<Brain className="w-7 h-7" />}
          title="Sign in to track your reviews"
          description="The spaced-repetition algorithm needs an account to remember what you've reviewed. Browse the glossary in the meantime."
        />
      ) : sessionDone || pile.length === 0 ? (
        <EmptyState
          icon={<Check className="w-7 h-7 text-bullish" />}
          title="All caught up"
          description={
            queue && queue.upcomingCount > 0
              ? `Nothing due right now. ${queue.upcomingCount} term${queue.upcomingCount === 1 ? "" : "s"} due in the next 7 days.`
              : "No terms due right now. Come back tomorrow."
          }
        />
      ) : currentTerm ? (
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Review {completed + 1} of {pile.length + completed}
            </span>
            <span className="text-[11px] text-text-muted">
              {currentTerm.category}
            </span>
          </div>

          <div className="py-6 space-y-4 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
              {currentTerm.term}
            </h2>
            {!showAnswer ? (
              <button
                type="button"
                onClick={() => setShowAnswer(true)}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg-primary hover:bg-accent-hover transition-colors"
              >
                Show definition
              </button>
            ) : (
              <div className="text-left max-w-2xl mx-auto space-y-3">
                <p className="text-sm leading-relaxed text-text-secondary">
                  {currentTerm.definition}
                </p>
                {currentTerm.examples && currentTerm.examples.length > 0 && (
                  <ul className="space-y-1.5 text-xs text-text-muted">
                    {currentTerm.examples.map((ex, i) => (
                      <li key={i} className="pl-3">
                        — {ex}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {showAnswer && (
            <div className="space-y-2 pt-4 border-t border-border">
              <p className="text-xs text-text-muted text-center">
                How well did you recall this?
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5].map((q) => {
                  const cfg = QUALITY_LABELS[q];
                  const isWrong = q < 3;
                  return (
                    <button
                      key={q}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleGrade(q)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-xs transition-colors disabled:opacity-50 ${
                        isWrong
                          ? "border-bearish/30 bg-bearish/5 hover:bg-bearish/15 text-text-secondary hover:text-bearish"
                          : "border-bullish/30 bg-bullish/5 hover:bg-bullish/15 text-text-secondary hover:text-bullish"
                      }`}
                      title={cfg.description}
                    >
                      <span className="font-semibold">{q}</span>
                      <span className="text-[10px]">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 pt-2 text-[10px] text-text-muted">
                <span className="flex items-center gap-1">
                  <X className="h-3 w-3 text-bearish" /> 0–2 = lapse (resets)
                </span>
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-bullish" /> 3–5 = success (interval grows)
                </span>
              </div>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
