import { NextResponse } from "next/server";
import { getSession, requireAuthWithCsrf } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { dashboardLayouts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { updateDashboardLayoutSchema } from "@/lib/validators";
import { DEFAULT_LAYOUT, isValidWidgetId } from "@/lib/widget-registry";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("dashboard-layout");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [layout] = await withTimeout(3000, async (tx) => {
      return tx
        .select()
        .from(dashboardLayouts)
        .where(
          and(
            eq(dashboardLayouts.userId, session.userId),
            eq(dashboardLayouts.isDefault, true)
          )
        )
        .limit(1);
    });

    if (layout) {
      let widgets: string[] = [];
      try {
        const data = layout.layoutData as { widgets?: string[] };
        widgets = Array.isArray(data?.widgets) ? data.widgets : DEFAULT_LAYOUT;
      } catch {
        widgets = DEFAULT_LAYOUT;
      }

      return NextResponse.json(
        { widgets, saved: true },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    return NextResponse.json(
      { widgets: DEFAULT_LAYOUT, saved: false },
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
    log.error({ err: message }, "Dashboard layout load error");
    return NextResponse.json(
      { error: "Failed to load layout" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateDashboardLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Validate all widget IDs exist in the registry
  const invalidIds = parsed.data.widgets.filter((id) => !isValidWidgetId(id));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: `Unknown widget IDs: ${invalidIds.join(", ")}` },
      { status: 400 }
    );
  }

  // Deduplicate while preserving order
  const uniqueWidgets = [...new Set(parsed.data.widgets)];

  try {
    // Check if a default layout exists
    const [existing] = await db
      .select({ id: dashboardLayouts.id })
      .from(dashboardLayouts)
      .where(
        and(
          eq(dashboardLayouts.userId, auth.userId),
          eq(dashboardLayouts.isDefault, true)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(dashboardLayouts)
        .set({ layoutData: { widgets: uniqueWidgets } })
        .where(eq(dashboardLayouts.id, existing.id));
    } else {
      await db.insert(dashboardLayouts).values({
        userId: auth.userId,
        name: "Default",
        layoutData: { widgets: uniqueWidgets },
        isDefault: true,
      });
    }

    return NextResponse.json({ success: true, widgets: uniqueWidgets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Dashboard layout save error");
    return NextResponse.json(
      { error: "Failed to save layout" },
      { status: 500 }
    );
  }
}
