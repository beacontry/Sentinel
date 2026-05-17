// Admin-only endpoint returning external-API usage aggregates.
// Powers the API Usage card on /dashboard/admin/system-config.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageSummary, getUsageWindow } from "@/lib/api-usage";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("admin/api-usage");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const daysBack = Math.min(
    Math.max(parseInt(url.searchParams.get("daysBack") ?? "30", 10) || 30, 1),
    90
  );

  try {
    const [summary, window] = await Promise.all([
      getUsageSummary(),
      getUsageWindow(daysBack),
    ]);
    return NextResponse.json({ summary, window, daysBack });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "API usage fetch failed");
    return NextResponse.json(
      { error: "Failed to load API usage" },
      { status: 500 }
    );
  }
}
