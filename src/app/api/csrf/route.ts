import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateCsrfToken } from "@/lib/csrf";

/** GET /api/csrf — Get a CSRF token (sets cookie + returns token in body) */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await generateCsrfToken();
  return NextResponse.json({ token }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
