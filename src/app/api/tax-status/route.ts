import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { userTaxStatus } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
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
 *   mtmElectionYear?: number | null,
 *   notes?: string | null
 * }
 *
 * An omitted mtmElectionYear or notes leaves the stored value unchanged; an
 * explicit null clears it. A caller that never loaded the row (the trader
 * page's MTM checkbox after a failed status read) therefore cannot wipe the
 * user's notes or rewrite a prior election year by re-asserting the flag.
 *
 * mtmDeclaredAt is set the first time mtmElectionYear becomes non-null and
 * kept on later writes (COALESCE), cleared only with the year itself.
 * Pure self-attestation. We don't validate against IRS rules.
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
  // undefined = leave the stored year alone; null = clear it.
  const yearProvided = body.mtmElectionYear !== undefined;
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

  // undefined = leave the stored notes alone; null = clear them.
  if (
    body.notes !== undefined &&
    body.notes !== null &&
    typeof body.notes !== "string"
  ) {
    return NextResponse.json(
      { error: "notes must be a string or null" },
      { status: 400 },
    );
  }
  const notesProvided = body.notes !== undefined;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;

  // Keep the first declaration date across re-asserts; clear it only with
  // the year.
  const declaredAt =
    mtmElectionYear !== null
      ? sql`COALESCE(${userTaxStatus.mtmDeclaredAt}, now())`
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
          ...(yearProvided ? { mtmElectionYear, mtmDeclaredAt: declaredAt } : {}),
          ...(notesProvided ? { notes } : {}),
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
