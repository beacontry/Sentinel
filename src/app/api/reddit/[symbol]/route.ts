// GET /api/reddit/[symbol]
//
// Returns recent Reddit posts mentioning `symbol` across the
// admin-managed list of enabled subreddits (`reddit_subreddits` table).
// Caches per-symbol-per-sub in-memory for 10 min — see src/lib/reddit.ts.
//
// Surfaced on the Analysis page → Reddit intelligence tab. Read-only;
// anyone with a session can hit this.

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db, withTimeout, isStatementTimeout } from "@/lib/db";
import { redditSubreddits } from "@/lib/db/schema/reddit";
import { eq } from "drizzle-orm";
import { getRedditMentions } from "@/lib/reddit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("reddit");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const upper = symbol.toUpperCase().trim();
  if (!/^[A-Z]{1,10}$/.test(upper)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Optional `minScore` query param. 5 by default — see lib/reddit.ts for
  // rationale (filters ghost / single-comment posts).
  const minScoreRaw = request.nextUrl.searchParams.get("minScore");
  const minScore =
    minScoreRaw && Number.isFinite(Number(minScoreRaw))
      ? Math.max(0, Math.min(Number(minScoreRaw), 1000))
      : 5;

  let enabledSubs: string[];
  try {
    enabledSubs = await withTimeout(3000, async (tx) => {
      const rows = await tx
        .select({ name: redditSubreddits.name })
        .from(redditSubreddits)
        .where(eq(redditSubreddits.enabled, true));
      return rows.map((r) => r.name);
    });
  } catch (err) {
    if (isStatementTimeout(err)) {
      return NextResponse.json(
        { error: "Query timed out" },
        { status: 504, headers: { "X-Query-Timeout": "true" } }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error({ err: message, symbol: upper }, "Failed to load subreddit list");
    // Degrade: hit the default sub set rather than 500. The reddit.ts
    // client handles fully-empty input gracefully anyway.
    enabledSubs = ["stocks", "investing"];
  }

  if (enabledSubs.length === 0) {
    return NextResponse.json(
      {
        symbol: upper,
        posts: [],
        subreddits: [],
        errored: [],
        scannedAt: new Date().toISOString(),
        configured: false,
      },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  try {
    const result = await getRedditMentions(upper, enabledSubs, { minScore });
    return NextResponse.json(
      { ...result, configured: true },
      {
        // 5 min — matches the lib cache TTL on the cold-fetch path and
        // halves it on the warm path. Browsers will mostly serve cached.
        headers: { "Cache-Control": "private, max-age=300" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn({ err: message, symbol: upper }, "Reddit mentions fetch failed");
    return NextResponse.json(
      {
        symbol: upper,
        posts: [],
        subreddits: enabledSubs,
        errored: enabledSubs,
        scannedAt: new Date().toISOString(),
        configured: true,
        unavailable: true,
      },
      {
        // Even on failure return 200 with an empty shape so the UI
        // renders an "unavailable" state instead of an error toast.
        status: 200,
        headers: { "Cache-Control": "private, max-age=60" },
      }
    );
  }
}
