// GET /api/me/tier
//
// Returns the authenticated user's current effective subscription tier
// + whether they have an active Stripe customer (i.e., have ever gone
// through Checkout). Used by the client-side <TierGate> wrapper + any
// UI surface that wants to branch on tier (upgrade CTAs for free users,
// "Manage subscription" button for users with a real Stripe sub, etc.).
//
// Always returns 'free' / hasStripeCustomer=false for anonymous traffic
// — gracefully handles the not-logged-in case so landing-page-embedded
// gates work even without an active session.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { getUserTier } from "@/lib/tiers-server";
import { labelFor } from "@/lib/tiers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        tier: "free",
        label: labelFor("free"),
        authenticated: false,
        hasStripeCustomer: false,
        role: null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const tier = await getUserTier(session.userId);

  // Look up stripe_customer_id presence (boolean only — never expose
  // the actual customer ID to the client; it's a non-secret but
  // there's no reason to leak it).
  let hasStripeCustomer = false;
  try {
    const [row] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    hasStripeCustomer = !!row?.stripeCustomerId;
  } catch {
    // Fail-safe: if the lookup blows up, treat as no-customer so the
    // UI doesn't show a Manage button that would 404. The Stripe
    // portal route is the authoritative gate either way.
    hasStripeCustomer = false;
  }

  return NextResponse.json(
    {
      tier,
      label: labelFor(tier),
      authenticated: true,
      hasStripeCustomer,
      // Role is part of the session JWT — no extra DB hit needed. Used
      // by client-side nav filtering to hide admin items from non-admins.
      role: session.role ?? "user",
    },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
