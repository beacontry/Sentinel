// schema.org SoftwareApplication markup for the landing page. Surfaced
// in Google rich results and used by AI crawlers to ground answers about
// Beacontry. JSON-LD, not executable JS, so it is safe under the CSP.
export const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Beacontry",
  applicationCategory: "FinanceApplication",
  applicationSubCategory: "Trading intelligence platform",
  operatingSystem: "Web (Chromium, Firefox, Safari) / Self-hosted Docker",
  description:
    "Open-source trading intelligence platform with hybrid signal engine, manual order ticket, tax tooling (wash-sale + §475(f) MTM), and journaled trades on your own Alpaca / IBKR / Tradier brokerage account. Hash-chained audit log. Self-hostable under FSL-1.1-ALv2.",
  url: "https://beacontry.com",
  image: "https://beacontry.com/og-card.png",
  softwareVersion: "v3.1",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description:
        "Research, education, screener, glossary, calculators, public Congress trades.",
    },
    {
      "@type": "Offer",
      name: "Trader",
      price: "20",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "20",
        priceCurrency: "USD",
        billingDuration: "P1M",
        billingIncrement: 1,
      },
      description:
        "Engine, manual order ticket, broker integration, journal, alerts, tax center.",
    },
    {
      "@type": "Offer",
      name: "Premium",
      price: "40",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "40",
        priceCurrency: "USD",
        billingDuration: "P1M",
        billingIncrement: 1,
      },
      description:
        "Everything in Trader + AI commentary + hybrid sentiment + GA optimizer.",
    },
  ],
  author: {
    "@type": "Organization",
    name: "Guard Cyber Solutions LLC",
    url: "https://beacontry.com",
  },
  license: "https://github.com/beacontry/Sentinel/blob/main/LICENSE",
  codeRepository: "https://github.com/beacontry/Sentinel",
  featureList: [
    "Hybrid signal pipeline (technical + sentiment + options flow + analyst + AI scoring + Reddit chatter)",
    "Manual order ticket (market / limit / stop / bracket, share-count or dollar-based)",
    "Automated trading engine with 7 modes (4 base + 2 tactical + 1 adaptive)",
    "Hash-chained audit log",
    "Wash-sale tracking + §475(f) MTM elections",
    "Trade journal with auto-stubs + AI weekly review",
    "Genetic-algorithm strategy optimizer",
    "Multi-broker support (Alpaca, IBKR, Tradier)",
    "14 long-form education guides + 8 calculators + 95 glossary terms",
  ],
};
