"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";
import {
  recordGuideView,
  toggleGuideBookmark,
} from "@/hooks/use-education-progress";

/**
 * Mounted on each guide detail page. Records a view on mount (fire-and-forget)
 * and renders the bookmark toggle button. Does nothing visible if the user is
 * anonymous — the API returns 401 silently and the button still renders so
 * users get a clear login prompt path if they click.
 */
export function GuideProgressTracker({ slug }: { slug: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [pending, setPending] = useState(false);
  const [recordedView, setRecordedView] = useState(false);

  // Record view once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await recordGuideView(slug);
      if (!cancelled) setRecordedView(true);
    })();

    // Best-effort: hydrate current bookmark state from progress endpoint.
    void (async () => {
      try {
        const res = await fetch("/api/education/progress", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          progress: { slug: string; bookmarked: boolean }[];
        };
        const entry = json.progress.find((p) => p.slug === slug);
        if (entry && !cancelled) setBookmarked(entry.bookmarked);
      } catch {
        // Ignore — non-critical
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleToggle = async () => {
    if (pending) return;
    setPending(true);
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    const result = await toggleGuideBookmark(slug, next);
    if (result === null) {
      setBookmarked(!next); // revert
    } else {
      setBookmarked(result);
    }
    setPending(false);
  };

  return (
    <div className="flex items-center gap-2">
      {recordedView && (
        <span
          className="inline-flex items-center gap-1 text-xs text-text-muted"
          aria-label="Marked as viewed"
        >
          <Check className="h-3.5 w-3.5 text-bullish" aria-hidden="true" />
          Viewed
        </span>
      )}
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
        aria-pressed={bookmarked}
        aria-label={bookmarked ? "Remove bookmark" : "Bookmark this guide"}
      >
        {bookmarked ? (
          <>
            <BookmarkCheck
              className="h-3.5 w-3.5 text-accent"
              aria-hidden="true"
            />
            Bookmarked
          </>
        ) : (
          <>
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            Bookmark
          </>
        )}
      </button>
    </div>
  );
}
