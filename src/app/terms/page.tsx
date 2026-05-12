// Public ToS page. Linked from the footer of every dashboard page and
// from the acceptance modal. Self-contained — no auth required. Plain
// language; nothing here that needs to be hidden or per-user.

import Link from "next/link";
import { Radar } from "lucide-react";
import { TERMS_VERSION } from "@/lib/terms-version";

export const metadata = {
  title: "Terms of Service — Sentinel",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-text-primary hover:text-accent transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Radar className="h-4 w-4" />
            </div>
            <span className="font-semibold">Sentinel</span>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6 text-text-secondary leading-relaxed">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Terms of Service</h1>
          <p className="text-xs text-text-muted mt-1 font-mono">
            Last updated: {TERMS_VERSION}
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">1. What Sentinel Is</h2>
          <p>
            Sentinel is a software tool for analyzing markets, journaling trades, and
            (optionally) automating order placement through your own brokerage account.
            Sentinel does not custody assets, hold funds, or execute trades on its own
            books — every order is placed through the brokerage API you configure
            (currently Alpaca, Tradier, or Interactive Brokers).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">2. Not Financial Advice</h2>
          <p>
            Signals, AI-generated commentary, optimizer outputs, model portfolios,
            backtest results, and any other information produced by Sentinel are
            <strong className="text-text-primary"> for informational purposes only</strong>.
            Nothing in Sentinel is investment advice, brokerage advice, legal advice,
            tax advice, or a recommendation to buy or sell any security. Sentinel is
            not a registered investment adviser, broker-dealer, or financial planner.
          </p>
          <p>
            You are solely responsible for every trading decision you make, whether
            executed manually or automated through the engine. Past performance,
            backtests, and simulated results do not guarantee future performance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">3. Account Security</h2>
          <p>
            You are responsible for keeping your login credentials, broker API keys,
            and any device that accesses Sentinel secure. Broker API keys are encrypted
            at rest in Sentinel&apos;s database, but if your account is compromised,
            anyone with access can place orders on your linked brokerage.
          </p>
          <p>
            Rotate API keys promptly if you suspect exposure. Sentinel will not be
            liable for losses resulting from compromised credentials, lost devices,
            or unauthorized access to your account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">4. Automated Trading</h2>
          <p>
            The trading engine places real orders on your broker when enabled in Live
            mode. Sentinel implements multiple safeguards (position limits, daily-loss
            halts, broker-disconnect detection, wash-sale checks, PDT protection), but
            these safeguards are best-effort and not guaranteed.
          </p>
          <p>
            Software bugs, broker outages, market dislocations, exchange halts, or
            anomalous data can cause unintended trades or losses. You acknowledge
            that automated trading carries unique risks and you accept those risks
            when you enable Live mode.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">5. AI Outputs</h2>
          <p>
            Sentinel uses third-party AI services (Anthropic Claude) to summarize
            market data, score sentiment, and generate the daily digest. AI outputs
            can be inaccurate, hallucinated, biased, or outdated. Treat them as
            commentary, not facts. Verify anything material before acting on it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">6. Service Availability</h2>
          <p>
            Sentinel is provided &quot;as is.&quot; The service may be unavailable,
            degraded, or interrupted for maintenance, infrastructure issues, or
            upstream dependency outages. Sentinel will not be liable for losses or
            missed opportunities resulting from service downtime.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">7. Data Use</h2>
          <p>
            Sentinel stores your account data (email, encrypted broker keys, watchlists,
            trade history, journal entries, alert rules) to provide the service. We do
            not sell user data. Audit logs of privileged actions are retained for
            security and dispute resolution.
          </p>
          <p>
            If you delete your account, your data is removed from production within
            30 days (encrypted backups may persist briefly per the standard retention
            schedule).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">8. Changes</h2>
          <p>
            These terms may change. Material changes will prompt you to re-accept
            on next sign-in. The version stamp at the top reflects the current text.
          </p>
        </section>

        <p className="pt-4 border-t border-border text-sm">
          See also: <Link href="/risk" className="text-accent hover:text-accent-hover underline">Risk Disclosure</Link>
        </p>
      </main>
    </div>
  );
}
