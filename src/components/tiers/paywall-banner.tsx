"use client";

// Generic tier paywall banner — sits at the top of any paid page and
// surfaces the upgrade prompt for users below the required tier. Hides
// for users at or above the tier.
//
// Replaces the page-specific TraderTierRequired pattern. TraderTierRequired
// stays as-is for /dashboard/trader (custom feature list) but new paid
// pages should use this generic component for consistency.
//
// Pattern:
//   <PaywallBanner
//     minTier="trader"
//     featureName="Backtest Lab"
//     description="Optional one-line tagline for this feature."
//   />
//   ... rest of page content (still renders, just shows 402 errors in
//   their network calls; the banner explains why) ...

import Link from "next/link";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { useTier } from "./tier-gate";
import { labelFor, userHasTier, type Tier } from "@/lib/tiers";

interface PaywallBannerProps {
  /** Minimum tier required. Free always sees the banner; Trader sees it
   *  only for premium-tier features. */
  minTier: Exclude<Tier, "free" | "enterprise">;
  /** Human name of the feature ("Backtest Lab" / "AI Insights"). */
  featureName: string;
  /** Optional one-line tagline. Defaults to a generic message. */
  description?: string;
}

export function PaywallBanner({
  minTier,
  featureName,
  description,
}: PaywallBannerProps) {
  const { tier, loading, authenticated } = useTier();

  // Hide while loading + for anonymous traffic (the page itself will
  // redirect to login if auth-required). Hide for users at or above tier.
  if (loading || !authenticated) return null;
  if (userHasTier(tier, minTier)) return null;

  const tierLabel = labelFor(minTier);
  const finalDescription =
    description ??
    `${featureName} unlocks with ${tierLabel}. Browse the page to see what's behind the paywall — actions will prompt to upgrade.`;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-accent/30 bg-accent/[0.06] p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent/14 px-3 py-1">
            <Lock className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              {tierLabel} plan required
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-text-primary mb-1">
            <Sparkles className="inline h-4 w-4 mr-1.5 text-accent" />
            {featureName} requires {tierLabel}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {finalDescription}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 lg:items-end">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors whitespace-nowrap"
          >
            Upgrade to {tierLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-[0.72rem] text-text-muted lg:text-right">
            7-day free trial
          </span>
        </div>
      </div>
    </section>
  );
}
