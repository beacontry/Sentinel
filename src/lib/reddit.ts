// Reddit ticker-mention feed
//
// Pulls recent posts mentioning a stock symbol across an admin-managed
// list of subreddits (see `reddit_subreddits` table — seeded with
// r/stocks, r/investing, r/SecurityAnalysis, r/wallstreetbets).
//
// Surfaced on the Analysis page → Reddit tab.
//
// ─── Why RSS, not JSON ─────────────────────────────────────────────────
// First impl used `reddit.com/r/{sub}/search.json` — fine on residential
// IPs but Reddit now serves the HTML web app instead of JSON to
// datacenter IPs (DigitalOcean, AWS, GCP, etc.). Even with a proper
// User-Agent. Old.reddit.com .json returns 403.
//
// `search.rss` is NOT blocked — Reddit still treats Atom feeds as a
// first-class public surface. So we parse Atom XML instead.
//
// Tradeoff: RSS doesn't expose `score`, `num_comments`, `flair`, or
// `stickied`. We lose score-based sorting and the score-min filter.
// Mitigation: sort by `published` time (newest first), and rely on the
// ticker-mention word-boundary check + sentiment label for signal.
//
// If a future admin sets up Reddit OAuth credentials (parked in
// docs/future-ideas.md), we can do a parallel JSON fetch against
// oauth.reddit.com and get the full payload back. For now the RSS path
// is what works.
//
// ─── Caching ───────────────────────────────────────────────────────────
// In-memory per (symbol, sub), 10-min TTL. Replace with shared cache
// if we ever scale horizontally.

import { XMLParser } from "fast-xml-parser";
import { scoreHeadline } from "./headline-sentiment";
import { createRouteLogger } from "./logger";
import { getRedditOAuthCreds } from "./system-config";

const log = createRouteLogger("reddit");

// Reddit accepts most descriptive UAs on the RSS endpoint. Their
// documented format is `<platform>:<app_id>:<version> (by /u/username)`.
// We're not registered, so just send something descriptive.
const USER_AGENT =
  "Beacontry/1.0 (Trading Intelligence Platform; +https://beacontry.com)";

export interface RedditPost {
  /** Reddit's `t3_xxxxxx` post id. Stable, used for dedup across subs. */
  id: string;
  subreddit: string; // lowercase, no "r/"
  title: string;
  /** First N chars of post body (HTML stripped). Empty for link/image posts. */
  excerpt: string;
  author: string;
  url: string; // full https URL to the comment thread
  permalink: string; // relative path
  /**
   * 0 when sourced from RSS (not exposed). The UI knows to hide score
   * badges when 0; if/when we add an OAuth fallback path, real scores
   * land here.
   */
  score: number;
  /** Same — 0 from RSS. */
  numComments: number;
  /** Unix seconds — derived from RSS `<published>`. */
  createdUtc: number;
  flair: string | null;
  isStickied: boolean;
  /** Keyword label from `scoreHeadline()` over the post title. */
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface RedditFetchResult {
  symbol: string;
  posts: RedditPost[];
  /** Subs we hit (lowercased). */
  subreddits: string[];
  /** Subs that returned an error or timed out. */
  errored: string[];
  scannedAt: string; // ISO timestamp
}

// ─── Cache ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000;

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

// ─── Atom XML parsing ─────────────────────────────────────────────────────
// Reddit's search.rss returns Atom (XML), not RSS 2.0. fast-xml-parser
// handles both equivalently for our purposes — we just read the fields.

interface AtomEntry {
  id?: string; // "t3_xxxxx"
  title?: string;
  author?: { name?: string };
  link?: { "@_href"?: string } | Array<{ "@_href"?: string }>;
  category?: { "@_term"?: string } | Array<{ "@_term"?: string }>;
  content?: { "#text"?: string } | string;
  published?: string;
  updated?: string;
}

interface AtomFeed {
  feed?: {
    entry?: AtomEntry | AtomEntry[];
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  // Reddit's content field is HTML wrapped in CDATA. We want it as raw text.
  cdataPropName: "#text",
  // Force these tags to be arrays so we don't have to .filter Array.isArray()
  // checks everywhere downstream.
  isArray: (name) => name === "entry",
});

function pickLink(
  link: AtomEntry["link"]
): string | null {
  if (!link) return null;
  // Atom can have multiple <link rel="..."/> entries; we want the
  // alternate one (the thread URL). For simplicity we grab the first
  // href that looks like a Reddit comments URL.
  const arr = Array.isArray(link) ? link : [link];
  for (const l of arr) {
    const href = l?.["@_href"];
    if (href && href.includes("/comments/")) return href;
  }
  return arr[0]?.["@_href"] ?? null;
}

function pickSubreddit(cat: AtomEntry["category"]): string | null {
  if (!cat) return null;
  const arr = Array.isArray(cat) ? cat : [cat];
  for (const c of arr) {
    if (c?.["@_term"]) return c["@_term"].toLowerCase();
  }
  return null;
}

function extractContent(content: AtomEntry["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content["#text"] ?? "";
}

/** Strip HTML tags from a content string. RSS gives us markup-laden HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPermalink(url: string): string {
  // "https://www.reddit.com/r/X/comments/Y/title/" → "/r/X/comments/Y/title/"
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function parseIso(ts: string | undefined): number {
  if (!ts) return Math.floor(Date.now() / 1000);
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
}

// ─── OAuth bearer-token cache (24h validity) ──────────────────────────────
//
// Reddit's client-credentials flow:
//   POST https://www.reddit.com/api/v1/access_token
//     Authorization: Basic <base64(client_id:client_secret)>
//     body: grant_type=client_credentials
//
// Returns { access_token, token_type, expires_in: 86400, scope }.
// We cache for 23h to leave headroom against the 24h expiry.

interface TokenCacheEntry {
  token: string;
  expiry: number; // unix ms
}

const tokenGlobal = globalThis as typeof globalThis & {
  __redditToken?: TokenCacheEntry | null;
};

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

async function getRedditAccessToken(): Promise<string | null> {
  const cached = tokenGlobal.__redditToken;
  if (cached && cached.expiry > Date.now()) return cached.token;

  const creds = await getRedditOAuthCreds();
  if (!creds) {
    tokenGlobal.__redditToken = null;
    return null;
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "Reddit OAuth token mint non-OK");
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      log.warn({}, "Reddit OAuth token mint missing access_token");
      return null;
    }
    tokenGlobal.__redditToken = {
      token: json.access_token,
      expiry: Date.now() + TOKEN_TTL_MS,
    };
    return json.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.warn({ err: message }, "Reddit OAuth token mint failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Fetch one sub for one symbol ─────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5000;

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

/**
 * OAuth/JSON path. Returns posts with full score/comments/flair/sticky
 * data. Used when REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are configured.
 * Returns null on token failure so the caller can fall back to RSS.
 */
async function fetchSubredditMentionsJson(
  sub: string,
  symbol: string,
  limit: number,
  token: string
): Promise<RedditPost[] | null> {
  const params = new URLSearchParams({
    q: `${symbol} OR $${symbol}`,
    sort: "new",
    restrict_sr: "on",
    limit: String(Math.min(limit * 2, 50)),
    t: "month",
  });
  // The OAuth API lives at oauth.reddit.com (separate origin from
  // www.reddit.com — the request must NOT include the trailing /.json
  // suffix since the API returns JSON natively under this origin).
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/search?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (res.status === 401) {
      // Token expired mid-window (rare with 23h TTL but possible).
      // Drop the cache so the next call mints a fresh one, and fall
      // back to RSS for THIS call so we don't make the user wait.
      tokenGlobal.__redditToken = null;
      log.warn({ sub, symbol }, "Reddit OAuth token rejected — falling back to RSS");
      return null;
    }
    if (!res.ok) {
      log.warn({ sub, symbol, status: res.status }, "Reddit OAuth JSON fetch non-OK");
      return null;
    }
    const json = (await res.json()) as RedditJsonResponse;
    const children = json.data?.children ?? [];
    const posts: RedditPost[] = [];
    const symbolU = symbol.toUpperCase();
    const tickerRe = new RegExp(`\\b\\$?${symbolU}\\b`, "i");

    for (const c of children) {
      if (c.kind !== "t3" || !c.data) continue;
      const d = c.data;
      if (d.stickied) continue;

      const titleU = d.title.toUpperCase();
      const bodyU = (d.selftext ?? "").toUpperCase();
      if (!tickerRe.test(titleU) && !tickerRe.test(bodyU)) continue;

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
    return posts;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.warn({ sub, symbol, err: message }, "Reddit OAuth JSON fetch failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSubredditMentions(
  sub: string,
  symbol: string,
  limit: number
): Promise<RedditPost[]> {
  const cached = cacheGet(symbol, sub);
  if (cached) return cached;

  // Prefer OAuth path when credentials are configured — returns full
  // score / comments / flair payload. RSS is the fallback both for
  // unauthed setups AND for transient OAuth failures (token rejected,
  // 5xx, etc.).
  const token = await getRedditAccessToken();
  if (token) {
    const jsonPosts = await fetchSubredditMentionsJson(sub, symbol, limit, token);
    if (jsonPosts !== null) {
      cacheSet(symbol, sub, jsonPosts);
      return jsonPosts;
    }
    // null = fall through to RSS
  }

  const params = new URLSearchParams({
    q: `${symbol} OR $${symbol}`,
    sort: "new",
    restrict_sr: "on",
    limit: String(Math.min(limit * 2, 50)),
    t: "month",
  });
  const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.rss?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ sub, symbol, status: res.status }, "Reddit RSS fetch non-OK");
      return [];
    }
    const text = await res.text();
    const parsed = xmlParser.parse(text) as AtomFeed;
    // The XMLParser is configured with `isArray: name => name === "entry"`,
    // so feed.entry is always an array — but TS can't infer that. Coerce.
    const rawEntries = parsed.feed?.entry;
    const entries: AtomEntry[] = Array.isArray(rawEntries)
      ? rawEntries
      : rawEntries
        ? [rawEntries]
        : [];

    const posts: RedditPost[] = [];
    const symbolU = symbol.toUpperCase();
    const tickerRe = new RegExp(`\\b\\$?${symbolU}\\b`, "i");

    for (const e of entries) {
      const link = pickLink(e.link);
      if (!link) continue;
      const title = (e.title ?? "").trim();
      if (!title) continue;

      // Word-boundary filter: Reddit's search returns loose matches
      // ("AAPL" search returning "AAPLE" posts). Title is primary;
      // body is fallback (in case the ticker is only in body text).
      const bodyText = htmlToText(extractContent(e.content));
      if (!tickerRe.test(title) && !tickerRe.test(bodyText)) continue;

      const idRaw = e.id ?? "";
      // Reddit IDs come as "t3_xxxxx" in the feed entry id; the
      // unprefixed form is more conventional for our store.
      const id = idRaw.startsWith("t3_") ? idRaw.slice(3) : idRaw;
      if (!id) continue;

      const subreddit =
        pickSubreddit(e.category) ?? sub.toLowerCase();
      const authorRaw = e.author?.name ?? "";
      // RSS author comes as "/u/username" — strip the prefix.
      const author = authorRaw.replace(/^\/u\//, "");

      posts.push({
        id,
        subreddit,
        title,
        excerpt: bodyText.slice(0, 280),
        author: author || "unknown",
        url: link,
        permalink: extractPermalink(link),
        score: 0, // unavailable via RSS
        numComments: 0, // unavailable via RSS
        createdUtc: parseIso(e.published ?? e.updated),
        flair: null,
        isStickied: false,
        sentiment: scoreHeadline(title),
      });
    }

    cacheSet(symbol, sub, posts);
    return posts;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    log.warn({ sub, symbol, err: message }, "Reddit RSS fetch failed");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface GetMentionsOptions {
  /** Per-sub fetch cap before merge. Default 15. */
  perSubLimit?: number;
  /**
   * @deprecated The RSS endpoint doesn't expose `score`, so this filter
   * has no effect. Kept on the type for backwards-compatibility with the
   * route's query-param plumbing. Will become functional again if we
   * add the OAuth fallback path.
   */
  minScore?: number;
}

/**
 * Pull mentions of `symbol` across `subreddits`. Subs are queried in
 * parallel via Promise.allSettled — one failing sub doesn't tank the
 * whole result. Posts are deduped by id, sorted by published time desc
 * (newest first) — RSS doesn't expose score.
 */
export async function getRedditMentions(
  symbol: string,
  subreddits: string[],
  opts: GetMentionsOptions = {}
): Promise<RedditFetchResult> {
  const perSubLimit = opts.perSubLimit ?? 15;
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
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
    }
  });

  // Sort newest-first. (RSS has no score.)
  merged.sort((a, b) => b.createdUtc - a.createdUtc);

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
