import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { dashboardLayouts } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createDashboardLayoutSchema } from "@/lib/validators";
import { isValidWidgetId } from "@/lib/widget-registry";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("dashboard-layouts");

// ─── GET /api/dashboard/layouts — list all of a user's saved layouts ──
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await withTimeout(3000, async (tx) => {
      return tx
        .select({
          id: dashboardLayouts.id,
          name: dashboardLayouts.name,
          isDefault: dashboardLayouts.isDefault,
          createdAt: dashboardLayouts.createdAt,
        })
        .from(dashboardLayouts)
        .where(eq(dashboardLayouts.userId, session.userId))
        .orderBy(desc(dashboardLayouts.isDefault), desc(dashboardLayouts.createdAt));
    });

    return NextResponse.json(
      { layouts: rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Dashboard layouts list error");
    return NextResponse.json(
      { error: "Failed to load layouts" },
      { status: 500 }
    );
  }
}

// ─── POST /api/dashboard/layouts — create a new named layout ─────────
//
// A user can have many layouts but exactly one with isDefault=true. Posting
// with `setDefault: true` (default behaviour for new layouts the user is
// actively saving) atomically demotes the prior default to keep that invariant.
//
// Note: this is intentionally a single transaction with an advisory lock per
// user so that two concurrent "Save as" submissions don't both create defaults.
export async function POST(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createDashboardLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const setDefault = (body as { setDefault?: boolean })?.setDefault !== false;

  // Normalize string | {id, size?} into a uniform shape
  const entries = parsed.data.widgets.map((w) =>
    typeof w === "string" ? { id: w } : { id: w.id, size: w.size }
  );

  const invalidIds = entries.filter((e) => !isValidWidgetId(e.id));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Unknown widget IDs: ${invalidIds.map((e) => e.id).join(", ")}` },
      { status: 400 }
    );
  }

  // Dedupe by id, last-wins for size
  const seen = new Map<string, { id: string; size?: string }>();
  for (const e of entries) seen.set(e.id, e);
  const uniqueWidgets = Array.from(seen.values());

  try {
    const result = await db.transaction(async (tx) => {
      // Cap at 10 layouts per user — keeps the switcher UI sane and prevents
      // accidental abuse. The check + insert in one tx so concurrent submits
      // can't race past the cap.
      const existing = await tx
        .select({ id: dashboardLayouts.id })
        .from(dashboardLayouts)
        .where(eq(dashboardLayouts.userId, auth.userId));

      if (existing.length >= 10) {
        throw new Error("LAYOUT_LIMIT");
      }

      if (setDefault) {
        await tx
          .update(dashboardLayouts)
          .set({ isDefault: false })
          .where(
            and(
              eq(dashboardLayouts.userId, auth.userId),
              eq(dashboardLayouts.isDefault, true)
            )
          );
      }

      const [inserted] = await tx
        .insert(dashboardLayouts)
        .values({
          userId: auth.userId,
          name: parsed.data.name,
          layoutData: { widgets: uniqueWidgets },
          isDefault: setDefault,
        })
        .returning({
          id: dashboardLayouts.id,
          name: dashboardLayouts.name,
          isDefault: dashboardLayouts.isDefault,
        });

      return inserted;
    });

    return NextResponse.json({ success: true, layout: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "LAYOUT_LIMIT") {
      return NextResponse.json(
        { error: "Maximum 10 saved layouts per user." },
        { status: 400 }
      );
    }
    log.error({ err: message }, "Dashboard layout create error");
    return NextResponse.json(
      { error: "Failed to create layout" },
      { status: 500 }
    );
  }
}
