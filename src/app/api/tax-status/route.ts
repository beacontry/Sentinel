import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { userTaxStatus } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("tax-status");

/**
 * GET /api/tax-status — return user's self-attested trader tax / MTM state.
 * Returns defaults (all false / null) for users who haven't set anything.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [row] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(userTaxStatus)
        .where(eq(userTaxStatus.userId, session.userId))
        .limit(1);
    });

    if (!row) {
      return NextResponse.json({
        hasTraderTaxStatus: false,
        mtmElectionYear: null,
        mtmDeclaredAt: null,
        notes: null,
      });
    }

    return NextResponse.json({
      hasTraderTaxStatus: row.hasTraderTaxStatus,
      mtmElectionYear: row.mtmElectionYear,
      mtmDeclaredAt: row.mtmDeclaredAt?.toISOString() ?? null,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Tax status fetch failed");
    return NextResponse.json(
      { error: "Failed to load tax status" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/tax-status — upsert user's self-attested status.
 * Body: {
 *   hasTraderTaxStatus: boolean,
 *   mtmElectionYear: number | null,
 *   notes: string | null
 * }
 *
 * mtmDeclaredAt is set automatically the first time mtmElectionYear becomes
 * non-null. Pure self-attestation — we don't validate against IRS rules.
 */
export async function PUT(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: {
    hasTraderTaxStatus?: unknown;
    mtmElectionYear?: unknown;
    notes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasTraderTaxStatus = body.hasTraderTaxStatus === true;
  const mtmElectionYear =
    body.mtmElectionYear === null || body.mtmElectionYear === undefined
      ? null
      : Number(body.mtmElectionYear);

  if (
    mtmElectionYear !== null &&
    (!Number.isInteger(mtmElectionYear) ||
      mtmElectionYear < 1990 ||
      mtmElectionYear > 2100)
  ) {
    return NextResponse.json(
      { error: "mtmElectionYear must be a 4-digit year between 1990-2100" },
      { status: 400 },
    );
  }

  const notes =
    typeof body.notes === "string"
      ? body.notes.slice(0, 1000)
      : body.notes === null
        ? null
        : null;

  try {
    const [row] = await db
      .insert(userTaxStatus)
      .values({
        userId: auth.userId,
        hasTraderTaxStatus,
        mtmElectionYear,
        mtmDeclaredAt: mtmElectionYear !== null ? new Date() : null,
        notes,
      })
      .onConflictDoUpdate({
        target: userTaxStatus.userId,
        set: {
          hasTraderTaxStatus,
          mtmElectionYear,
          // Only update mtmDeclaredAt the FIRST time election year goes non-null
          mtmDeclaredAt: mtmElectionYear !== null ? new Date() : null,
          notes,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({
      hasTraderTaxStatus: row.hasTraderTaxStatus,
      mtmElectionYear: row.mtmElectionYear,
      mtmDeclaredAt: row.mtmDeclaredAt?.toISOString() ?? null,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Tax status update failed");
    return NextResponse.json(
      { error: "Failed to save tax status" },
      { status: 500 },
    );
  }
}
