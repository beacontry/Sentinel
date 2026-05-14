// Public contact page. Two paths inline:
//
//   - Anonymous: prominent mailto link to hello@beacontry.com (handled
//     by Cloudflare Email Routing → forwards to admin inbox via the
//     shared GuardCyber catch-all). No form here intentionally; a
//     full guest-ticket flow would need a schema change to make
//     support_tickets.user_id nullable, which isn't worth the surface
//     area for what mailto solves.
//   - Logged-in: link to /dashboard/support (existing ticketed flow).
//
// Server-rendered. No JS, no client state, no auth check — the
// server can't reliably know auth state on a public page without
// pulling session cookies, so we render both paths and let the
// reader pick. (The "Already have an account" link is the cue.)

import type { Metadata } from "next";
import Link from "next/link";
import { Radar, Mail, MessageSquare, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact — Beacontry",
  description:
    "Get in touch with Beacontry support. Email hello@beacontry.com or open a ticket from your dashboard.",
  alternates: { canonical: "https://beacontry.com/contact" },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-secondary">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-text-primary hover:text-accent transition-colors"
          >
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

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Get in touch
          </h1>
          <p className="text-text-secondary mt-2 leading-relaxed">
            Real humans read every email. Expect a reply within one business day
            for support tickets and within two for general inquiries.
          </p>
        </div>

        {/* Email — primary path */}
        <section className="rounded-xl border border-border bg-bg-surface p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Mail className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-text-primary mb-1">
                Email
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-3">
                Best path for: account problems, billing questions, bug reports,
                press / partnership inquiries, anything else. Replies come from
                a real address you can reply back to.
              </p>
              <a
                href="mailto:hello@beacontry.com?subject=Beacontry%20inquiry"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <Mail className="h-4 w-4" />
                hello@beacontry.com
              </a>
            </div>
          </div>
        </section>

        {/* Dashboard support tickets — for logged-in users */}
        <section className="rounded-xl border border-border bg-bg-surface p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-text-primary mb-1">
                Support tickets <span className="text-text-muted text-[0.78rem] font-normal">— for active users</span>
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mb-3">
                Signed in already? The ticket system in the dashboard
                automatically threads replies, surfaces a status badge, and
                pre-fills your account info so we can dig into account-specific
                issues faster.
              </p>
              <Link
                href="/dashboard/support"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm font-semibold text-text-primary hover:bg-bg-hover hover:border-border-hover transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                Open a ticket
                <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
              </Link>
            </div>
          </div>
        </section>

        {/* Security disclosure callout */}
        <section className="rounded-xl border border-warning/22 bg-warning/[0.06] p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-1.5">
            Security disclosures
          </h2>
          <p className="text-[0.88rem] text-text-secondary leading-relaxed">
            Found a security issue? Email{" "}
            <a
              href="mailto:hello@beacontry.com?subject=Security%20disclosure"
              className="text-accent hover:text-accent-hover underline"
            >
              hello@beacontry.com
            </a>{" "}
            with subject &quot;Security&quot;. We respond within one business day
            and credit researchers in the audit log when fixes ship.
          </p>
        </section>

        {/* Self-serve links */}
        <section className="rounded-xl border border-border bg-bg-surface p-6">
          <h2 className="text-base font-semibold text-text-primary mb-3">
            Self-serve
          </h2>
          <ul className="grid sm:grid-cols-2 gap-2 text-[0.92rem]">
            <li>
              <Link href="/pricing" className="text-accent hover:text-accent-hover underline">
                Pricing
              </Link>
              <span className="text-text-muted"> — plans + features</span>
            </li>
            <li>
              <Link href="/learn" className="text-accent hover:text-accent-hover underline">
                Learn
              </Link>
              <span className="text-text-muted"> — guides + glossary</span>
            </li>
            <li>
              <Link href="/terms" className="text-accent hover:text-accent-hover underline">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-accent hover:text-accent-hover underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/risk" className="text-accent hover:text-accent-hover underline">
                Risk Disclosure
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/beacontry/Sentinel"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover underline"
              >
                Source code
              </a>
              <span className="text-text-muted"> — FSL-1.1-ALv2</span>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
