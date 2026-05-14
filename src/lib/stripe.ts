// Stripe SDK client — lazy-initialized, key from system_config with
// env fallback.
//
// Phase C — Stripe billing integration (2026-05-14).
//
// All callers should use `getStripeClient()` (async) rather than
// instantiating Stripe directly. The lazy pattern means:
//   - We don't crash at boot if Stripe isn't configured yet (free-tier
//     installs can run without billing entirely).
//   - Key rotation via /dashboard/admin/system-config takes effect on
//     the next call after the 60s system-config cache window expires.
//
// Stripe's SDK is heavyweight (~3MB) so we re-use a single instance
// per process. The client is keyed off the resolved API key — if the
// key rotates via system_config, we re-instantiate.
//
// Webhook signature verification uses `getStripeWebhookSecret()`
// rather than the client's API key, since they're separate secrets in
// Stripe. The handler in `/api/webhooks/stripe/route.ts` reads it
// directly via system_config.

import Stripe from "stripe";
import { getStripeSecretKey } from "./system-config";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("stripe");

let cachedClient: Stripe | null = null;
let cachedKey: string | null = null;

/**
 * Returns a Stripe SDK client built off the active secret key. Throws
 * if no key is configured — callers should catch and surface a
 * friendly "billing not configured" error rather than crashing.
 *
 * The cache invalidates whenever the key changes (admin rotated via
 * system-config), so rotation Just Works.
 */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getStripeSecretKey();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not configured. Set via /dashboard/admin/system-config or env."
    );
  }
  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }
  cachedClient = new Stripe(key, {
    // Pin to the API version this SDK was built against. The SDK's
    // type system rejects any other value; bumping the SDK version
    // will surface a typecheck error here so the version change is
    // an explicit decision rather than silent drift.
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "Beacontry",
      version: "0.1.0",
      url: "https://beacontry.com",
    },
    // Stripe API can be flaky on transient network issues; the SDK
    // has built-in retry which we leave on. 2 retries with exponential
    // backoff is the default and matches our other outbound clients.
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  cachedKey = key;
  log.info("Stripe client initialized");
  return cachedClient;
}

/**
 * Stripe-bound error type. Routes catch this and translate to API
 * error envelope (code: BILLING_UNCONFIGURED, retryable: false).
 */
export class BillingNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "Billing is not configured");
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * Helper for routes: try to get the client, return a 503 Response if
 * billing isn't configured. Saves duplicating the try/catch in every
 * route. Returns either { client } on success or { response } on miss.
 */
export async function tryGetStripeClient(): Promise<
  { client: Stripe; response?: undefined } | { client?: undefined; response: Response }
> {
  try {
    const client = await getStripeClient();
    return { client };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn({ err: message }, "Stripe client unavailable");
    return {
      response: new Response(
        JSON.stringify({
          error: {
            code: "BILLING_UNCONFIGURED",
            message:
              "Billing is not yet configured. Try again later or contact support.",
            retryable: true,
          },
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      ),
    };
  }
}
