import { NextResponse } from "next/server";

// Deprecated — positions are now sourced directly from the broker API.
// Kept as a stub to return 410 Gone to any lingering external callers.

export async function POST() {
  return NextResponse.json(
    { error: "Deprecated — positions are now sourced directly from the broker API" },
    { status: 410 }
  );
}
