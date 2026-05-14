"use client";

// First-impression welcome card shown on /dashboard for free-tier users.
// Surfaces the four highest-value free features alongside a clear (but
// not pushy) upgrade prompt. Dismissible — once a user dismisses it the
// preference persists in localStorage so the dashboard reverts to the
// normal widget grid on next visit.
//
// Hidden entirely for paid users and anonymous visitors.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Landmark,
  Newspaper,
  Sparkles,
  X,
} from "lucide-react";
import { useTier } from "./tier-gate";

const DISMISS_KEY = "beacontry-free-welcome-dismissed-v1";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Learn",
    desc: "14 long-form guides on trading and personal finance",
    href: "/dashboard/education",
  },
  {
    icon: Calculator,
    title: "Tools",
    desc: "8 calculators — FIRE, Roth vs Traditional, tax-loss harvesting",
    href: "/dashboard/education?tab=calculators",
  },
  {
    icon: Landmark,
    title: "Congress",
    desc: "Live federal Periodic Transaction Reports, searchable by ticker",
    href: "/dashboard/congress",
  },
  {
    icon: Newspaper,
    title: "Daily Digest",
    desc: "AI-summarized market briefing every trading day",
    href: "/dashboard/articles",
  },
];

export function FreeTierWelcome() {
  const { tier, loading, authenticated } = useTier();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  // Read dismissed state on mount. null state = haven't checked yet
  // (prevents flash of card on tab switches when localStorage is set).
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* localStorage disabled — fine, just won't persist */
    }
    setDismissed(true);
  }

  if (loading || dismissed === null) return null;
  if (!authenticated || tier !== "free") return null;
  if (dismissed) return null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-xl border border-accent/22 bg-accent/[0.05] p-5 sm:p-6">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss welcome message"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Welcome to Beacontry
        </span>
      </div>

      <h2 className="text-lg sm:text-xl font-bold tracking-tight text-text-primary mb-2">
        You&apos;re on the free plan — start here
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary max-w-2xl mb-5">
        Free includes everything for learning and research. The trading engine,
        AI chat, and broker execution unlock with{" "}
        <Link
          href="/pricing"
          className="text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Trader ($20/mo)
        </Link>{" "}
        — but explore the free tools first.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group flex flex-col rounded-lg border border-border bg-bg-surface p-3 transition-all hover:border-accent/40 hover:bg-bg-hover"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
              <f.icon className="h-4 w-4" />
            </div>
            <div className="font-semibold text-sm text-text-primary mb-0.5">
              {f.title}
            </div>
            <div className="text-[0.78rem] leading-snug text-text-secondary">
              {f.desc}
            </div>
            <span className="mt-2 inline-flex items-center gap-1 text-[0.78rem] text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
