import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/audit/verify");

/**
 * POST /api/admin/audit/verify
 *
 * Walks the entire audit_log table, recomputing each row's hash and checking
 * that prev_hash links chain correctly. Returns null/intact on success or
 * the first row where the chain breaks.
 *
 * Walking 100k rows takes ~2s and is admin-on-demand — not a hot path.
 */
export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request, ["admin"]);
  if (auth instanceof Response) return auth;

  try {
    const result = await verifyAuditChain();
    if (result === null) {
      return NextResponse.json({ ok: true, intact: true });
    }
    log.error({ result }, "Audit chain verification failed");
    return NextResponse.json({ ok: true, intact: false, break: result });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "Audit chain verification error");
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
