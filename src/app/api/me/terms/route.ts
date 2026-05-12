// GET   /api/me/terms — { accepted, version, acceptedAt, current }
// POST  /api/me/terms — mark the current TERMS_VERSION accepted

import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TERMS_VERSION } from "@/lib/terms-version";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("terms");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await db
      .select({
        version: users.termsAcceptedVersion,
        acceptedAt: users.termsAcceptedAt,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    const accepted = !!row?.version && row.version === TERMS_VERSION;

    return NextResponse.json(
      {
        accepted,
        version: row?.version ?? null,
        acceptedAt: row?.acceptedAt ?? null,
        current: TERMS_VERSION,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Terms fetch error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  try {
    await db
      .update(users)
      .set({
        termsAcceptedAt: new Date(),
        termsAcceptedVersion: TERMS_VERSION,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId));

    // Audit log — having a tamper-evident record matters for any future
    // dispute about who accepted what when.
    await writeAudit({
      actor: { userId: auth.userId, email: auth.email, role: auth.role },
      action: AuditAction.USER_PROFILE_UPDATED,
      resourceType: "terms",
      resourceId: auth.userId,
      metadata: { version: TERMS_VERSION, action: "accepted" },
      request,
    });

    return NextResponse.json({ success: true, version: TERMS_VERSION });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Terms accept error");
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
