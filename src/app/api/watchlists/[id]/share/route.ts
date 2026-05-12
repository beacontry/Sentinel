// POST   /api/watchlists/[id]/share — generate (or rotate) a public share token
// DELETE /api/watchlists/[id]/share — revoke the share token (NULL the column)
//
// The generated URL is /w/[token] — see src/app/w/[token]/page.tsx for
// the public read-only renderer. Tokens are 24 bytes hex (192 bits)
// from crypto.randomBytes — opaque, unguessable, no PII leakage.

import { NextResponse } from "next/server";
import { requireAuthWithCsrf } from "@/lib/auth";
import { db } from "@/lib/db";
import { watchlists } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("watchlist-share");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

  try {
    const token = generateToken();
    const [updated] = await db
      .update(watchlists)
      .set({ shareToken: token })
      .where(and(eq(watchlists.id, id), eq(watchlists.userId, auth.userId)))
      .returning({
        id: watchlists.id,
        shareToken: watchlists.shareToken,
      });

    if (!updated) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      shareToken: updated.shareToken,
      url: `/w/${updated.shareToken}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, watchlistId: id }, "Watchlist share error");
    return NextResponse.json({ error: "Failed to share watchlist" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthWithCsrf(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid watchlist id" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(watchlists)
      .set({ shareToken: null })
      .where(and(eq(watchlists.id, id), eq(watchlists.userId, auth.userId)))
      .returning({ id: watchlists.id });

    if (!updated) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, watchlistId: id }, "Watchlist unshare error");
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}
