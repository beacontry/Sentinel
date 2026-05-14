"use client";

// /dashboard/billing — current plan, upgrade buttons, manage
// subscription link.
//
// Free users see a 4-card upgrade grid (Trader/Premium × Monthly/Annual).
// Paid users see their current plan details + a "Manage subscription"
// button that opens Stripe's Customer Portal.
//
// Source of truth: /api/me/tier (cached 60s) for tier state. The page
// itself does not call Stripe — only via the API routes.

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/layout/page-intro";
import { UpgradeButton } from "@/components/tiers/upgrade-button";
import { useTier } from "@/components/tiers/tier-gate";
import { labelFor } from "@/lib/tiers";
import { displayPrice } from "@/lib/billing-prices";
import { useToast } from "@/components/ui/toast";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles,
  Check,
  ArrowRight,
} from "lucide-react";

export default function BillingPage() {
  const { tier, loading } = useTier();
  const { toast } = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);

  async function openPortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        toast({
          type: "error",
          message: data?.error?.message ?? "Could not open billing portal — try again later.",
        });
        return;
      }
      window.location.href = data.url;
    } catch {
      toast({
        type: "error",
        message: "Network error — check your connection and retry.",
      });
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      <PageIntro
        eyebrow="Subscription"
        title="Billing"
        description="Manage your plan, payment method, and invoices."
      />

      {/* Current plan summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Current plan
              </CardTitle>
              <p className="text-2xl font-bold mt-2 font-mono">
                {loading ? "—" : labelFor(tier)}
              </p>
              {tier === "free" && !loading && (
                <p className="text-sm text-text-secondary mt-1">
                  Public data, education, watchlists. Upgrade for the engine + AI.
                </p>
              )}
              {tier !== "free" && !loading && (
                <p className="text-sm text-text-secondary mt-1">
                  Manage subscription, update card, or cancel via the Stripe portal.
                </p>
              )}
            </div>
            {tier !== "free" && (
              <Button onClick={openPortal} loading={openingPortal}>
                <CreditCard className="h-4 w-4" />
                Manage subscription
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Upgrade grid — shown for free users only */}
      {tier === "free" && !loading && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Upgrade your plan</h2>
          <p className="text-sm text-text-secondary mb-5">
            All paid plans include a 7-day free trial. Cancel anytime in the first
            30 days for a full refund.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Trader Monthly */}
            <UpgradeCard
              tier="trader"
              cadence="month"
              tagline="Full platform, no AI"
              features={[
                "Automated trading engine (8 modes)",
                "Multi-broker (Alpaca, IBKR, Tradier)",
                "Finnhub data (news, sentiment, fundamentals, options, insiders)",
                "GA optimizer + backtest lab",
                "Full journal + tax center",
              ]}
            />
            {/* Trader Annual */}
            <UpgradeCard
              tier="trader"
              cadence="year"
              tagline="Save 17% vs monthly"
              features={[
                "Everything in Trader Monthly",
                "2 months free vs paying monthly",
                "Locked-in pricing for the year",
              ]}
              highlight
            />
            {/* Premium Monthly */}
            <UpgradeCard
              tier="premium"
              cadence="month"
              tagline="Trader + AI assistant"
              features={[
                "Everything in Trader",
                "AI chat (Beacontry assistant)",
                "AI signal scoring + hybrid sentiment",
                "Daily AI market digest",
                "Weekly AI trade review",
                "Future: L2 / real-time SIP / dark pools",
              ]}
            />
            {/* Premium Annual */}
            <UpgradeCard
              tier="premium"
              cadence="year"
              tagline="Save 17% vs monthly"
              features={[
                "Everything in Premium Monthly",
                "2 months free vs paying monthly",
                "Priority access to new premium features",
              ]}
            />
          </div>
        </section>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-accent animate-spin" />
        </div>
      )}

      {/* Footer link — billing-related help */}
      <div className="pt-6 text-sm text-text-muted">
        Questions? See the{" "}
        <a
          href="/terms#section-10-refunds"
          className="text-accent hover:text-accent-hover underline"
        >
          refund policy
        </a>{" "}
        or{" "}
        <a
          href="/contact"
          className="text-accent hover:text-accent-hover underline"
        >
          contact support
        </a>
        .
      </div>
    </div>
  );
}

interface UpgradeCardProps {
  tier: "trader" | "premium";
  cadence: "month" | "year";
  tagline: string;
  features: string[];
  highlight?: boolean;
}

function UpgradeCard({ tier, cadence, tagline, features, highlight }: UpgradeCardProps) {
  const price = displayPrice(tier, cadence);
  if (!price) return null;

  const title = `${labelFor(tier)} ${cadence === "month" ? "Monthly" : "Annual"}`;

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        highlight
          ? "border-accent/40 bg-accent/[0.04]"
          : "border-border bg-bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-semibold text-text-primary">{title}</h3>
        <span className="font-mono text-lg font-bold text-text-primary">
          {price.label}
        </span>
      </div>
      <p className="text-[0.85rem] text-text-secondary mb-4">{tagline}</p>
      <ul className="space-y-1.5 text-[0.85rem] mb-5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-text-secondary">
            <Check className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <UpgradeButton
        tier={tier}
        cadence={cadence}
        label={`Start ${title}`}
        variant={highlight ? "primary" : "secondary"}
      />
      <p className="mt-2 text-[0.72rem] text-text-muted text-center">
        7-day free trial · cancel anytime
      </p>
    </div>
  );
}
