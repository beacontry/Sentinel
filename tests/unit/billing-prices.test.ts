/**
 * Billing price-ID resolver tests.
 *
 * The price mapping is the security boundary between "checkout
 * sessions" and "what users actually get billed for" — every
 * (tier, cadence) MUST resolve to exactly one known price ID,
 * and only those four IDs are valid for checkout. These tests
 * lock in the contract so a future refactor can't silently
 * grant Premium-on-Trader-pricing or similar.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolvePriceId,
  tierForPriceId,
  isKnownPriceId,
  displayPrice,
  TRIAL_PERIOD_DAYS,
} from "@/lib/billing-prices";

// Hardcoded sandbox price IDs — must match those in
// src/lib/billing-prices.ts. If the file changes, this test should
// fail with a clear message.
const SANDBOX_PRICES = {
  TRADER_MONTH: "price_1TX6lgJo19Z0AoKhLMkZRLlh",
  TRADER_YEAR: "price_1TX6lgJo19Z0AoKh9OgGk7nf",
  PREMIUM_MONTH: "price_1TX6qfJo19Z0AoKhzlEHJPw8",
  PREMIUM_YEAR: "price_1TX6rMJo19Z0AoKhPGFG5cpz",
} as const;

describe("resolvePriceId", () => {
  it("returns null for the free tier (not a paid product)", () => {
    expect(resolvePriceId("free", "month")).toBeNull();
    expect(resolvePriceId("free", "year")).toBeNull();
  });

  it("returns null for the enterprise tier (admin-granted, not self-serve)", () => {
    expect(resolvePriceId("enterprise", "month")).toBeNull();
    expect(resolvePriceId("enterprise", "year")).toBeNull();
  });

  it("resolves trader monthly to the right sandbox price ID", () => {
    expect(resolvePriceId("trader", "month")).toBe(SANDBOX_PRICES.TRADER_MONTH);
  });

  it("resolves trader annual to the right sandbox price ID", () => {
    expect(resolvePriceId("trader", "year")).toBe(SANDBOX_PRICES.TRADER_YEAR);
  });

  it("resolves premium monthly to the right sandbox price ID", () => {
    expect(resolvePriceId("premium", "month")).toBe(SANDBOX_PRICES.PREMIUM_MONTH);
  });

  it("resolves premium annual to the right sandbox price ID", () => {
    expect(resolvePriceId("premium", "year")).toBe(SANDBOX_PRICES.PREMIUM_YEAR);
  });

  describe("env-var override", () => {
    // Module is imported eagerly; we use vi.resetModules() between
    // tests so process.env changes take effect.
    beforeEach(() => {
      vi.resetModules();
    });
    afterEach(() => {
      delete process.env.STRIPE_PRICE_TRADER_MONTH;
      delete process.env.STRIPE_PRICE_PREMIUM_YEAR;
      vi.resetModules();
    });

    it("env STRIPE_PRICE_TRADER_MONTH overrides hardcoded value", async () => {
      process.env.STRIPE_PRICE_TRADER_MONTH = "price_live_override_123";
      const mod = await import("@/lib/billing-prices");
      expect(mod.resolvePriceId("trader", "month")).toBe("price_live_override_123");
    });

    it("env STRIPE_PRICE_PREMIUM_YEAR overrides hardcoded value", async () => {
      process.env.STRIPE_PRICE_PREMIUM_YEAR = "price_live_override_456";
      const mod = await import("@/lib/billing-prices");
      expect(mod.resolvePriceId("premium", "year")).toBe("price_live_override_456");
    });

    it("env overrides DO NOT affect tiers without their corresponding env var", async () => {
      process.env.STRIPE_PRICE_TRADER_MONTH = "price_live_override_123";
      const mod = await import("@/lib/billing-prices");
      // Only trader/month was overridden
      expect(mod.resolvePriceId("trader", "year")).toBe(SANDBOX_PRICES.TRADER_YEAR);
      expect(mod.resolvePriceId("premium", "month")).toBe(SANDBOX_PRICES.PREMIUM_MONTH);
    });
  });
});

describe("tierForPriceId", () => {
  it("maps every sandbox price ID back to its tier + cadence", () => {
    expect(tierForPriceId(SANDBOX_PRICES.TRADER_MONTH)).toEqual({
      tier: "trader",
      cadence: "month",
    });
    expect(tierForPriceId(SANDBOX_PRICES.TRADER_YEAR)).toEqual({
      tier: "trader",
      cadence: "year",
    });
    expect(tierForPriceId(SANDBOX_PRICES.PREMIUM_MONTH)).toEqual({
      tier: "premium",
      cadence: "month",
    });
    expect(tierForPriceId(SANDBOX_PRICES.PREMIUM_YEAR)).toEqual({
      tier: "premium",
      cadence: "year",
    });
  });

  it("returns null for an unknown price ID", () => {
    expect(tierForPriceId("price_fake_123")).toBeNull();
    expect(tierForPriceId("")).toBeNull();
  });

  it("is bijective with resolvePriceId — full round-trip", () => {
    for (const tier of ["trader", "premium"] as const) {
      for (const cadence of ["month", "year"] as const) {
        const priceId = resolvePriceId(tier, cadence);
        expect(priceId).toBeTruthy();
        const back = tierForPriceId(priceId!);
        expect(back).toEqual({ tier, cadence });
      }
    }
  });
});

describe("isKnownPriceId", () => {
  it("returns true for every sandbox price", () => {
    expect(isKnownPriceId(SANDBOX_PRICES.TRADER_MONTH)).toBe(true);
    expect(isKnownPriceId(SANDBOX_PRICES.TRADER_YEAR)).toBe(true);
    expect(isKnownPriceId(SANDBOX_PRICES.PREMIUM_MONTH)).toBe(true);
    expect(isKnownPriceId(SANDBOX_PRICES.PREMIUM_YEAR)).toBe(true);
  });

  it("returns false for any fake or empty input", () => {
    expect(isKnownPriceId("")).toBe(false);
    expect(isKnownPriceId("price_fake")).toBe(false);
    expect(isKnownPriceId("not-even-a-price")).toBe(false);
  });
});

describe("displayPrice", () => {
  it("returns the correct labels for each paid (tier, cadence)", () => {
    expect(displayPrice("trader", "month")).toEqual({ amount: 20, label: "$20/mo" });
    expect(displayPrice("trader", "year")).toEqual({ amount: 200, label: "$200/yr" });
    expect(displayPrice("premium", "month")).toEqual({ amount: 40, label: "$40/mo" });
    expect(displayPrice("premium", "year")).toEqual({ amount: 400, label: "$400/yr" });
  });

  it("returns null for free / enterprise (no self-serve price to display)", () => {
    expect(displayPrice("free", "month")).toBeNull();
    expect(displayPrice("enterprise", "year")).toBeNull();
  });
});

describe("TRIAL_PERIOD_DAYS", () => {
  it("is set to 7 (matches /pricing copy + ToS)", () => {
    expect(TRIAL_PERIOD_DAYS).toBe(7);
  });
});
