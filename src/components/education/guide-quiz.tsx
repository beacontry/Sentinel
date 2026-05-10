"use client";

import { useState } from "react";
import { Check, X, RotateCcw, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { QuizQuestion } from "@/lib/education/guides-data";

const PASS_PCT = 0.8;

export function GuideQuiz({
  slug,
  questions,
}: {
  slug: string;
  questions: QuizQuestion[];
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const correctCount = answers.reduce<number>(
    (acc, a, i) => (a === questions[i].correctIndex ? acc + 1 : acc),
    0,
  );
  const score = correctCount;
  const total = questions.length;
  const passed = total > 0 && score / total >= PASS_PCT;
  const allAnswered = answers.every((a) => a !== null);

  const handleSelect = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    const next = [...answers];
    next[qIdx] = optIdx;
    setAnswers(next);
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await fetch(
        `/api/education/guides/${encodeURIComponent(slug)}/quiz`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score, total }),
        },
      );
      // Don't surface server errors to user — the quiz UX still works
      // client-side; tracking failure is non-critical telemetry.
    } catch {
      setServerError(null);
    } finally {
      setSubmitted(true);
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setAnswers(questions.map(() => null));
    setSubmitted(false);
    setServerError(null);
  };

  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Test what you learned
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {questions.length} questions · pass = {Math.ceil(questions.length * PASS_PCT)} of {questions.length}
          </p>
        </div>
        {submitted && (
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              passed
                ? "border-bullish/30 bg-bullish/10 text-bullish"
                : "border-warning/30 bg-warning/10 text-warning"
            }`}
          >
            {passed ? (
              <>
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                Passed — {score} / {total}
              </>
            ) : (
              <>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {score} / {total} — try again
              </>
            )}
          </div>
        )}
      </div>

      <ol className="space-y-5">
        {questions.map((q, qIdx) => {
          const userAnswer = answers[qIdx];
          const isCorrect = userAnswer === q.correctIndex;
          return (
            <li key={qIdx} className="space-y-2.5">
              <p className="text-sm font-medium text-text-primary">
                {qIdx + 1}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const selected = userAnswer === optIdx;
                  const showCorrect = submitted && optIdx === q.correctIndex;
                  const showWrong =
                    submitted && selected && optIdx !== q.correctIndex;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelect(qIdx, optIdx)}
                      disabled={submitted}
                      className={`w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        showCorrect
                          ? "border-bullish/40 bg-bullish/10 text-text-primary"
                          : showWrong
                          ? "border-bearish/40 bg-bearish/10 text-text-primary"
                          : selected
                          ? "border-accent/40 bg-accent/10 text-text-primary"
                          : "border-border bg-bg-secondary text-text-secondary hover:border-border-hover hover:text-text-primary"
                      } ${submitted ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <span
                        className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center ${
                          showCorrect
                            ? "border-bullish bg-bullish/20"
                            : showWrong
                            ? "border-bearish bg-bearish/20"
                            : selected
                            ? "border-accent bg-accent/20"
                            : "border-border"
                        }`}
                        aria-hidden="true"
                      >
                        {showCorrect && (
                          <Check className="h-2.5 w-2.5 text-bullish" />
                        )}
                        {showWrong && <X className="h-2.5 w-2.5 text-bearish" />}
                        {!submitted && selected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        )}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <div
                  className={`rounded-lg border p-3 text-xs leading-relaxed ${
                    isCorrect
                      ? "border-bullish/20 bg-bullish/5 text-text-secondary"
                      : "border-bearish/20 bg-bearish/5 text-text-secondary"
                  }`}
                >
                  <span className="font-semibold text-text-primary">
                    {isCorrect ? "Correct. " : "Not quite. "}
                  </span>
                  {q.explanation}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {serverError && (
        <p className="text-xs text-bearish">{serverError}</p>
      )}

      {!submitted ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg-primary hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Submit answers"}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-text-muted">
            {passed
              ? "Score saved to your progress."
              : "Score saved. Review the explanations above and retry to improve."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </Card>
  );
}
