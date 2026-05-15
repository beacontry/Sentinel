"use client";

// Universal upgrade CTA — drops into pricing page tier cards, sidebar
// tier badge, TierGate fallbacks, anywhere else we want users to
// initiate an upgrade.
//
// Behavior depends on authentication state:
//   - Authenticated  → POST /api/billing/checkout with the resolved
//                      price ID, redirect to Stripe Checkout URL
//   - Anonymous      → fall back to <Link href="/register?next=/pricing">
//                      so users sign up first, then return to checkout
//   - Already at-or-above target tier → render disabled "Current plan"
//                                       chip instead of upgrade CTA

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { resolvePriceId, type Cadence } from "@/lib/billing-prices";
import { userHasTier, type Tier } from "@/lib/tiers";
import { useTier } from "./tier-gate";

interface UpgradeButtonProps {
  /** Target tier the button upgrades to. */
  tier: Exclude<Tier, "free" | "enterprise">;
  /** Billing cadence — defaults to monthly. */
  cadence?: Cadence;
  /** Override the CTA label. Defaults to "Upgrade to {tier}". */
  label?: string;
  /** Visual style. */
  variant?: "primary" | "secondary";
  /** Full-width vs natural-width. Defaults to full-width. */
  fullWidth?: boolean;
  /** Optional additional CSS classes for the rendered button/link. */
  className?: string;
}

export function UpgradeButton({
  tier,
  cadence = "month",
  label,
  variant = "primary",
  fullWidth = true,
  className = "",
}: UpgradeButtonProps) {
  const { tier: currentTier, loading, authenticated } = useTier();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctaLabel =
    label ?? `Upgrade to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

  // Base classes
  const widthCls = fullWidth ? "w-full" : "";
  const styleCls =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-hover"
      : "border border-border text-text-primary hover:border-accent hover:bg-accent/[0.06]";
  const baseCls = `inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all duration-200 ${widthCls} ${styleCls} ${className}`;

  // While loading current tier, show a quiet placeholder. Avoids
  // flickering between "Loading" / "Already on plan" / "Upgrade".
  if (loading) {
    return (
      <button disabled className={`${baseCls} opacity-60`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading…</span>
      </button>
    );
  }

  // Already on this tier or higher — show a non-CTA "Current plan" chip.
  if (authenticated && userHasTier(currentTier, tier)) {
    return (
      <button
        disabled
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-bullish/30 bg-bullish/10 px-5 py-3 text-sm font-semibold text-bullish ${widthCls} ${className}`}
      >
        <Check className="h-4 w-4" />
        <span>Current plan</span>
      </button>
    );
  }

  // Anonymous — route through register with plan intent. The register
  // page reads ?plan=&cadence= and after a successful signup forwards
  // to /dashboard/billing?upgrade=<tier>:<cadence>, which then
  // auto-triggers /api/billing/checkout. Anonymous → Stripe in one
  // narrative thread; no "ended up on the dashboard with no upgrade
  // path" dead-ends.
  if (!authenticated) {
    return (
      <Link
        href={`/register?plan=${tier}&cadence=${cadence}`}
        className={baseCls}
      >
        <span>{ctaLabel}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }

  // Authenticated free/lower-tier user — kick off Stripe Checkout.
  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const priceId = resolvePriceId(tier, cadence);
      if (!priceId) {
        setError("Plan not configured. Please try again later.");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        // Surface the API error envelope message if present
        const msg =
          data?.error?.message ?? "Could not start checkout. Try again.";
        setError(msg);
        setSubmitting(false);
        return;
      }
      // Redirect to Stripe Checkout — they'll come back after pay/cancel.
      window.location.href = data.url;
    } catch {
      setError("Network error. Check your connection and retry.");
      setSubmitting(false);
    }
  }

  return (
    <div className={fullWidth ? "w-full" : "inline-block"}>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className={`${baseCls} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        <span>{ctaLabel}</span>
        {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
      </button>
      {error ? (
        <p className="mt-2 text-[0.78rem] text-bearish text-center">
          {error}
        </p>
      ) : null}
    </div>
  );
}
