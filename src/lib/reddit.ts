// Reddit ticker-mention feed
//
// Pulls recent posts mentioning a stock symbol across an admin-managed
// list of subreddits (see `reddit_subreddits` table — seeded with r/stocks,
// r/investing, r/SecurityAnalysis, r/wallstreetbets). Surfaced on the
// Analysis page → Reddit tab and (later) as a "Trending tickers" widget.
//
// Why this exists: retail chatter on Reddit genuinely moves small-caps and
// meme-adjacent tickers. Surfacing it next to news/filings/sentiment is
// useful signal — particularly when volume is unusual on a name the
// engine hasn't seen news for. We score post titles with the existing
// headline-sentiment lexicon so a bullish/bearish chip can render per
// post.
//
// Auth: none. Reddit exposes public JSON at
//   reddit.com/r/{sub}/search.json?q=...
// without any API key. Their server-side rate limit for unauthenticated
// JSON is generous (~60/min from a single IP) but Reddit *will* reject
// requests with a default Node User-Agent. We send a descriptive UA.
//
// Caching: per (symbol, sub) for 10 minutes. Cache is in-memory only —
// fine for a single-droplet deployment; replace with Redis when we
// scale out.

import { scoreHeadline } from "./headline-sentiment";
import { createRouteLogger } from "./logger";

const log = createRouteLogger("reddit");

// Reddit JSON expects a non-default UA. Their docs request the format
// `<platform>:<app_id>:<version> (by /u/username)`. We don't have a
// registered app, but any descriptive UA works for the unauthenticated
// JSON endpoints — they specifically reject Node's default UA.
const USER_AGENT = "Sentinel/1.0 (Trading Intelligence Platform; +https://sentinel.guardcybersolutionsllc.com)";

/** What we return per post — trimmed-down, render-ready. */
export interface RedditPost {
  /** Reddit's `t3_xxxxxx` post id. Stable, used for dedup across subs. */
  id: string;
  subreddit: string;          // lowercase, no "r/"
  title: string;
  /** First N chars of the self-text body, if any. Empty for link posts. */
  excerpt: string;
  author: string;
  /** Permalink (relative path, prefix with `https://reddit.com` for full URL). */
  permalink: string;
  url: string;                // full https URL to the comment thread
  score: number;              // upvotes - downvotes
  numComments: number;
  /** Unix seconds — Reddit's native timestamp format. */
  createdUtc: number;
  flair: string | null;       // e.g. "DD", "News", "Discussion"
  isStickied: boolean;        // pinned mod post, usually want to skip
  /** Keyword-driven label from `scoreHeadline()` over the post title. */
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface RedditFetchResult {
  symbol: string;
  posts: RedditPost[];
  /** Subs we hit. Useful for "Sources: r/stocks, r/investing, ..." UI. */
  subreddits: string[];
  /** Subs that returned an error or timed out. */
  errored: string[];
  scannedAt: string;          // ISO timestamp
}

// ─── Cache ────────────────────────────────────────────────────────────────
// In-memory only. Survives within a single Node process; resets on
// container restart. Replace with shared cache if we ever scale horizontally.
//
// Key: `${symbol}:${sub}`. Value: { fetchedAt, posts }. TTL 10 minutes
// — Reddit post velocity is slow enough that 10 min staleness is fine,
// and aggressive caching keeps us well under Reddit's rate limit.

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  fetchedAt: number;
  posts: RedditPost[];
}

const g = globalThis as typeof globalThis & {
  __redditCache?: Map<string, CacheEntry>;
};
g.__redditCache ??= new Map();
const cache = g.__redditCache;

function cacheKey(symbol: string, sub: string): string {
  return `${symbol.toUpperCase()}:${sub.toLowerCase()}`;
}

function cacheGet(symbol: string, sub: string): RedditPost[] | null {
  const entry = cache.get(cacheKey(symbol, sub));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(cacheKey(symbol, sub));
    return null;
  }
  return entry.posts;
}

function cacheSet(symbol: string, sub: string, posts: RedditPost[]): void {
  cache.set(cacheKey(symbol, sub), { fetchedAt: Date.now(), posts });
}

// ─── Reddit JSON shape ────────────────────────────────────────────────────
// Just the fields we read. Reddit returns way more; we ignore the rest.

interface RedditJsonChild {
  kind: "t3";
  data: {
    id: string;
    subreddit: string;
    title: string;
    selftext?: string;
    author: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
    link_flair_text?: string | null;
    stickied?: boolean;
  };
}

interface RedditJsonResponse {
  data?: {
    children?: RedditJsonChild[];
  };
}

// ─── Fetch one sub for one symbol ─────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5000;

async function fetchSubredditMentions(
  sub: string,
  symbol: string,
  limit: number
): Promise<RedditPost[]> {
  const cached = cacheGet(symbol, sub);
  if (cached) return cached;

  // Query both bare ticker and cashtag variants — Reddit's search does
  // not implicitly unify them. `restrict_sr=on` scopes to the sub.
  const params = new URLSearchParams({
    q: `${symbol} OR $${symbol}`,
    sort: "new",
    restrict_sr: "on",
    limit: String(Math.min(limit * 2, 50)), // overfetch — we'll filter junk client-side
    t: "month",
  });
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      // 429: rate limited; 403: blocked sub; 5xx: Reddit being Reddit.
      log.warn({ sub, symbol, status: res.status }, "Reddit fetch non-OK");
      return [];
    }
    const json = (await res.json()) as RedditJsonResponse;
    const children = json.data?.children ?? [];
    const posts: RedditPost[] = [];

    for (const c of children) {
      if (c.kind !== "t3" || !c.data) continue;
      const d = c.data;
      if (d.stickied) continue;

      // Filter: title or self-text must actually contain the ticker.
      // Reddit's search will sometimes return loose matches we don't want.
      const titleU = d.title.toUpperCase();
      const bodyU = (d.selftext ?? "").toUpperCase();
      const symbolU = symbol.toUpperCase();
      const mentioned =
        new RegExp(`\\b\\$?${symbolU}\\b`).test(titleU) ||
        new RegExp(`\\b\\$?${symbolU}\\b`).test(bodyU);
      if (!mentioned) continue;

      posts.push({
        id: d.id,
        subreddit: d.subreddit.toLowerCase(),
        title: d.title,
        excerpt: (d.selftext ?? "").slice(0, 280),
        author: d.author,
        permalink: d.permalink,
        url: `https://www.reddit.com${d.permalink}`,
        score: d.score,
        numComments: d.num_comments,
        createdUtc: d.created_utc,
        flair: d.link_flair_text ?? null,
        isStickied: false,
        sentiment: scoreHeadline(d.title),
      });
    }

    cacheSet(symbol, sub, posts);
    return posts;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // AbortError on timeout is expected occasionally.
    log.warn({ sub, symbol, err: message }, "Reddit fetch failed");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface GetMentionsOptions {
  /** Per-sub fetch cap before merge. Default 15. */
  perSubLimit?: number;
  /** Drop posts with score < this. Default 5. Defends against ghost posts. */
  minScore?: number;
}

/**
 * Pull mentions of `symbol` across `subreddits`. Subs are queried in
 * parallel via Promise.allSettled — one failing sub doesn't tank the
 * whole result. Posts are deduped by id, sorted by score desc.
 */
export async function getRedditMentions(
  symbol: string,
  subreddits: string[],
  opts: GetMentionsOptions = {}
): Promise<RedditFetchResult> {
  const perSubLimit = opts.perSubLimit ?? 15;
  const minScore = opts.minScore ?? 5;
  const cleanSymbol = symbol.toUpperCase().trim();
  const cleanSubs = subreddits.map((s) => s.toLowerCase().trim()).filter(Boolean);

  if (!/^[A-Z]{1,10}$/.test(cleanSymbol)) {
    throw new Error("Invalid symbol");
  }
  if (cleanSubs.length === 0) {
    return {
      symbol: cleanSymbol,
      posts: [],
      subreddits: [],
      errored: [],
      scannedAt: new Date().toISOString(),
    };
  }

  const results = await Promise.allSettled(
    cleanSubs.map((sub) => fetchSubredditMentions(sub, cleanSymbol, perSubLimit))
  );

  const errored: string[] = [];
  const seen = new Set<string>();
  const merged: RedditPost[] = [];
  results.forEach((r, i) => {
    const sub = cleanSubs[i];
    if (r.status !== "fulfilled") {
      errored.push(sub);
      return;
    }
    for (const post of r.value) {
      if (post.score < minScore) continue;
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
    }
  });

  merged.sort((a, b) => b.score - a.score);

  return {
    symbol: cleanSymbol,
    posts: merged,
    subreddits: cleanSubs,
    errored,
    scannedAt: new Date().toISOString(),
  };
}

// ─── Test/admin hook: invalidate cache ────────────────────────────────────

export function clearRedditCache(): void {
  cache.clear();
}
