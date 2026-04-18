import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { forumCategories } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const categories = await db
      .select()
      .from(forumCategories)
      .orderBy(asc(forumCategories.sortOrder));

    return NextResponse.json({
      categories: categories.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Forum categories error:", message);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}
