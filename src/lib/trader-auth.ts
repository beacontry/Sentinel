import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "./crypto";

/**
 * Validate the x-trader-secret header against TRADER_SECRET env var.
 * Uses constant-time comparison to prevent timing attacks.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function validateTraderSecret(request: NextRequest): NextResponse | null {
  const secret = request.headers.get("x-trader-secret");
  const expected = process.env.TRADER_SECRET;
  if (!expected || !secret || !safeCompare(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
