import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createPortfolio, getUserPortfolios, getPortfolioValue } from "@/lib/portfolio-sim";
import { db } from "@/lib/db";
import { portfolios } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  initialCash: z.number().min(100).max(1000000).default(10000),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userPortfolios = await getUserPortfolios(session.userId as string);

    // Get current values
    const withValues = await Promise.all(
      userPortfolios.map(async (p) => {
        const value = await getPortfolioValue(p.id);
        return {
          id: p.id,
          name: p.name,
          initialBalance: p.initialBalance,
          currentBalance: p.currentBalance,
          currentValue: value,
          totalReturn: ((value - p.initialBalance) / p.initialBalance) * 100,
          createdAt: p.createdAt.toISOString(),
        };
      })
    );

    return NextResponse.json({ portfolios: withValues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portfolio list error:", message);
    return NextResponse.json({ error: "Failed to load portfolios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const portfolio = await createPortfolio(
      session.userId as string,
      parsed.data.name,
      parsed.data.initialCash
    );
    return NextResponse.json({ portfolio }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portfolio create error:", message);
    return NextResponse.json({ error: "Failed to create portfolio" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const id = body.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await db
      .delete(portfolios)
      .where(
        and(
          eq(portfolios.id, id),
          eq(portfolios.userId, session.userId as string)
        )
      );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Portfolio delete error:", message);
    return NextResponse.json({ error: "Failed to delete portfolio" }, { status: 500 });
  }
}
