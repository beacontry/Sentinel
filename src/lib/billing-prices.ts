// Tier ↔ Stripe Price ID mapping.
//
// Phase C (2026-05-14). Sandbox prices created in Stripe Dashboard.
// When flipping to live mode, generate fresh `price_xxx` IDs in live
// mode and override these constants via env vars (which take precedence
// over hardcoded values — see resolvePriceId below).
//
// The four price IDs are the SOURCE OF TRUTH for which Stripe product
// + cadence a user is buying. The Checkout Session POST body validates
// the incoming priceId against this allow-list before forwarding to
// Stripe — prevents an attacker from crafting a Checkout for an
// arbitrary price (like a fake $0.01 Trader subscription).

import type { Tier } from "./tiers";

export type Cadence = "month" | "year";

/**
 * Resolve a `(tier, cadence)` to a Stripe `price_xxx` ID. Env vars
 * override hardcoded values, so live-mode keys can be swapped in
 * without a code change. Returns null for `free` (which isn't a paid
 * product) or for any unrecognized combo.
 */
export function resolvePriceId(tier: Tier, cadence: Cadence): string | null {
  // Free isn't a paid product; nothing to charge.
  if (tier === "free") return null;
  // Enterprise is custom-priced and admin-granted; never goes through
  // self-serve checkout.
  if (tier === "enterprise") return null;

  const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue) return envValue;

  // Hardcoded sandbox defaults from 2026-05-14 setup. These are TEST
  // mode IDs — when flipping to live mode, set the env vars above to
  // override with `price_live_xxx` values.
  if (tier === "trader" && cadence === "month") return "price_1TX6lgJo19Z0AoKhLMkZRLlh";
  if (tier === "trader" && cadence === "year") return "price_1TX6lgJo19Z0AoKh9OgGk7nf";
  if (tier === "premium" && cadence === "month") return "price_1TX6qfJo19Z0AoKhzlEHJPw8";
  if (tier === "premium" && cadence === "year") return "price_1TX6rMJo19Z0AoKhPGFG5cpz";

  return null;
}

/**
 * Reverse lookup — given a Stripe `price_xxx` ID, what tier does it
 * grant? Used by the webhook handler to translate
 * `subscription.items[0].price.id` back to a Beacontry tier.
 *
 * Returns null for unknown price IDs (which means: don't grant any
 * tier; log and skip — fail safe).
 */
export function tierForPriceId(priceId: string): { tier: Tier; cadence: Cadence } | null {
  for (const tier of ["trader", "premium"] as const) {
    for (const cadence of ["month", "year"] as const) {
      if (resolvePriceId(tier, cadence) === priceId) {
        return { tier, cadence };
      }
    }
  }
  return null;
}

/**
 * Validate that a client-supplied priceId is one of our known IDs.
 * Used by the Checkout Session route to prevent abuse (attacker
 * trying to subscribe to a different Stripe Price than we offer).
 */
export function isKnownPriceId(priceId: string): boolean {
  return tierForPriceId(priceId) !== null;
}

/**
 * Display amount for a (tier, cadence) — UI-only. Stripe is the source
 * of truth for actual billing; this is for showing "Upgrade to Trader
 * — $20/mo" on the pricing card. If the amounts in Stripe diverge from
 * these, USERS WILL BE CHARGED WHAT STRIPE SAYS, not what's here.
 *
 * Keep in sync with the Stripe Dashboard or use a build-time script to
 * fetch + verify. For now, hand-maintained.
 */
export function displayPrice(tier: Tier, cadence: Cadence): { amount: number; label: string } | null {
  if (tier === "trader" && cadence === "month") return { amount: 20, label: "$20/mo" };
  if (tier === "trader" && cadence === "year") return { amount: 200, label: "$200/yr" };
  if (tier === "premium" && cadence === "month") return { amount: 40, label: "$40/mo" };
  if (tier === "premium" && cadence === "year") return { amount: 400, label: "$400/yr" };
  return null;
}

/**
 * 7-day trial applies to first-time subscribers to either tier.
 * Configured here so the value is centralized — change once, applies
 * to all checkout sessions.
 */
export const TRIAL_PERIOD_DAYS = 7;
