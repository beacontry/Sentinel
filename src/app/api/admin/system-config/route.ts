/**
 * Admin-only API for reading and writing encrypted server-wide configuration
 * (LLM/Finnhub/Anthropic API keys).
 *
 *  GET  /api/admin/system-config          → list known keys with last-4 mask
 *  POST /api/admin/system-config { key, value } → encrypt + upsert + audit
 *
 * Never returns plaintext values. Every POST emits a SYSTEM_CONFIG_UPDATED
 * audit row whose metadata records the key name + actor + whether a prior
 * value existed — but never the value itself.
 */

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { listConfig, setConfig, isKnownKey, KNOWN_KEYS } from "@/lib/system-config";
import { createRouteLogger } from "@/lib/logger";
import { z } from "zod";

const log = createRouteLogger("admin/system-config");

const writeSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1).max(2048),
});

// ─── GET: list all keys (masked) ──────────────────────────────────

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const entries = await listConfig();
    return NextResponse.json({ entries, knownKeys: KNOWN_KEYS });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "Failed to list system_config"
    );
    return NextResponse.json({ error: "Failed to list configuration" }, { status: 500 });
  }
}

// ─── POST: set/replace a key ──────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = writeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { key, value } = parsed.data;
  if (!isKnownKey(key)) {
    return NextResponse.json(
      { error: `Unknown key: ${key}. Allowed: ${KNOWN_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await setConfig(
      key,
      value,
      {
        userId: auth.userId,
        email: auth.email ?? null,
        role: auth.role ?? null,
      },
      request
    );
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : "unknown", key },
      "Failed to set system_config"
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save configuration" },
      { status: 500 }
    );
  }
}
