import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchFilings } from "@/lib/sec-filings";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("filings");

export async function GET(
  request: Request,
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

  const { searchParams } = new URL(request.url);
  const form = searchParams.get("form")?.toUpperCase() ?? undefined;

  // Validate form type if provided
  if (form && !["10-K", "10-Q", "8-K", "S-1", "DEF 14A", "13F"].includes(form)) {
    return NextResponse.json({ error: "Invalid form type" }, { status: 400 });
  }

  try {
    const filings = await searchFilings(upperSymbol, form);

    return NextResponse.json(
      { symbol: upperSymbol, filings },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Filing search error");
    return NextResponse.json(
      { error: "Failed to search filings" },
      { status: 500 }
    );
  }
}
