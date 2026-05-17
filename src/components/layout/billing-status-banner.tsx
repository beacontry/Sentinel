"use client";

// Dashboard-wide banner that surfaces Stripe billing lifecycle issues.
// Reads billingStatus from /api/me/tier and shows a yellow warning
// when status === 'past_due'. Dismissed banners come back on next load
// — this is intentional: dismissing the banner doesn't fix the payment.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

interface MeTier {
  tier: string;
  authenticated: boolean;
  hasStripeCustomer: boolean;
  billingStatus: string | null;
}

const DISMISS_KEY = "billing-banner-dismissed-at";
const DISMISS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function BillingStatusBanner() {
  const [data, setData] = useState<MeTier | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Respect a recent dismissal so the banner doesn't immediately
    // re-appear after they update their card (cleared on next /api/me/tier
    // refresh anyway, but UX-smoother).
    try {
      const at = window.localStorage.getItem(DISMISS_KEY);
      if (at && Date.now() - parseInt(at, 10) < DISMISS_TTL_MS) {
        setDismissed(true);
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    fetch("/api/me/tier")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {
        /* silent — banner is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  if (!data?.authenticated) return null;
  if (data.billingStatus !== "past_due") return null;
  if (dismissed) return null;

  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto max-w-7xl px-4 lg:px-6 py-2.5 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <span className="font-semibold text-text-primary">
            Payment failed.
          </span>{" "}
          <span className="text-text-secondary">
            Your most recent renewal didn&apos;t go through. Stripe will retry
            for ~3 weeks, then your subscription will end if it doesn&apos;t
            clear. Update your card to avoid losing paid access.
          </span>{" "}
          <Link
            href="/dashboard/billing"
            className="font-semibold text-warning hover:underline"
          >
            Update payment method →
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-text-muted hover:text-text-secondary -m-1 p-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
