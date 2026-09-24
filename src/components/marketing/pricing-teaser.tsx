import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";

/**
 * The landing page's pricing teaser. /pricing is the canonical pricing
 * surface; this is the quick glance for readers who scroll. Split out of
 * src/app/page.tsx.
 */
export function PricingTeaser() {
  return (
    <>
        {/* ── Pricing ── */}
        <section id="pricing" className="bg-ld-panel py-28 lg:py-28">
          <div className="animate-fade-in-up mx-auto mb-16 max-w-[760px] px-4 text-center">
            <p className="mb-3 eyebrow font-mono text-ld-accent">{"// pricing"}</p>
            <h2 className="text-2xl font-bold leading-tight tracking-[-0.03em] text-balance">
              Simple pricing. Real power.
            </h2>
            <p className="mx-auto mt-4 max-w-[820px] text-lg leading-relaxed text-ld-text-secondary">
              Bring your own broker. Annual saves ~17%. Cancel anytime.
            </p>
          </div>

          <div className="mx-auto grid max-w-[1280px] items-stretch gap-5 px-[var(--gutter)] sm:grid-cols-2 lg:grid-cols-4">
            {/* Four-tier structure (2026-05-14):
                  Free            — research + education (no engine, no AI)
                  Trader $20      — full platform without AI (most popular)
                  Premium $40     — Trader + AI + future premium data
                  Self-Hosted     — source-available (FSL-1.1), BYO infra.
                                    Renamed from "Open Source" 2026-05-14 —
                                    FSL is technically "source-available"
                                    until each commit auto-converts to
                                    Apache 2.0 at 2 years. */}
            {[
              {
                name: "Free",
                tag: "Hosted",
                price: "$0",
                cadence: "",
                annual: "Public data + education",
                desc: "Browse, learn, research. No trading.",
                features: [
                  "All 14 guides + 95 glossary terms",
                  "8 financial calculators",
                  "Congressional trades + Reddit",
                  "SEC filings + earnings calendar",
                  "1 watchlist, 10 symbols",
                  "Read-only community access",
                  "No engine, no AI",
                ],
                cta: "Sign up free",
                highlight: false,
              },
              {
                name: "Trader",
                tag: "Most popular",
                price: "$20",
                cadence: "/ month",
                annual: "$200/yr — saves 2 months",
                desc: "Full platform without AI features.",
                features: [
                  "Full engine (paper + live trading)",
                  "All 8 modes + GA optimizer + adaptive",
                  "Multi-broker (up to 3)",
                  "Finnhub data (news, sentiment, options)",
                  "Audit log + tax center + journal",
                  "Unlimited watchlists + alerts",
                  "Full community access",
                ],
                cta: "Start with Trader",
                highlight: true,
              },
              {
                name: "Premium",
                tag: "AI + future data",
                price: "$40",
                cadence: "/ month",
                annual: "$400/yr — saves 2 months",
                desc: "Trader + AI + premium data (coming).",
                features: [
                  "Everything in Trader, plus:",
                  "AI chat assistant (Groq Llama 3.3)",
                  "AI signal scoring + journal review",
                  "Daily AI market digest",
                  "L2 / order book (roadmap)",
                  "Real-time SIP feed (roadmap)",
                  "Dark pool data (roadmap)",
                ],
                cta: "Step up to Premium",
                highlight: false,
              },
              {
                name: "Self-Hosted",
                tag: "Source-available",
                price: "Free",
                cadence: "",
                annual: "Your data, your hardware",
                desc: "BYO Postgres + broker + API keys.",
                features: [
                  "Source code on GitHub (FSL-1.1)",
                  "Same engine, your control",
                  "BYO Finnhub + Groq + broker",
                  "No telemetry, no SaaS lock-in",
                  "Privacy-first deployments",
                  "Auto-converts to Apache 2.0 after 2 years",
                ],
                cta: "View on GitHub",
                highlight: false,
              },
            ].map((tier, i) => (
              <article
                key={tier.name}
                className={`animate-fade-in-up stagger-${i + 1} relative flex flex-col rounded-xl border bg-ld-card p-8 ${
                  tier.highlight
                    ? "border-ld-accent/40 ring-1 ring-ld-accent/20"
                    : "border-ld-border"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ld-accent px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-ld-on-accent">
                    {tier.tag}
                  </div>
                )}
                {!tier.highlight && (
                  <p className="eyebrow font-mono text-ld-text-muted">{tier.tag}</p>
                )}

                <h3 className="mt-3 text-xl font-bold">{tier.name}</h3>
                <p className="mt-2 text-base text-ld-text-secondary">{tier.desc}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold leading-none">{tier.price}</span>
                  {tier.cadence && <span className="text-ld-text-muted">{tier.cadence}</span>}
                </div>
                <p className="mt-1 text-xs text-ld-text-muted">{tier.annual}</p>

                <ul className="mt-6 flex-1 space-y-2.5 text-base">
                  {tier.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-ld-text-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-ld-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <ButtonLink
                  href={tier.name === "Self-Hosted" ? "https://github.com/beacontry/Sentinel" : "/register"}
                  variant={tier.highlight ? "primary" : "secondary"}
                  className="mt-8 text-base"
                >
                  {tier.cta} {tier.name !== "Self-Hosted" && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </ButtonLink>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-[680px] px-4 text-center text-sm text-ld-text-muted">
            Need team / firm / white-label? <a href="mailto:hello@beacontry.com" className="text-ld-accent hover:underline">Get in touch</a> for Team and Enterprise pricing.
          </p>
        </section>
    </>
  );
}
