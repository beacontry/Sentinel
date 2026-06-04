// Public Risk Disclosure. Same shell as /terms. Listed separately so
// users see "risk" as a first-class topic rather than buried in a ToS
// subsection.

import Link from "next/link";
import { Radar, AlertTriangle } from "lucide-react";
import { TERMS_VERSION } from "@/lib/terms-version";

export const metadata = {
  title: "Risk Disclosure — Beacontry",
};

export default function RiskPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 text-text-primary hover:text-accent transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <Radar className="h-4 w-4" />
            </div>
            <span className="font-semibold">Beacontry</span>
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
          <h1 className="text-2xl font-semibold text-text-primary">Risk Disclosure</h1>
          <p className="text-xs text-text-muted mt-1 font-mono">
            Last updated: {TERMS_VERSION}
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="w-5 h-5 shrink-0 text-warning mt-0.5" />
          <p className="text-sm text-text-secondary m-0">
            Trading involves substantial risk. You can lose more than your initial
            investment, especially with leverage or short positions. Read this page
            carefully before enabling Live mode.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Capital at Risk</h2>
          <p>
            Every trade placed through Beacontry — manual or automated — uses real
            money from your linked brokerage account once Live mode is enabled. The
            value of securities can decline to zero. Past returns do not predict
            future returns.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Strategy Risk</h2>
          <p>
            Beacontry&apos;s engine modes (conservative, moderate, optimized, intraday,
            tactical, tactical-smart) are technical strategies that can underperform
            or lose money in markets unlike those in which they were developed. The
            optimizer searches historical data; over-fitting is a real risk and
            historically-strong strategies can fail in live trading.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Slippage &amp; Execution</h2>
          <p>
            Backtests assume idealized fills. Real execution differs:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Market orders may execute at prices materially worse than the quote at submission</li>
            <li>Stop orders fire at the next available print after the trigger, not at the trigger</li>
            <li>Limit orders may not fill at all if the market moves away</li>
            <li>Partial fills can leave you with unintended position sizes</li>
            <li>Broker, exchange, or feed outages can prevent timely action</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Pattern Day Trader (PDT) Rule — retired June 4, 2026</h2>
          <p>
            FINRA Rule 4210 was amended and the Pattern Day Trader designation
            was retired on June 4, 2026. The $25,000 minimum equity for active
            traders no longer applies (the standard $2,000 margin minimum is
            back), and brokers no longer count day trades against a 5-day
            window. Brokers now apply real-time intraday margin checks
            instead — an order that would create or increase an intraday
            margin deficit can still be rejected. Beacontry&apos;s preemptive
            PDT block was removed alongside the rule; the engine still surfaces
            any broker rejection (margin or otherwise) on the Trader page.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Wash Sales &amp; Tax</h2>
          <p>
            Automated trading often generates wash sales (IRC §1091) that disallow
            losses for tax purposes. Beacontry has wash-sale protection that blocks
            repeat buys on losing exits within 31 calendar days, but the rule itself
            is complex (substantially identical securities, lot-level, IRA-aware).
            Consult a tax professional. Beacontry does not provide tax advice.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">AI &amp; Model Risk</h2>
          <p>
            AI-generated commentary, sentiment scores, and digest summaries are
            opinions of a language model trained on text data. They may be inaccurate,
            outdated, biased, or hallucinated. Do not use AI output as the sole input
            for trade decisions involving real money.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">System Risk</h2>
          <p>
            Beacontry runs on internet infrastructure. Outages, DNS failures, hosting
            issues, database corruption, or version upgrades can interrupt trading
            unexpectedly. Open positions may be exposed during outages because the
            engine cannot adjust stops or exit when it cannot reach the broker.
          </p>
          <p>
            For live trading, configure external monitoring (UptimeRobot or similar)
            pointed at <code className="font-mono text-text-primary">/api/health/engine</code> so
            you know when Beacontry is unreachable.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">You Are the Responsible Party</h2>
          <p>
            Every trade placed through Beacontry — even by the automated engine — is
            attributable to you, not Beacontry. You are responsible for the trades,
            the tax consequences, and any losses. Set risk limits aggressively before
            enabling Live mode and monitor the audit log regularly.
          </p>
        </section>

        <p className="pt-4 border-t border-border text-sm">
          See also:{" "}
          <Link href="/terms" className="text-accent hover:text-accent-hover underline">Terms of Service</Link>
          {" "}·{" "}
          <Link href="/privacy" className="text-accent hover:text-accent-hover underline">Privacy Policy</Link>
          {" "}·{" "}
          <Link href="/contact" className="text-accent hover:text-accent-hover underline">Contact</Link>
        </p>
      </main>
    </div>
  );
}
