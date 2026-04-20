import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calculateRelativeStrength } from "@/lib/relative-strength";
import { RS_CONFIG } from "@/lib/config";
import { getAllSectors } from "@/lib/sectors";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("relative-strength");

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate period
    const periodRaw = searchParams.get("period");
    let period: number = RS_CONFIG.defaultPeriod;
    if (periodRaw) {
      const parsed = parseInt(periodRaw, 10);
      if (!isNaN(parsed) && parsed >= 7 && parsed <= 365) {
        period = parsed;
      }
    }

    // Parse and validate sector filter
    const sectorRaw = searchParams.get("sector");
    let sectorFilter: string | undefined;
    if (sectorRaw && sectorRaw.trim() !== "") {
      const validSectors = getAllSectors();
      if (validSectors.includes(sectorRaw)) {
        sectorFilter = sectorRaw;
      }
    }

    const results = await calculateRelativeStrength(period, sectorFilter);

    return NextResponse.json(
      {
        results,
        period,
        benchmark: RS_CONFIG.benchmark,
      },
      {
        headers: { "Cache-Control": "private, max-age=300" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Relative strength error");
    return NextResponse.json(
      { error: "Failed to compute relative strength rankings" },
      { status: 500 }
    );
  }
}
