import { SiteNav, LANDING_NAV_LINKS } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingFeatures, LandingProcess, LandingPlatform } from "@/components/marketing/landing-capabilities";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { LandingTrust, LandingClosing } from "@/components/marketing/landing-trust";
import { LANDING_JSON_LD } from "@/components/marketing/landing-json-ld";

/**
 * The public landing page. It composes the sections in
 * src/components/marketing/; only the nav holds client state, so the
 * page itself renders on the server.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-primary font-[family-name:var(--font-display)] text-text-primary">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LANDING_JSON_LD) }} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteNav links={LANDING_NAV_LINKS} />
      <main id="main" tabIndex={-1} className="outline-hidden">
        <LandingHero />
        <LandingFeatures />
        <LandingProcess />
        <LandingPlatform />
        <PricingTeaser />
        <LandingTrust />
        <LandingClosing />
      </main>
      <SiteFooter />
    </div>
  );
}
