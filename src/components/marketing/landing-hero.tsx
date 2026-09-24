import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { EquityMockup } from "@/components/marketing/equity-mockup";

const HERO_POINTS = [
  "Automated or manual",
  "Self-optimizing strategies",
  "Hash-chained audit log",
  "Tax and journal built in",
];

// Every figure here is also stated elsewhere on the page or in the
// pricing tiers; "Real-Time" and "Automated" were adjectives set as stats.
const FACTS = [
  { value: "500+", label: "Symbols monitored by the screener" },
  { value: "8", label: "Engine modes, from conservative to tactical" },
  { value: "3", label: "Brokers: Alpaca, Tradier and IBKR" },
  { value: "FSL-1.1", label: "Source-available on GitHub" },
];

/**
 * The first screen: the claim and the two ways in on the left, the product
 * picture on the right, and a strip of facts closing the band.
 *
 * Left-aligned at every width. The product illustration replaces the old
 * "What Beacontry does" checklist card, whose four items repeated the
 * features below it; a picture of the thing says more than a fifth list.
 */
export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="border-b border-border">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] items-center gap-12 px-[var(--gutter)] pb-14 pt-[calc(4rem+env(safe-area-inset-top)+2.5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:pb-20 lg:pt-[calc(4rem+5rem)]">
        <div className="animate-fade-in-up">
          <p className="eyebrow text-accent">Automated engine · Manual ticket</p>

          <h1 id="hero-title" className="mt-4 text-display font-bold tracking-[-0.04em] text-balance text-text-primary">
            Scan. Signal. Execute. <span className="text-accent">Automatically.</span>
          </h1>

          <p className="mt-5 max-w-[38rem] text-base text-text-secondary lg:text-lg">
            Beacontry monitors the market, generates confidence-scored trading signals, and routes
            them either through the automated engine or to a manual order ticket. Your choice, your
            broker, every decision inspectable.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" className="px-6">
              Get started free
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" className="px-6">
              Sign in
            </ButtonLink>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-text-secondary sm:grid-cols-2">
            {HERO_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <EquityMockup />
      </div>

      <div className="border-t border-border bg-bg-secondary">
        <dl className="mx-auto grid max-w-[1280px] grid-cols-2 gap-px px-[var(--gutter)] lg:grid-cols-4">
          {FACTS.map((fact) => (
            <div key={fact.value} className="flex min-w-0 flex-col-reverse justify-end gap-1 py-6 pr-4 lg:py-8">
              <dt className="text-sm text-text-muted">{fact.label}</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums text-text-primary">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
