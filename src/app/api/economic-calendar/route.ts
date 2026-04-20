import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEconomicCalendar } from "@/lib/economic-events";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("economic-calendar");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  // Default range: 7 days ago to 30 days from now
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const defaultTo = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const from = params.get("from") ?? defaultFrom;
  const to = params.get("to") ?? defaultTo;

  // Validate date formats
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Validate from < to
  if (from > to) {
    return NextResponse.json(
      { error: "from must be before to" },
      { status: 400 }
    );
  }

  // Validate max range (365 days)
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const maxRangeMs = 365 * 86400000;
  if (toMs - fromMs > maxRangeMs) {
    return NextResponse.json(
      { error: "Date range must not exceed 365 days" },
      { status: 400 }
    );
  }

  try {
    const events = await getEconomicCalendar(from, to);

    return NextResponse.json(
      { events, from, to },
      {
        headers: { "Cache-Control": "private, max-age=600" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Economic calendar error");
    return NextResponse.json(
      { error: "Failed to fetch economic calendar" },
      { status: 500 }
    );
  }
}
