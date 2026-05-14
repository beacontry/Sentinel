import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";
import { checkTier } from "@/lib/tiers-server";

const log = createRouteLogger("peers");

export async function GET(
  _request: Request,
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

  const client = getFinnhubClient();
  if (!client.isConfigured) {
    return NextResponse.json({ configured: false }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const peers = await client.getPeers(upperSymbol);

    // Filter out the symbol itself and empty values
    const filtered = (peers ?? []).filter(
      (p) => typeof p === "string" && p.length > 0 && p !== upperSymbol
    );

    return NextResponse.json({
      symbol: upperSymbol,
      configured: true,
      peers: filtered,
    }, {
      headers: { "Cache-Control": "private, max-age=86400" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Peers fetch error");
    return NextResponse.json(
      { error: "Failed to fetch peers" },
      { status: 500 }
    );
  }
}
