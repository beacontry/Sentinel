import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { signals, signalAccuracy } from "@/lib/db/schema";
import { eq, gte, lte, and, desc, inArray, type SQL } from "drizzle-orm";
import { toCSV } from "@/lib/csv";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("signals-export");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const symbolsParam = params.get("symbols");
  const from = params.get("from");
  const to = params.get("to");

  const conditions: SQL[] = [];

  if (symbolsParam) {
    const syms = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (syms.length > 0) {
      conditions.push(inArray(signals.symbol, syms));
    }
  }
  if (from) {
    conditions.push(gte(signals.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(signals.createdAt, new Date(to)));
  }

  try {
    const rows = await withTimeout(5000, async (tx) => {
      return tx
        .select({
          symbol: signals.symbol,
          signalType: signals.signal,
          confidence: signals.confidence,
          price: signals.price,
          volume: signals.volume,
          plainEnglish: signals.plainEnglish,
          createdAt: signals.createdAt,
          exitPrice: signalAccuracy.exitPrice,
          actualReturn: signalAccuracy.actualReturn,
          wasCorrect: signalAccuracy.wasCorrect,
        })
        .from(signals)
        .leftJoin(signalAccuracy, eq(signalAccuracy.signalId, signals.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(signals.createdAt))
        .limit(5000);
    });

    const headers = [
      "Date", "Symbol", "Signal", "Confidence", "Price", "Volume",
      "Exit Price", "Return %", "Correct", "Description",
    ];

    const csvRows = rows.map((r) => [
      r.createdAt.toISOString(),
      r.symbol,
      r.signalType,
      r.confidence.toFixed(2),
      r.price.toFixed(2),
      r.volume.toString(),
      r.exitPrice?.toFixed(2) ?? "",
      r.actualReturn?.toFixed(2) ?? "",
      r.wasCorrect === null ? "" : r.wasCorrect ? "Yes" : "No",
      r.plainEnglish,
    ]);

    const csv = toCSV(headers, csvRows);
    const filename = `sentinel-signals-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message }, "Export error");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
