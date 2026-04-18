import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAccuracyStats } from "@/lib/accuracy";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getAccuracyStats();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Accuracy stats error:", message);
    return NextResponse.json(
      { error: "Failed to fetch accuracy" },
      { status: 500 }
    );
  }
}
