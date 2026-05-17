import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeATRStrategy } from "@/lib/strategy-atr";
import { resolveStrategy } from "@/lib/strategy-resolver";
import { checkTier } from "@/lib/tiers-server";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("strategy-params");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tierFail = await checkTier(session.userId, "trader");
  if (tierFail) return tierFail;

  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!/^[A-Z]{1,10}$/.test(upperSymbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? "resolve";

  try {
    if (mode === "auto") {
      const result = await computeATRStrategy(upperSymbol);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }

    // Full resolution: assignment > risk profile + ATR > default
    const resolved = await resolveStrategy(session.userId, upperSymbol);
    return NextResponse.json(resolved, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, symbol: upperSymbol, mode }, "Strategy params failed");
    return NextResponse.json({ error: "Failed to resolve strategy" }, { status: 500 });
  }
}
