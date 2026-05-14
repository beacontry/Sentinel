// POST /api/billing/checkout
//
// Creates a Stripe Checkout Session for the authenticated user and
// returns the session URL. The browser then navigates to Stripe-hosted
// checkout where the user enters card details.
//
// Stripe (not Beacontry) handles all card collection, 3DS, SCA, etc.
// We never see or store card numbers; we just supply (customer,
// price ID, success/cancel URLs) and Stripe does the rest.
//
// On successful checkout, Stripe fires `checkout.session.completed`
// to /api/webhooks/stripe — that's where the tier actually gets
// granted in our DB. The redirect-back to /dashboard/billing?success=1
// is just a UX hint; the source of truth is the webhook.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { requireAuthWithCsrf } from "@/lib/auth";
import { tryGetStripeClient } from "@/lib/stripe";
import {
  isKnownPriceId,
  tierForPriceId,
  TRIAL_PERIOD_DAYS,
} from "@/lib/billing-prices";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("billing/checkout");

const checkoutSchema = z.object({
  priceId: z.string().startsWith("price_").max(64),
  /** Optional: where to send the user after success. Defaults to /dashboard/billing?success=1. */
  successUrl: z.string().url().optional(),
  /** Optional: where to send the user on cancel. Defaults to /dashboard/billing?canceled=1. */
  cancelUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  // Validate body
  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Invalid request body",
          retryable: false,
          details: { issues: parsed.error.flatten() },
        },
      },
      { status: 400 }
    );
  }

  const { priceId, successUrl, cancelUrl } = parsed.data;

  // Defense in depth: only our known price IDs are allowed. Without
  // this, an attacker could craft a checkout for a fake $0.01 Trader
  // price they created in a different Stripe account. (Not possible
  // since Stripe rejects cross-account price IDs, but belt + suspenders.)
  if (!isKnownPriceId(priceId)) {
    log.warn({ priceId, userId: auth.userId }, "Unknown priceId in checkout request");
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Unknown price ID. Visit /pricing for valid plans.",
          retryable: false,
        },
      },
      { status: 400 }
    );
  }

  // Get Stripe client (returns 503 if not configured)
  const stripeRes = await tryGetStripeClient();
  if (stripeRes.response) return stripeRes.response;
  const stripe = stripeRes.client;

  try {
    // Load user — need email for customer creation, current
    // stripe_customer_id to re-use existing customer if any.
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "User not found", retryable: false } },
        { status: 404 }
      );
    }

    // Create-or-reuse Stripe Customer. Idempotent because subsequent
    // calls find the existing ID. Race-safe because the DB column is
    // unique-indexed; concurrent inserts would conflict, and we'd
    // re-load on retry.
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name ?? undefined,
        metadata: { beacontry_user_id: user.id },
      });
      customerId = customer.id;
      await db
        .update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, user.id));
      log.info({ userId: user.id, customerId }, "Created Stripe customer");
    }

    // Where to send the user after success/cancel. Default to the
    // dashboard billing page; allow client override for flexibility.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://beacontry.com";
    const success = successUrl ?? `${baseUrl}/dashboard/billing?success=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = cancelUrl ?? `${baseUrl}/dashboard/billing?canceled=1`;

    // Resolve tier from priceId for metadata — helps the webhook
    // handler and audit log later.
    const resolved = tierForPriceId(priceId);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: {
          beacontry_user_id: user.id,
          beacontry_tier: resolved?.tier ?? "",
          beacontry_cadence: resolved?.cadence ?? "",
        },
      },
      success_url: success,
      cancel_url: cancel,
      // Cards only for v1. Apple/Google Pay come "free" but locking to
      // card simplifies test-mode flows. Re-enable wallets later by
      // removing this line — Stripe will auto-add them.
      payment_method_types: ["card"],
      // Allow promotion codes (so a future "BEACON25" coupon Just Works)
      allow_promotion_codes: true,
      // Address: collect for invoice receipts. Required if/when we
      // re-enable Stripe Tax below.
      billing_address_collection: "auto",
      // NOTE: automatic_tax + customer_update intentionally OFF.
      //
      // Stripe Tax requires the merchant to be activated in their
      // Tax dashboard AND have nexus declared per state — neither is
      // configured in the sandbox. Enabling automatic_tax against an
      // unactivated account returns "stripe_tax_inactive" errors.
      //
      // Re-enable both lines when going live and Stripe Tax is set up:
      //   automatic_tax: { enabled: true },
      //   customer_update: { address: "auto", name: "auto" },
      // For now Beacontry handles tax responsibility manually (or via
      // the user's own jurisdiction — most retail-trader SaaS customers
      // pay sales tax on their own state's terms).
    });

    log.info(
      {
        userId: user.id,
        sessionId: session.id,
        priceId,
        tier: resolved?.tier,
      },
      "Checkout session created"
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Pull out as much Stripe-specific context as possible. Stripe
    // errors come as instances of Stripe.errors.StripeError which
    // carry .type, .code, .raw.message, etc. Surfacing the type to
    // the client (NOT the message — that can leak account-specific
    // info) lets the UI distinguish recoverable errors (rate-limit,
    // network) from non-recoverable ones (invalid price, missing
    // tax config).
    const stripeErr = err as {
      type?: string;
      code?: string;
      message?: string;
      raw?: { message?: string; code?: string };
    };
    const stripeMessage =
      stripeErr.raw?.message ?? stripeErr.message ?? "Unknown error";
    const stripeType = stripeErr.type ?? "unknown_error";
    const stripeCode = stripeErr.code ?? stripeErr.raw?.code ?? null;

    log.error(
      {
        err: stripeMessage,
        stripeType,
        stripeCode,
        userId: auth.userId,
        priceId,
      },
      "Checkout session failed"
    );

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL",
          message: "Could not create checkout session. Try again or contact support.",
          retryable: true,
          details: {
            // Surface Stripe's category to the browser so admins can
            // debug from devtools. Not sensitive — Stripe error types
            // are documented in their public API reference.
            stripeType,
            stripeCode,
          },
        },
      },
      { status: 500 }
    );
  }
}
