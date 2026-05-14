import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAccuracyStats } from "@/lib/accuracy";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("accuracy");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  try {
    const stats = await getAccuracyStats();
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
