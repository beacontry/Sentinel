// GET /api/me/tier
//
// Returns the authenticated user's current effective subscription tier.
// Used by the client-side <TierGate> wrapper + any UI surface that
// wants to branch on tier (show upgrade CTAs to free users, etc.).
//
// Always returns 'free' for anonymous traffic — gracefully handles
// the not-logged-in case so landing-page-embedded gates work even
// without an active session.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserTier, labelFor } from "@/lib/tiers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { tier: "free", label: labelFor("free"), authenticated: false },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const tier = await getUserTier(session.userId);
  return NextResponse.json(
    { tier, label: labelFor(tier), authenticated: true },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
