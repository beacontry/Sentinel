// POST /api/billing/portal
//
// Creates a Stripe Customer Portal Session and returns the URL. The
// portal is a Stripe-hosted page where the user can:
//   - Update their card on file
//   - Cancel their subscription (at period end, not immediate)
//   - View past invoices
//   - Switch plans (Trader ↔ Premium, monthly ↔ annual) — provided
//     the prices are listed in the portal config in Stripe Dashboard
//
// User must already have a Stripe customer (i.e. has gone through
// checkout at least once). If not, we return a hint to upgrade first.

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { requireAuthWithCsrf } from "@/lib/auth";
import { tryGetStripeClient } from "@/lib/stripe";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("billing/portal");

export async function POST(request: NextRequest) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const stripeRes = await tryGetStripeClient();
  if (stripeRes.response) return stripeRes.response;
  const stripe = stripeRes.client;

  try {
    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user?.stripeCustomerId) {
      // Free user trying to "manage subscription" — point them at the
      // upgrade path. UX: the billing page itself should branch on
      // user tier and not show the Manage button to free users; this
      // is the API-layer safety net.
      return NextResponse.json(
        {
          error: {
            code: "NO_SUBSCRIPTION",
            message: "You don't have an active subscription. Upgrade first via /pricing.",
            retryable: false,
            details: { upgradeUrl: "/pricing" },
          },
        },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://beacontry.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/dashboard/billing`,
    });

    log.info(
      { userId: auth.userId, customerId: user.stripeCustomerId },
      "Customer Portal session created"
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, userId: auth.userId }, "Portal session failed");
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL",
          message: "Could not open billing portal. Try again later.",
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}
