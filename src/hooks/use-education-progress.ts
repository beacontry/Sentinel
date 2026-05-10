"use client";

import { useCallback, useEffect, useState } from "react";

export interface GuideProgressEntry {
  slug: string;
  viewCount: number;
  firstViewedAt: string;
  lastViewedAt: string;
  bookmarked: boolean;
}

export interface ProgressSummary {
  progress: GuideProgressEntry[];
  totalGuides: number;
  readCount: number;
  bookmarkCount: number;
}

const EMPTY: ProgressSummary = {
  progress: [],
  totalGuides: 0,
  readCount: 0,
  bookmarkCount: 0,
};

/**
 * Fetch the authenticated user's guide progress. For anonymous users the API
 * returns empty progress (200) — we treat the result the same way.
 */
export function useEducationProgress() {
  const [data, setData] = useState<ProgressSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/education/progress", {
        cache: "no-store",
      });
      if (!res.ok) {
        // Non-critical — leave UI in empty state, log nothing (avoids console noise on logout).
        setData(EMPTY);
        return;
      }
      const json = (await res.json()) as ProgressSummary;
      setData(json);
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...data, loading, refresh };
}

/**
 * Mark a guide as viewed. Fire-and-forget — failures are silently swallowed
 * since this is non-critical telemetry, not user-visible state.
 *
 * Caller passes the slug. The CSRF token is added automatically by the global
 * fetch patch (CsrfInit).
 */
export async function recordGuideView(slug: string): Promise<void> {
  try {
    await fetch(`/api/education/guides/${encodeURIComponent(slug)}/view`, {
      method: "POST",
    });
  } catch {
    // Silent — we don't surface tracking failures to the user.
  }
}

/**
 * Toggle bookmark for a guide. Returns the new bookmarked state on success,
 * or null on failure (caller decides how to handle).
 */
export async function toggleGuideBookmark(
  slug: string,
  bookmarked: boolean,
): Promise<boolean | null> {
  try {
    const res = await fetch(
      `/api/education/guides/${encodeURIComponent(slug)}/bookmark`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarked }),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { bookmarked: boolean };
    return json.bookmarked;
  } catch {
    return null;
  }
}
