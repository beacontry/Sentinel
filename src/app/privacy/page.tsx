// Public Privacy Policy. Same shell shape as /terms and /risk.
// Plain language; lists exactly what data we collect, why, who we
// share it with, and how users can delete it. Required before
// accepting payments in most jurisdictions; trust signal for a
// finance app regardless.

import Link from "next/link";
import { Radar, Shield } from "lucide-react";
import { TERMS_VERSION } from "@/lib/terms-version";
import { LEGAL_ENTITY, formatAddressOneLine } from "@/lib/legal-entity";

export const metadata = {
  title: "Privacy Policy — Beacontry",
  description:
    "What data Beacontry collects, why, who we share it with, and how to delete it. Plain-language summary plus the full policy.",
  alternates: { canonical: "https://beacontry.com/privacy" },
};

export default function PrivacyPage() {
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
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-accent/22 bg-accent/10 px-3 py-1">
            <Shield className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Privacy
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">Privacy Policy</h1>
          <p className="text-xs text-text-muted mt-1 font-mono">
            Last updated: {TERMS_VERSION}
          </p>
        </div>

        {/* Data controller identity — required by CCPA/CDPA/CPA/etc. for
            US state privacy laws and by GDPR Article 13 once we accept
            EU/UK customers. Up top so a regulator (or curious user)
            doesn't have to scroll. */}
        <section className="rounded-xl border border-border bg-bg-elevated p-5 space-y-2">
          <h2 className="text-base font-semibold text-text-primary">Who controls your data</h2>
          <p className="text-[0.92rem]">
            The data controller for personal information processed by Beacontry is{" "}
            <strong className="text-text-primary">{LEGAL_ENTITY.name}</strong>, a{" "}
            {LEGAL_ENTITY.formationState} limited liability company doing business as{" "}
            &quot;{LEGAL_ENTITY.tradeName}.&quot; Mailing address: {formatAddressOneLine()}.
          </p>
          <p className="text-[0.92rem]">
            For privacy requests (access, deletion, export, correction), email{" "}
            <a
              href={`mailto:${LEGAL_ENTITY.privacyEmail}?subject=${LEGAL_ENTITY.privacySubject}`}
              className="text-accent hover:text-accent-hover underline"
            >
              {LEGAL_ENTITY.privacyEmail}
            </a>{" "}
            with subject line &quot;{LEGAL_ENTITY.privacySubject}.&quot; We respond
            within 30 days.
          </p>
        </section>

        {/* Plain-language summary — the actual policy follows in case
            anyone wants the lawyered version. The summary is what 99% of
            users actually want to know. */}
        <section className="rounded-xl border border-border bg-bg-surface p-5 space-y-2">
          <h2 className="text-base font-semibold text-text-primary">In plain language</h2>
          <ul className="space-y-1.5 text-[0.92rem] list-disc list-inside marker:text-text-muted">
            <li>We collect: your email, name, password (hashed), broker API keys (encrypted), and the trades you make on Beacontry.</li>
            <li>We do <strong className="text-text-primary">not</strong> sell your data. Ever.</li>
            <li>We share data only with: Stripe (billing), Resend (email), Cloudflare (DNS/CDN), Groq (AI processing of public market questions you submit). Each is contractually bound to use the data only to serve us.</li>
            <li>You can delete your account from settings; data is removed within 30 days. Backups expire after another 30.</li>
            <li>We do not run ads, embed third-party trackers, or share usage data with marketing networks.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">1. What we collect</h2>
          <p>
            <strong className="text-text-primary">Account data.</strong> Email, name,
            bcrypt-hashed password, optional MFA secret (encrypted), self-attested
            tax status (e.g. §475(f) MTM election year).
          </p>
          <p>
            <strong className="text-text-primary">Broker connections.</strong> API keys
            for Alpaca, IBKR, or Tradier — encrypted with AES-256-GCM in our database
            and never logged in plaintext. The encryption key is held server-side; we
            decrypt only when placing orders for you.
          </p>
          <p>
            <strong className="text-text-primary">Trading activity.</strong> Trade
            history (entries, exits, P&amp;L), engine signals, watchlists, journal
            entries, alert rules, support tickets, audit log (hash-chained record of
            privileged actions on your account).
          </p>
          <p>
            <strong className="text-text-primary">Payment data.</strong> Stripe holds
            card details — we never see them. We store only the Stripe Customer ID
            and the subscription tier in our DB.
          </p>
          <p>
            <strong className="text-text-primary">Usage signals.</strong> IP address
            (for rate-limiting), User-Agent (for debugging device-specific bugs),
            session timestamps. Standard server logs purged after 14 days.
          </p>
          <p>
            <strong className="text-text-primary">No tracking pixels, no third-party
            analytics, no ad networks.</strong> We use Cloudflare Web Analytics for
            traffic counts (privacy-preserving — no cookies, no per-user data) and
            our own pino-structured request logs for ops.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">2. Why we collect it</h2>
          <p>
            All collection is for the service to function: email for sign-in and
            transactional mail (invites, password reset, support replies, daily
            digest if you opted in), broker keys to place orders, trade history to
            show you what you did, audit log for security and dispute resolution.
            We do not enrich your profile, score you for marketing, or feed your
            data to anyone&apos;s ML training set.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">3. Sub-processors (who we share data with)</h2>
          <p>
            Beacontry uses third-party services to deliver the product. Each is
            contractually bound to use the data only to serve us:
          </p>
          <ul className="space-y-1 list-disc list-inside marker:text-text-muted">
            <li><strong className="text-text-primary">Stripe</strong> — payment processing. Receives: card details (directly from your browser, never via our servers), email, subscription metadata. Their privacy policy: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">stripe.com/privacy</a></li>
            <li><strong className="text-text-primary">Resend</strong> — transactional email. Receives: your email + the message content (invites, password reset links, support replies, digest if opted in). Their privacy policy: <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">resend.com/legal/privacy-policy</a></li>
            <li><strong className="text-text-primary">Cloudflare</strong> — DNS, CDN, DDoS protection, edge TLS. Sees: your IP and request metadata. Their privacy policy: <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">cloudflare.com/privacypolicy</a></li>
            <li><strong className="text-text-primary">Groq</strong> — AI model inference. Receives: prompts you submit to the AI chat (we strip your name + email before forwarding). Their privacy policy: <a href="https://groq.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">groq.com/privacy-policy</a></li>
            <li><strong className="text-text-primary">Your broker</strong> (Alpaca, IBKR, or Tradier) — receives order instructions you authorize. We talk to their APIs only; the relationship between you and them is governed by your separate brokerage agreement.</li>
          </ul>
          <p>
            We do not share data with advertising networks, data brokers, or marketing
            platforms. If we ever add a new sub-processor, it will appear in this list
            and the date stamp at the top will move.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">4. Data retention</h2>
          <p>
            We retain your account data for as long as you have an active account.
            Audit log entries (the hash-chained record of privileged actions) are
            retained indefinitely — they&apos;re cryptographically linked, so
            deleting old rows would break the chain&apos;s tamper-evidence guarantee.
          </p>
          <p>
            Server logs (request logs, error logs) are purged after 14 days. Email
            delivery logs at Resend are retained per their policy (typically 30
            days). Stripe retains transaction records per their regulatory
            obligations (multiple years).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">5. Your rights (deletion, export, correction)</h2>
          <p>
            <strong className="text-text-primary">Delete</strong>: from
            <Link href="/dashboard/settings" className="text-accent hover:text-accent-hover underline"> /dashboard/settings</Link>{" "}
            (or email{" "}
            <a href="mailto:hello@beacontry.com" className="text-accent hover:text-accent-hover underline">hello@beacontry.com</a>).
            Your data is purged from production within 30 days. Encrypted backups
            roll off the standard retention schedule (~30 additional days). Audit
            log entries referencing your user_id are anonymized but the rows
            remain for chain integrity.
          </p>
          <p>
            <strong className="text-text-primary">Export</strong>: trades and
            journal entries are exportable as CSV from the dashboard. For a full
            account export (everything we have about you), email us and we&apos;ll
            put a JSON dump together within 30 days.
          </p>
          <p>
            <strong className="text-text-primary">Correct</strong>: most fields
            (name, email, password, preferences) are user-editable from the
            dashboard. For anything that requires admin intervention, open a
            support ticket.
          </p>
          <p>
            EU and UK residents have rights under GDPR; California residents have
            rights under CCPA. The deletion and export paths above satisfy both.
            Email{" "}
            <a href="mailto:hello@beacontry.com" className="text-accent hover:text-accent-hover underline">hello@beacontry.com</a>{" "}
            with subject line &quot;GDPR&quot; or &quot;CCPA&quot; for any specific
            request not covered by the dashboard tools.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">6. Security</h2>
          <p>
            All connections are TLS 1.2+. Passwords are bcrypt-hashed (cost 12).
            Broker API keys are AES-256-GCM encrypted at rest with a server-side
            key. Database access is restricted to the application server; no public
            ingress. Session cookies are HttpOnly + Secure + SameSite=Strict.
            Mutating endpoints require CSRF tokens; auth endpoints are rate-limited.
            The audit log is hash-chained for tamper evidence.
          </p>
          <p>
            We will notify affected users within 72 hours of confirming any
            security incident that compromises personal data. If you spot a
            vulnerability, email{" "}
            <a href="mailto:hello@beacontry.com" className="text-accent hover:text-accent-hover underline">hello@beacontry.com</a>{" "}
            with subject &quot;Security&quot; and we&apos;ll respond within one
            business day.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">7. Children</h2>
          <p>
            Beacontry is not directed to people under 18. We do not knowingly
            collect data from minors. If you believe a minor has registered an
            account, email us and we&apos;ll delete it promptly.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-text-primary">8. Changes</h2>
          <p>
            This policy may change as we add or remove sub-processors or features.
            Material changes will be announced in-app and via email to active
            subscribers. The date at the top of this page reflects the current
            text.
          </p>
        </section>

        <p className="pt-4 border-t border-border text-sm">
          See also:{" "}
          <Link href="/terms" className="text-accent hover:text-accent-hover underline">Terms of Service</Link>
          {" "}·{" "}
          <Link href="/risk" className="text-accent hover:text-accent-hover underline">Risk Disclosure</Link>
          {" "}·{" "}
          <Link href="/contact" className="text-accent hover:text-accent-hover underline">Contact</Link>
        </p>
      </main>
    </div>
  );
}
