import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { SITE_NAV_OFFSET } from "@/components/marketing/site-nav";
import { BAND, SectionHeading } from "@/components/marketing/section-heading";

// Four-tier structure (2026-05-14):
//   Free         research and education (no engine, no AI)
//   Trader $20   full platform without AI (most popular)
//   Premium $40  Trader plus AI and future premium data
//   Self-Hosted  source-available (FSL-1.1), bring your own infra.
//                FSL is "source-available" until each commit converts
//                to Apache 2.0 at two years.
// /pricing is the canonical surface; keep these in step with it.
const TIERS = [
  {
    name: "Free",
    tag: "Hosted",
    price: "$0",
    cadence: "",
    annual: "Public data and education",
    desc: "Browse, learn, research. No trading.",
    features: [
      "All 14 guides and 95 glossary terms",
      "8 financial calculators",
      "Congressional trades and Reddit",
      "SEC filings and earnings calendar",
      "1 watchlist, 10 symbols",
      "Read-only community access",
      "No engine, no AI",
    ],
    cta: "Sign up free",
    href: "/register",
    highlight: false,
  },
  {
    name: "Trader",
    tag: "Most popular",
    price: "$20",
    cadence: "/ month",
    annual: "$200/yr, saves 2 months",
    desc: "The full platform without AI features.",
    features: [
      "Full engine (paper and live trading)",
      "All 8 modes, GA optimizer, adaptive",
      "Multi-broker (up to 3)",
      "Finnhub data (news, sentiment, options)",
      "Audit log, tax center, journal",
      "Unlimited watchlists and alerts",
      "Full community access",
    ],
    cta: "Start with Trader",
    href: "/register",
    highlight: true,
  },
  {
    name: "Premium",
    tag: "AI and future data",
    price: "$40",
    cadence: "/ month",
    annual: "$400/yr, saves 2 months",
    desc: "Trader plus AI and premium data (coming).",
    features: [
      "Everything in Trader, plus:",
      "AI chat assistant (Groq Llama 3.3)",
      "AI signal scoring and journal review",
      "Daily AI market digest",
      "L2 / order book (roadmap)",
      "Real-time SIP feed (roadmap)",
      "Dark pool data (roadmap)",
    ],
    cta: "Step up to Premium",
    href: "/register",
    highlight: false,
  },
  {
    name: "Self-Hosted",
    tag: "Source-available",
    price: "Free",
    cadence: "",
    annual: "Your data, your hardware",
    desc: "Bring your own Postgres, broker and API keys.",
    features: [
      "Source code on GitHub (FSL-1.1)",
      "Same engine, your control",
      "Your own Finnhub, Groq and broker keys",
      "No telemetry, no SaaS lock-in",
      "Privacy-first deployments",
      "Converts to Apache 2.0 after 2 years",
    ],
    cta: "View on GitHub",
    href: "https://github.com/beacontry/Sentinel",
    highlight: false,
  },
];

/**
 * The landing page's pricing glance. The four tiers sit in one ruled
 * grid rather than four floating cards with a badge hanging off one: the
 * recommended tier is marked by its raised fill, the primary button and
 * the words "Most popular", not by a glow.
 */
export function PricingTeaser() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className={`border-y border-border bg-bg-secondary ${SITE_NAV_OFFSET}`}>
      <div className={BAND}>
        <SectionHeading
          id="pricing-title"
          title="Simple pricing"
          lede="Bring your own broker. Annual billing saves about 17%. Cancel anytime."
          action={
            <Link href="/pricing" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              Compare every feature <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />

        <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <li key={tier.name} className={`flex flex-col p-6 lg:p-7 ${tier.highlight ? "bg-bg-surface" : "bg-bg-primary"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-text-primary">{tier.name}</h3>
                <span
                  className={
                    tier.highlight
                      ? "rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent"
                      : "text-xs text-text-muted"
                  }
                >
                  {tier.tag}
                </span>
              </div>
              {/* Two lines reserved, so the four prices share a baseline. */}
              <p className="mt-1 min-h-[2lh] text-sm text-text-secondary">{tier.desc}</p>

              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums leading-none tracking-[-0.03em] text-text-primary">{tier.price}</span>
                {tier.cadence && <span className="text-sm text-text-muted">{tier.cadence}</span>}
              </p>
              <p className="mt-1.5 text-xs text-text-muted">{tier.annual}</p>

              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <ButtonLink href={tier.href} variant={tier.highlight ? "primary" : "secondary"} className="mt-8 w-full">
                {tier.cta}
              </ButtonLink>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm text-text-muted">
          Need team, firm or white-label?{" "}
          <a href="mailto:hello@beacontry.com" className="font-medium text-accent hover:underline">
            Get in touch
          </a>{" "}
          for Team and Enterprise pricing.
        </p>
      </div>
    </section>
  );
}
