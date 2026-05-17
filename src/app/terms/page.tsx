// Public ToS page. Linked from the footer of every dashboard page and
// from the acceptance modal. Self-contained — no auth required. Plain
// language; nothing here that needs to be hidden or per-user.

import Link from "next/link";
import { Radar } from "lucide-react";
import { TERMS_VERSION } from "@/lib/terms-version";
import { LEGAL_ENTITY, formatAddressOneLine } from "@/lib/legal-entity";

export const metadata = {
  title: "Terms of Service — Beacontry",
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
          <h1 className="text-2xl font-semibold text-text-primary">Terms of Service</h1>
          <p className="text-xs text-text-muted mt-1 font-mono">
            Last updated: {TERMS_VERSION}
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">1. What Beacontry Is</h2>
          <p>
            Beacontry is a software tool for analyzing markets, journaling trades, and
            (optionally) automating order placement through your own brokerage account.
            Beacontry does not custody assets, hold funds, or execute trades on its own
            books — every order is placed through the brokerage API you configure
            (currently Alpaca, Tradier, or Interactive Brokers).
          </p>
          <p>
            &quot;Beacontry&quot; is a registered trade name of{" "}
            <strong className="text-text-primary">{LEGAL_ENTITY.name}</strong>, a{" "}
            {LEGAL_ENTITY.formationState} limited liability company with its principal
            office at {formatAddressOneLine()}. In these Terms, &quot;Beacontry,&quot;
            &quot;we,&quot; &quot;us,&quot; and &quot;our&quot; refer to{" "}
            {LEGAL_ENTITY.name}.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">2. Not Financial Advice</h2>
          <p>
            Signals, AI-generated commentary, optimizer outputs, model portfolios,
            backtest results, and any other information produced by Beacontry are
            <strong className="text-text-primary"> for informational purposes only</strong>.
            Nothing in Beacontry is investment advice, brokerage advice, legal advice,
            tax advice, or a recommendation to buy or sell any security. Beacontry is
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
            and any device that accesses Beacontry secure. Broker API keys are encrypted
            at rest in Beacontry&apos;s database, but if your account is compromised,
            anyone with access can place orders on your linked brokerage.
          </p>
          <p>
            Rotate API keys promptly if you suspect exposure. Beacontry will not be
            liable for losses resulting from compromised credentials, lost devices,
            or unauthorized access to your account.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">4. Automated Trading</h2>
          <p>
            The trading engine places real orders on your broker when enabled in Live
            mode. Beacontry implements multiple safeguards (position limits, daily-loss
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
            Beacontry uses third-party AI services (currently Groq running Llama
            3.3) to summarize market data, score sentiment, and generate the daily
            digest. AI outputs can be inaccurate, hallucinated, biased, or outdated.
            Treat them as commentary, not facts. Verify anything material before
            acting on it.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">6. Service Availability</h2>
          <p>
            Beacontry is provided &quot;as is.&quot; The service may be unavailable,
            degraded, or interrupted for maintenance, infrastructure issues, or
            upstream dependency outages. Beacontry will not be liable for losses or
            missed opportunities resulting from service downtime.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">7. Data Use</h2>
          <p>
            Beacontry stores your account data (email, encrypted broker keys, watchlists,
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
          <h2 className="text-base font-semibold text-text-primary">8. Subscriptions &amp; Billing</h2>
          <p>
            Beacontry offers a free tier (research, education, calculators, public
            data) and paid tiers (Trader, Premium) that unlock the trading engine,
            broker integration, AI chat, and other premium features. Paid plans bill
            monthly or annually through Stripe. Pricing is shown on{" "}
            <Link href="/pricing" className="text-accent hover:text-accent-hover underline">/pricing</Link>{" "}
            and may change with advance notice to active subscribers (current
            subscribers retain their existing rate through the end of their current
            billing period).
          </p>
          <p>
            Beacontry never sees or stores your card details — Stripe holds them.
            Charges appear on your statement as &quot;Beacontry&quot; or
            &quot;BEACONTRY.COM&quot; depending on your card issuer.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">9. Cancellation</h2>
          <p>
            You can cancel a paid subscription at any time from{" "}
            <Link href="/dashboard/billing" className="text-accent hover:text-accent-hover underline">/dashboard/billing</Link>{" "}
            or via the Stripe Customer Portal. Cancellation takes effect at the end
            of your current billing period — you keep paid-tier access until then.
            We do not lock your data behind the subscription; downgrading to free
            retains your watchlists, journal, trade history, and broker connection
            (broker access still requires a Trader-tier plan to use the engine).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">10. Refunds</h2>
          <p>
            <strong className="text-text-primary">First 30 days</strong>: full refund
            on request, no questions asked. Email{" "}
            <a href="mailto:hello@beacontry.com" className="text-accent hover:text-accent-hover underline">hello@beacontry.com</a>{" "}
            or open a support ticket from your dashboard. Refunds process to the
            original payment method within 5–10 business days via Stripe.
          </p>
          <p>
            <strong className="text-text-primary">After 30 days</strong>: prorated
            refunds for unused portions of an annual plan, evaluated case-by-case.
            Monthly plans are not refundable after 30 days but can be cancelled to
            stop future billing.
          </p>
          <p>
            <strong className="text-text-primary">Free trial</strong>: cancel before
            the trial ends (you&apos;ll get an email reminder 24 hours before
            conversion) and you won&apos;t be charged. Cancellation during the trial
            is immediate, not at trial end.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">11. Payment Disputes</h2>
          <p>
            If you have a billing question or believe a charge is incorrect, email{" "}
            <a href="mailto:hello@beacontry.com" className="text-accent hover:text-accent-hover underline">hello@beacontry.com</a>{" "}
            within 60 days of the charge and we&apos;ll investigate. We
            ask that you contact us before initiating a chargeback — chargebacks
            cost Beacontry $15+ in fees regardless of outcome and we&apos;d rather
            issue you a refund directly. Repeated chargebacks without prior contact
            may result in account suspension.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">12. Governing Law &amp; Venue</h2>
          <p>
            These Terms are governed by the laws of the State of{" "}
            {LEGAL_ENTITY.governingLaw.state}, without regard to its
            conflict-of-laws principles. Any dispute arising out of or relating to
            these Terms, the Service, or your use of Beacontry will be brought
            exclusively in the state or federal courts located in{" "}
            {LEGAL_ENTITY.governingLaw.venueCounty},{" "}
            {LEGAL_ENTITY.governingLaw.state}, and you and {LEGAL_ENTITY.name}{" "}
            consent to personal jurisdiction in those courts.
          </p>
          <p>
            Nothing in this section limits either party&apos;s right to seek
            injunctive relief in any court of competent jurisdiction to protect
            its intellectual property or confidential information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">13. Changes</h2>
          <p>
            These terms may change. Material changes will prompt you to re-accept
            on next sign-in. The version stamp at the top reflects the current text.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">14. About Us</h2>
          <p>
            Beacontry is operated by{" "}
            <strong className="text-text-primary">{LEGAL_ENTITY.name}</strong>,
            a {LEGAL_ENTITY.formationState} limited liability company.
          </p>
          <p className="font-mono text-sm leading-relaxed">
            {LEGAL_ENTITY.name}
            <br />
            {LEGAL_ENTITY.address.street}
            <br />
            {LEGAL_ENTITY.address.city}, {LEGAL_ENTITY.address.state}{" "}
            {LEGAL_ENTITY.address.zip}
            <br />
            {LEGAL_ENTITY.address.country}
          </p>
          <p>
            General inquiries:{" "}
            <a
              href={`mailto:${LEGAL_ENTITY.contactEmail}`}
              className="text-accent hover:text-accent-hover underline"
            >
              {LEGAL_ENTITY.contactEmail}
            </a>
          </p>
        </section>

        <p className="pt-4 border-t border-border text-sm">
          See also:{" "}
          <Link href="/risk" className="text-accent hover:text-accent-hover underline">Risk Disclosure</Link>
          {" "}·{" "}
          <Link href="/privacy" className="text-accent hover:text-accent-hover underline">Privacy Policy</Link>
          {" "}·{" "}
          <Link href="/contact" className="text-accent hover:text-accent-hover underline">Contact</Link>
        </p>
      </main>
    </div>
  );
}
