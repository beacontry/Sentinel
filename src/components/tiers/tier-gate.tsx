"use client";

// <TierGate minTier="trader"> wraps any UI surface that requires a paid
// subscription tier. Free users see an inline upgrade CTA instead of
// the feature; tiered users see the feature itself.
//
// This is the CLIENT-side counterpart to the server-side requireTier()
// gate. Both layers exist for distinct reasons:
//
//   - Server gates (402 responses) are the source of truth — what
//     PROTECTS the feature. Even if a free user crafts API calls
//     directly, the server denies.
//
//   - Client gates (this component) are the source of UX — what the
//     user SEES. A free user clicking "Start Engine" should hit a nice
//     "Upgrade to Trader" card, not a generic error toast.
//
// Both gates use the same shared `tiers.ts` definitions, so there's
// no drift.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { labelFor, userHasTier, type Tier } from "@/lib/tiers";

interface TierGateProps {
  /** Minimum tier required to see the wrapped children. */
  minTier: Tier;
  /**
   * Optional name for the gated feature — shown in the upgrade card
   * ("AI Chat requires Premium" etc.).
   */
  featureName?: string;
  /** The feature UI — shown only when the user meets the tier. */
  children: React.ReactNode;
  /**
   * Optional override for the upgrade card. Default renders a centered
   * lock + headline + Upgrade button.
   */
  fallback?: React.ReactNode;
}

/** Hook returns the current user's tier. 60s in-memory cache. */
export function useTier(): { tier: Tier; loading: boolean; authenticated: boolean } {
  const [state, setState] = useState<{
    tier: Tier;
    loading: boolean;
    authenticated: boolean;
  }>({ tier: "free", loading: true, authenticated: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/tier")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setState({
          tier: (d.tier as Tier) ?? "free",
          loading: false,
          authenticated: !!d.authenticated,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ tier: "free", loading: false, authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function TierGate({ minTier, featureName, children, fallback }: TierGateProps) {
  const { tier, loading } = useTier();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  if (userHasTier(tier, minTier)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Lock className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          {featureName ? `${featureName} requires ${labelFor(minTier)}` : `${labelFor(minTier)} tier required`}
        </h3>
        <p className="mt-1 text-sm text-text-secondary max-w-md">
          You&apos;re currently on the {labelFor(tier)} plan. Upgrade to{" "}
          {labelFor(minTier)} to unlock this feature.
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
      >
        Upgrade
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
