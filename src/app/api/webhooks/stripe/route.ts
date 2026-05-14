// POST /api/webhooks/stripe
//
// Stripe webhook receiver. Stripe POSTs lifecycle events here whenever
// something changes on a subscription, invoice, or checkout session.
//
// This is the SOURCE OF TRUTH for tier grants — the success redirect
// after Checkout is just a UX hint. Without this webhook running,
// users would pay but never get their tier upgraded.
//
// Three correctness properties this handler MUST satisfy:
//
//   1. SIGNATURE VERIFICATION. Stripe signs every webhook with
//      `Stripe-Signature` header (HMAC over the raw body using the
//      webhook signing secret). We use `constructEvent()` from the
//      Stripe SDK to verify. Without this, anyone can POST forged
//      events to /api/webhooks/stripe and grant themselves Premium.
//
//   2. IDEMPOTENCY. Stripe retries failed webhooks for up to 3 days
//      AND sometimes delivers the same event twice in quick succession
//      for at-least-once semantics. We dedup via the unique event ID
//      (`evt_xxx`) into the `stripe_events_processed` table — second
//      delivery of the same event returns 200 immediately without
//      re-applying side effects.
//
//   3. NEVER BREAK ON UNKNOWN EVENTS. Stripe occasionally introduces
//      new event types. We handle the 6 we registered for; anything
//      else returns 200 (acknowledged) and logs. Returning 5xx makes
//      Stripe retry, which wastes their resources + ours.
//
// CSRF: this route is INTENTIONALLY exempt from CSRF (Stripe doesn't
// know about our CSRF tokens; the signature header is the auth).
// `pathIsCsrfExempt()` in csrf-init.tsx already includes /api/webhooks/.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { stripeEventsProcessed } from "@/lib/db/schema/stripe";
import { getStripeClient } from "@/lib/stripe";
import { getStripeWebhookSecret } from "@/lib/system-config";
import { tierForPriceId } from "@/lib/billing-prices";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";
import type Stripe from "stripe";
import type { Tier } from "@/lib/tiers";

const log = createRouteLogger("webhooks/stripe");

// Allow up to 30s — webhook handlers should be fast but Stripe waits
// up to 30s before considering it failed and retrying.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Stripe requires the raw (unparsed) body for signature verification.
  // Next.js gives us the raw body via request.text().
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    log.warn("Webhook received without Stripe-Signature header");
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Missing signature", retryable: false } },
      { status: 400 }
    );
  }

  // Resolve webhook signing secret. If unset, we can't verify — return
  // 503 so Stripe retries (rather than 200, which would silently drop
  // events).
  const webhookSecret = await getStripeWebhookSecret();
  if (!webhookSecret) {
    log.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: { code: "BILLING_UNCONFIGURED", message: "Webhook secret not set", retryable: true } },
      { status: 503 }
    );
  }

  // Verify signature + parse event. Throws on invalid signature or
  // expired timestamp (Stripe's tolerance window is 5 minutes by default).
  let event: Stripe.Event;
  try {
    const stripe = await getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn({ err: message }, "Webhook signature verification failed");
    // 400 — not 500 — so Stripe doesn't retry an unverifiable event.
    return NextResponse.json(
      { error: { code: "INVALID_SIGNATURE", message: "Signature verification failed", retryable: false } },
      { status: 400 }
    );
  }

  // Idempotency check — INSERT-OR-CONFLICT-DO-NOTHING on event ID.
  // If insert returns 0 rows, the event was already processed; ack
  // and return.
  const inserted = await db
    .insert(stripeEventsProcessed)
    .values({
      eventId: event.id,
      eventType: event.type,
      // userId + actionTaken filled in by handlers below if applicable
    })
    .onConflictDoNothing()
    .returning({ eventId: stripeEventsProcessed.eventId });

  if (inserted.length === 0) {
    log.info({ eventId: event.id, type: event.type }, "Duplicate webhook event ignored");
    return NextResponse.json({ received: true, deduped: true });
  }

  // Process the event. Wrap in try/catch so handler bugs don't 5xx
  // (which would make Stripe retry indefinitely on a bug).
  try {
    const result = await handleEvent(event);

    // Update the audit row with what we did
    if (result.userId || result.actionTaken) {
      await db
        .update(stripeEventsProcessed)
        .set({ userId: result.userId ?? null, actionTaken: result.actionTaken ?? null })
        .where(eq(stripeEventsProcessed.eventId, event.id));
    }

    log.info(
      { eventId: event.id, type: event.type, action: result.actionTaken, userId: result.userId },
      "Webhook processed"
    );
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, eventId: event.id, type: event.type }, "Webhook handler error");
    // Return 200 anyway — the event IS recorded as processed (in our
    // idempotency table), and Stripe retrying would just hit the
    // dedup. Better to investigate via logs than spin retry storms.
    return NextResponse.json({ received: true, error: "handler_failed" });
  }
}

/** What the handler did, for audit trail. */
interface HandlerResult {
  userId?: string | null;
  actionTaken?: string;
}

async function handleEvent(event: Stripe.Event): Promise<HandlerResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);

    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionChange(event.data.object as Stripe.Subscription, event.type);

    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

    case "invoice.payment_succeeded":
      return handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);

    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);

    default:
      // Unhandled event type — Stripe might send these because the
      // dashboard subscription drifted, or because we added an event
      // type we don't yet process. Ack but log so we notice.
      log.warn({ eventType: event.type }, "Unhandled Stripe event type");
      return { actionTaken: "ignored_unknown_event" };
  }
}

/**
 * Resolve our internal user from a Stripe Customer ID. Returns null if
 * the customer isn't linked to a user (shouldn't happen, but possible
 * if customer was created out-of-band).
 */
async function findUserByStripeCustomer(customerId: string): Promise<{
  id: string;
  email: string;
  tier: string;
} | null> {
  const [user] = await db
    .select({ id: users.id, email: users.email, tier: users.tier })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return user ?? null;
}

/**
 * checkout.session.completed — user just finished paying. Source of
 * truth for tier grant. Both this AND customer.subscription.created
 * will fire (in either order); idempotency dedup ensures we only
 * grant once.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<HandlerResult> {
  if (session.mode !== "subscription") {
    return { actionTaken: "ignored_non_subscription_checkout" };
  }
  if (!session.customer || typeof session.customer !== "string") {
    return { actionTaken: "ignored_no_customer" };
  }
  if (!session.subscription) {
    return { actionTaken: "ignored_no_subscription" };
  }

  const user = await findUserByStripeCustomer(session.customer);
  if (!user) {
    log.warn({ customerId: session.customer }, "Checkout completed but customer not linked");
    return { actionTaken: "no_user_link" };
  }

  // Look up the subscription to get the price ID — checkout.session
  // doesn't always include it directly.
  const stripe = await getStripeClient();
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subId);

  return applyTierFromSubscription(user, subscription, "checkout_completed");
}

/**
 * customer.subscription.created / .updated — apply the tier on every
 * relevant lifecycle change.
 */
async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  eventType: string
): Promise<HandlerResult> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const user = await findUserByStripeCustomer(customerId);
  if (!user) {
    return { actionTaken: "no_user_link" };
  }
  return applyTierFromSubscription(user, subscription, eventType);
}

/**
 * customer.subscription.deleted — subscription fully ended. Revert
 * the user to free tier. (Note: cancellations scheduled for the end
 * of the billing period are subscription.updated with
 * `cancel_at_period_end: true`, NOT subscription.deleted. The user
 * still has paid access until period end; we don't downgrade them
 * yet. .deleted fires when the period actually ends.)
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<HandlerResult> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const user = await findUserByStripeCustomer(customerId);
  if (!user) {
    return { actionTaken: "no_user_link" };
  }

  await db
    .update(users)
    .set({
      tier: "free",
      tierChangedAt: new Date(),
      tierExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await writeAudit({
    actor: { userId: user.id, email: user.email },
    action: AuditAction.USER_TIER_CHANGED,
    resourceType: "user",
    resourceId: user.id,
    metadata: {
      from: user.tier,
      to: "free",
      reason: "subscription_deleted",
      manual: false,
      stripeSubscriptionId: subscription.id,
    },
  });

  return { userId: user.id, actionTaken: "downgraded_to_free" };
}

/** Extend tier_expires_at on successful renewal. */
async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<HandlerResult> {
  if (!invoice.customer || typeof invoice.customer !== "string") {
    return { actionTaken: "ignored_no_customer" };
  }
  const user = await findUserByStripeCustomer(invoice.customer);
  if (!user) {
    return { actionTaken: "no_user_link" };
  }

  // Re-resolve from the subscription so we get the canonical
  // current_period_end + price.
  const subscriptionField = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (!subscriptionField) {
    return { actionTaken: "ignored_no_subscription" };
  }
  const stripe = await getStripeClient();
  const subId = typeof subscriptionField === "string" ? subscriptionField : subscriptionField.id;
  const subscription = await stripe.subscriptions.retrieve(subId);
  return applyTierFromSubscription(user, subscription, "invoice_payment_succeeded");
}

/** Card declined on renewal — log and (for now) leave tier intact.
 * Stripe handles dunning automatically; if it fails after retries
 * it'll fire customer.subscription.deleted which we handle above. */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<HandlerResult> {
  if (!invoice.customer || typeof invoice.customer !== "string") {
    return { actionTaken: "ignored_no_customer" };
  }
  const user = await findUserByStripeCustomer(invoice.customer);
  if (!user) {
    return { actionTaken: "no_user_link" };
  }

  // Future: send the user a "card declined" email here. For v1 we
  // rely on Stripe's built-in customer email notifications (enabled
  // in Stripe Dashboard → Settings → Customer emails).
  log.warn(
    { userId: user.id, invoiceId: invoice.id },
    "Invoice payment failed — Stripe will retry"
  );

  return { userId: user.id, actionTaken: "payment_failed_logged" };
}

/**
 * Shared tier-grant logic. Reads the active price from the subscription's
 * first item, maps to our tier, writes to the DB + audit.
 */
async function applyTierFromSubscription(
  user: { id: string; email: string; tier: string },
  subscription: Stripe.Subscription,
  reason: string
): Promise<HandlerResult> {
  // Stripe Subscription has items.data[0].price.id as the active price.
  // For our setup, every sub has exactly one item (one plan at a time).
  const item = subscription.items.data[0];
  if (!item?.price?.id) {
    log.warn({ subscriptionId: subscription.id }, "Subscription has no price item");
    return { userId: user.id, actionTaken: "no_price_item" };
  }
  const resolved = tierForPriceId(item.price.id);
  if (!resolved) {
    log.warn(
      { subscriptionId: subscription.id, priceId: item.price.id },
      "Subscription price not in our tier mapping"
    );
    return { userId: user.id, actionTaken: "unknown_price" };
  }

  let newTier: Tier = resolved.tier;
  // Subscription status drives whether the tier is active. Stripe states:
  //   - trialing: in the 7-day trial — grant tier
  //   - active: paid + active — grant tier
  //   - past_due: payment failed but Stripe still retrying — keep tier
  //   - canceled: ended (handled by .deleted webhook usually, but
  //     subscription.updated can also fire with status=canceled)
  //   - unpaid / incomplete / incomplete_expired: never granted tier
  // tier_expires_at is set to current_period_end so that if Stripe
  // stops talking to us, the user automatically drops to free at the
  // right boundary (via effectiveTier() in tiers.ts).
  const periodEndUnix = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  let tierExpiresAt: Date | null = null;
  switch (subscription.status) {
    case "trialing":
    case "active":
    case "past_due":
      tierExpiresAt = periodEnd;
      break;
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      // Don't grant — set tier back to free
      newTier = "free";
      tierExpiresAt = null;
      break;
    default:
      // Unknown status — be conservative, don't change anything
      log.warn(
        { subscriptionId: subscription.id, status: subscription.status },
        "Unknown subscription status; not changing tier"
      );
      return { userId: user.id, actionTaken: "unknown_status" };
  }

  await db
    .update(users)
    .set({
      tier: newTier,
      tierChangedAt: new Date(),
      tierExpiresAt,
    })
    .where(eq(users.id, user.id));

  await writeAudit({
    actor: { userId: user.id, email: user.email },
    action: AuditAction.USER_TIER_CHANGED,
    resourceType: "user",
    resourceId: user.id,
    metadata: {
      from: user.tier,
      to: newTier,
      reason,
      manual: false,
      stripeSubscriptionId: subscription.id,
      stripePriceId: item.price.id,
      cadence: resolved.cadence,
      subscriptionStatus: subscription.status,
      tierExpiresAt: tierExpiresAt?.toISOString() ?? null,
    },
  });

  return {
    userId: user.id,
    actionTaken: `granted_${newTier}_via_${reason}`,
  };
}
