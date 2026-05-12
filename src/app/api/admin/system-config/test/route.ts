/**
 * POST /api/admin/system-config/test
 *   body: { key, value }
 *
 * Smoke-tests a candidate API key against the live provider WITHOUT
 * persisting it. Used by the admin UI's "Test before save" button so an
 * admin can verify a pasted key works before committing it.
 *
 * Returns { ok: true } on success, { ok: false, error: "..." } on failure.
 * Never logs or stores the candidate value.
 */

import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { testConfig, isKnownKey, KNOWN_KEYS } from "@/lib/system-config";
import { z } from "zod";

const schema = z.object({
  key: z.string().min(1),
  value: z.string().min(1).max(2048),
});

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { key, value } = parsed.data;
  if (!isKnownKey(key)) {
    return NextResponse.json(
      { ok: false, error: `Unknown key. Allowed: ${KNOWN_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await testConfig(key, value);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
