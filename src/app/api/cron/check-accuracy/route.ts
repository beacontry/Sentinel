import { NextRequest, NextResponse } from "next/server";
import { batchCheckAccuracy } from "@/lib/accuracy";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("cron-check-accuracy");

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const checked = await batchCheckAccuracy(50);
    return NextResponse.json({ checked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Accuracy cron error");
    return NextResponse.json(
      { error: "Accuracy check failed" },
      { status: 500 }
    );
  }
}
