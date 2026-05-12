// GET /api/transcripts/[symbol]
//
// Returns recent earnings-call transcript metadata for the symbol —
// year, quarter, date, Finnhub id. Free Finnhub tier covers this
// listing endpoint; full transcript text + AI summarization require
// the paid alternative-data tier (parked in docs/future-ideas.md).
//
// Surfaced on the Analysis page intelligence tabs as a "Latest earnings
// call" card with a link out.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinnhubClient } from "@/lib/finnhub";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("transcripts");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const sym = symbol.toUpperCase().trim();
  if (!sym || sym.length > 10) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const finnhub = getFinnhubClient();
  if (!finnhub.isConfigured) {
    return NextResponse.json(
      { transcripts: [], error: "Finnhub API key not configured" },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const response = await finnhub.getEarningsTranscripts(sym);
    // Newest first, limit 8 (last 2 years of quarterly calls)
    const transcripts = (response.transcripts ?? [])
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 8);

    return NextResponse.json(
      { symbol: sym, transcripts },
      // Transcripts are immutable once published — cache for a day
      { headers: { "Cache-Control": "private, max-age=86400" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, symbol: sym }, "Transcripts fetch error");
    return NextResponse.json(
      { transcripts: [], error: "Failed to fetch transcripts" },
      { status: 502 }
    );
  }
}
