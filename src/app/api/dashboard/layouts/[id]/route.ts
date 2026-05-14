import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { dashboardLayouts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  renameDashboardLayoutSchema,
  updateDashboardLayoutSchema,
} from "@/lib/validators";
import { isValidWidgetId } from "@/lib/widget-registry";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("dashboard-layout-detail");

// UUID v4 sanity check — drizzle blows up on malformed UUIDs with a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── GET /api/dashboard/layouts/[id] — fetch a specific layout ───────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid layout id" }, { status: 400 });
  }

  try {
    const [layout] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.userId, session.userId)
          )
        )
        .limit(1);
    });

    if (!layout) {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    // Normalize the same way the default endpoint does
    let widgets: Array<{ id: string; size?: string }> = [];
    try {
      const data = layout.layoutData as { widgets?: unknown };
      if (Array.isArray(data?.widgets)) {
        widgets = data.widgets.map((w: unknown) =>
          typeof w === "string" ? { id: w } : (w as { id: string; size?: string })
        );
      }
    } catch {
      widgets = [];
    }

    return NextResponse.json(
      {
        id: layout.id,
        name: layout.name,
        isDefault: layout.isDefault,
        widgets,
      },
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
    log.error({ err: message, layoutId: id }, "Dashboard layout fetch error");
    return NextResponse.json(
      { error: "Failed to load layout" },
      { status: 500 }
    );
  }
}

// ─── PATCH /api/dashboard/layouts/[id] — update name, widgets, or default ───
//
// Body may contain any combination of:
//   { name?: string, widgets?: WidgetEntry[], setDefault?: true }
//
// If setDefault=true is sent, the prior default is demoted atomically. Sending
// setDefault=false on the layout that is currently the default is a no-op (a
// user always needs exactly one default — to "clear" one, switch to another
// layout instead).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;
  const tierFail = await checkTier(auth.userId, "trader");
  if (tierFail) return tierFail;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid layout id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate each provided field independently — none are required.
  let nextName: string | undefined;
  if ("name" in body) {
    const parsed = renameDashboardLayoutSchema.safeParse({ name: body.name });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    nextName = parsed.data.name;
  }

  let nextWidgets: Array<{ id: string; size?: string }> | undefined;
  if ("widgets" in body) {
    const parsed = updateDashboardLayoutSchema.safeParse({
      widgets: body.widgets,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
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
    const seen = new Map<string, { id: string; size?: string }>();
    for (const e of entries) seen.set(e.id, e);
    nextWidgets = Array.from(seen.values());
  }

  const setDefault = body.setDefault === true;

  if (nextName === undefined && nextWidgets === undefined && !setDefault) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Confirm the row belongs to this user before mutating
      const [target] = await tx
        .select({ id: dashboardLayouts.id, isDefault: dashboardLayouts.isDefault })
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.userId, auth.userId)
          )
        )
        .limit(1);
      if (!target) {
        throw new Error("NOT_FOUND");
      }

      if (setDefault && !target.isDefault) {
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

      const updates: Record<string, unknown> = {};
      if (nextName !== undefined) updates.name = nextName;
      if (nextWidgets !== undefined) updates.layoutData = { widgets: nextWidgets };
      if (setDefault) updates.isDefault = true;

      const [updated] = await tx
        .update(dashboardLayouts)
        .set(updates)
        .where(eq(dashboardLayouts.id, id))
        .returning({
          id: dashboardLayouts.id,
          name: dashboardLayouts.name,
          isDefault: dashboardLayouts.isDefault,
        });

      return updated;
    });

    return NextResponse.json({ success: true, layout: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }
    log.error({ err: message, layoutId: id }, "Dashboard layout update error");
    return NextResponse.json(
      { error: "Failed to update layout" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/dashboard/layouts/[id] ──────────────────────────────
//
// Deleting the default layout promotes the next-most-recent one to default
// (if any) so the user always has a layout to fall back to. If the user's
// last layout is deleted, the GET /api/dashboard/layout endpoint will fall
// back to the hardcoded DEFAULT_LAYOUT.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid layout id" }, { status: 400 });
  }

  try {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select({
          id: dashboardLayouts.id,
          isDefault: dashboardLayouts.isDefault,
        })
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.id, id),
            eq(dashboardLayouts.userId, auth.userId)
          )
        )
        .limit(1);
      if (!target) {
        throw new Error("NOT_FOUND");
      }

      await tx
        .delete(dashboardLayouts)
        .where(eq(dashboardLayouts.id, id));

      // Promote the most-recently-created remaining layout to default
      if (target.isDefault) {
        const [next] = await tx
          .select({ id: dashboardLayouts.id })
          .from(dashboardLayouts)
          .where(eq(dashboardLayouts.userId, auth.userId))
          .orderBy(dashboardLayouts.createdAt)
          .limit(1);
        if (next) {
          await tx
            .update(dashboardLayouts)
            .set({ isDefault: true })
            .where(eq(dashboardLayouts.id, next.id));
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }
    log.error({ err: message, layoutId: id }, "Dashboard layout delete error");
    return NextResponse.json(
      { error: "Failed to delete layout" },
      { status: 500 }
    );
  }
}
