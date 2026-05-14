import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { symbolStrategies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkTier } from "@/lib/tiers-server";

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

  const [row] = await db
    .select()
    .from(symbolStrategies)
    .where(
      and(
        eq(symbolStrategies.userId, session.userId),
        eq(symbolStrategies.symbol, upperSymbol)
      )
    )
    .limit(1);

  return NextResponse.json({ strategy: row ?? null });
}
