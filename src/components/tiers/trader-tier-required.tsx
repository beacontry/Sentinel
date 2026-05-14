"use client";

// Tier-gate view shown ABOVE the Trader page content for free users.
// Renders inline so the page still loads (read-only widgets like the
// risk profile editor and watchlist are fine to show) — just makes it
// crystal clear that engine controls / broker actions need an upgrade.
//
// Paid users see nothing (component returns null).

import Link from "next/link";
import { ArrowRight, Bot, Check, Lock } from "lucide-react";
import { useTier } from "./tier-gate";

const TRADER_FEATURES = [
  "Automated trading engine across 8 modes",
  "Alpaca / IBKR / Tradier broker integration",
  "Manual + bracket order ticket",
  "Strategy optimizer (genetic algorithm)",
  "Backtest lab with mode comparison",
  "Real-time alerts (Discord, push, email)",
];

export function TraderTierRequired() {
  const { tier, loading, authenticated } = useTier();

  if (loading || !authenticated) return null;
  // Paid tiers (trader, premium, enterprise) — show nothing, just the
  // normal page content underneath.
  if (tier !== "free") return null;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-accent/30 bg-accent/[0.06] p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/14 px-3 py-1">
            <Lock className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Trader plan required
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary mb-2">
            <Bot className="inline h-5 w-5 mr-2 text-accent" />
            Engine + brokerage features unlock with Trader
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary max-w-2xl mb-4">
            You can view this page on the free plan but engine controls,
            broker connections, and order placement need a Trader subscription
            (or higher). $20/month, cancel anytime.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[0.84rem] text-text-secondary mb-2">
            {TRADER_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            See pricing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-[0.72rem] text-text-muted text-center lg:text-right">
            Includes 7-day trial
          </span>
        </div>
      </div>
    </section>
  );
}
