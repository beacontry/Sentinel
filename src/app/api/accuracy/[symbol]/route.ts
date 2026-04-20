import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAccuracyStats } from "@/lib/accuracy";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("accuracy-symbol");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    const stats = await getAccuracyStats(upperSymbol);
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Accuracy stats error");
    return NextResponse.json(
      { error: "Failed to fetch accuracy" },
      { status: 500 }
    );
  }
}
