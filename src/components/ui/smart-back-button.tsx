"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Back button that returns the user to where they actually came from.
 *
 * Why it exists: many pages were using `<Link href="/dashboard/X">`
 * as their back arrow, hardcoded to one destination. So a user
 * navigating from /dashboard/congress → /dashboard/trade/SYM → "back"
 * would land on /dashboard/analysis instead of /dashboard/congress.
 *
 * Behavior:
 *  1. If the user navigated to this page from another in-app page
 *     (window.history.length > 1 + we have a known referrer), call
 *     router.back() so the browser pops the history stack.
 *  2. If the user landed here via a direct URL (bookmark, paste, email),
 *     fall back to `fallbackHref` so the button still does something
 *     useful.
 *
 * `fallbackHref` is also where the user goes if back() somehow fails
 * (rare — happens only if the history is empty AND they manually
 * navigated to about:blank in between).
 */
interface SmartBackButtonProps {
  /** Where to go if there's no in-app history to pop. */
  fallbackHref: string;
  /** Optional label rendered next to the arrow. Default: icon only. */
  label?: string;
  /** Optional className applied to the button. */
  className?: string;
  /** Override the icon size (in px). Default: 20. */
  iconSize?: number;
  /** Accessibility label. Default: "Back". */
  ariaLabel?: string;
}

export function SmartBackButton({
  fallbackHref,
  label,
  className = "",
  iconSize = 20,
  ariaLabel = "Back",
}: SmartBackButtonProps) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // window.history.length > 1 typically means there's a previous entry.
    // It can lie (counts both forward and back), but it's the best signal
    // we have without a referrer. Combined with a same-origin check on
    // document.referrer this is a solid heuristic.
    if (typeof window === "undefined") return;
    const hasHistory = window.history.length > 1;
    let sameOrigin = false;
    if (document.referrer) {
      try {
        sameOrigin = new URL(document.referrer).origin === window.location.origin;
      } catch {
        sameOrigin = false;
      }
    }
    setCanGoBack(hasHistory && sameOrigin);
  }, []);

  function handleClick() {
    if (canGoBack) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors ${className}`}
    >
      <ArrowLeft style={{ width: iconSize, height: iconSize }} />
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}
