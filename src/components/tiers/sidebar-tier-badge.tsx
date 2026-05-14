"use client";

// Sidebar tier indicator — persistent reminder of which plan the user
// is on, plus an upgrade CTA for free users.
//
// Sits in the sidebar footer below the theme picker / P&L toggle / AI
// chat / sign-out cluster. Designed to be quiet on paid tiers (just a
// small chip showing the plan) and louder on free (full-width upgrade
// pill that's hard to miss without being obnoxious).
//
// Reads tier via the same useTier() hook the rest of the app uses
// (cached in-memory; one /api/me/tier roundtrip on mount).

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useTier } from "./tier-gate";
import { labelFor } from "@/lib/tiers";

export function SidebarTierBadge() {
  const { tier, loading, authenticated } = useTier();

  // Don't render anything while loading or for anonymous users (login page
  // shouldn't show this — only logged-in dashboard sessions reach here).
  if (loading || !authenticated) return null;

  // Paid tier — quiet chip. Lets the user verify their plan at a glance.
  if (tier !== "free") {
    return (
      <div
        style={{
          margin: "6px 0 4px",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--color-text-muted)",
          backgroundColor: "transparent",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Sparkles style={{ width: 12, height: 12 }} />
        <span style={{ flex: 1 }}>
          {labelFor(tier)} plan
        </span>
        <Link
          href="/dashboard/billing"
          style={{
            fontSize: 10,
            color: "var(--color-text-muted)",
            textDecoration: "underline",
            textDecorationColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecorationColor =
              "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecorationColor = "transparent";
          }}
        >
          Manage
        </Link>
      </div>
    );
  }

  // Free tier — loud upgrade pill. Same visual rhythm as the other
  // sidebar buttons but with accent treatment to draw the eye.
  return (
    <Link
      href="/pricing"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        marginBottom: 6,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        color: "var(--color-accent)",
        backgroundColor: "var(--color-accent-bg, rgba(16, 185, 129, 0.08))",
        border: "1px solid var(--color-accent-border, rgba(16, 185, 129, 0.18))",
        textDecoration: "none",
      }}
    >
      <Sparkles style={{ width: 13, height: 13, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12 }}>Upgrade to Trader</span>
      <ArrowUpRight style={{ width: 12, height: 12, opacity: 0.7 }} />
    </Link>
  );
}
