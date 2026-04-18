import { NextRequest, NextResponse } from "next/server";

/**
 * Validate the x-trader-secret header against TRADER_SECRET env var.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function validateTraderSecret(request: NextRequest): NextResponse | null {
  const secret = request.headers.get("x-trader-secret");
  const expected = process.env.TRADER_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
