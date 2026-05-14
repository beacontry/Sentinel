import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRedditMentions, clearRedditCache } from "@/lib/reddit";

// Reddit lib unit tests. We mock `globalThis.fetch` to return Atom XML
// (the RSS endpoint is what we actually hit — the .json endpoint is
// blocked from datacenter IPs).
//
// Coverage:
//  - happy path (RSS parsing, sentiment, sort by time desc)
//  - allSettled resilience (one bad sub doesn't tank the whole result)
//  - in-memory cache short-circuits within TTL
//  - word-boundary regex rejects loose matches
//  - cashtag matching
//  - empty subreddit list returns empty shape immediately
//  - non-OK + malformed XML degrade gracefully
//  - invalid symbol throws

type FetchMock = ReturnType<typeof vi.fn>;

/** Reddit HTML-entity-encodes the HTML body inside <content type="html">.
 * Mirror that so the parser sees a string node (not nested XML children). */
function htmlEntityEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build a minimal Atom feed string that mirrors Reddit's search.rss shape. */
function atomFeed(
  posts: Array<{
    id: string; // bare id, will be wrapped as "t3_xxx"
    title: string;
    subreddit: string;
    author?: string;
    content?: string; // raw HTML — will be entity-encoded
    published?: string; // ISO; defaults to now
  }>
): string {
  const entries = posts
    .map(
      (p) => `
    <entry>
      <id>t3_${p.id}</id>
      <title>${p.title}</title>
      <author><name>/u/${p.author ?? "tester"}</name></author>
      <category term="${p.subreddit.toLowerCase()}" label="r/${p.subreddit}"/>
      <link href="https://www.reddit.com/r/${p.subreddit}/comments/${p.id}/x/"/>
      <content type="html">${htmlEntityEncode(p.content ?? "")}</content>
      <published>${p.published ?? new Date().toISOString()}</published>
      <updated>${p.published ?? new Date().toISOString()}</updated>
    </entry>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>search results</title>
  <updated>${new Date().toISOString()}</updated>
  ${entries}
</feed>`;
}

function mockOk(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/atom+xml" },
  });
}

beforeEach(() => {
  clearRedditCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getRedditMentions", () => {
  it("returns empty shape when subreddits list is empty", async () => {
    const fetchMock = vi.fn() as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", []);
    expect(result.posts).toEqual([]);
    expect(result.subreddits).toEqual([]);
    expect(result.symbol).toBe("AAPL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid symbols up front", async () => {
    await expect(getRedditMentions("aapl1", ["stocks"])).rejects.toThrow();
    await expect(getRedditMentions("", ["stocks"])).rejects.toThrow();
    await expect(getRedditMentions("TOOLONGSYMBOL", ["stocks"])).rejects.toThrow();
  });

  it("happy path: parses RSS, merges across subs, sorts by time desc", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          atomFeed([
            {
              id: "older",
              title: "AAPL old post",
              subreddit: "stocks",
              published: new Date((now - 7200) * 1000).toISOString(),
            },
            {
              id: "newest",
              title: "AAPL beats earnings — bullish",
              subreddit: "stocks",
              published: new Date(now * 1000).toISOString(),
            },
          ])
        );
      }
      if (u.includes("/r/investing/")) {
        return mockOk(
          atomFeed([
            {
              id: "mid",
              title: "Long-term thesis on AAPL",
              subreddit: "investing",
              published: new Date((now - 3600) * 1000).toISOString(),
            },
          ])
        );
      }
      return mockOk(atomFeed([]));
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "investing"]);

    expect(result.posts).toHaveLength(3);
    // Newest first
    expect(result.posts[0].id).toBe("newest");
    expect(result.posts[1].id).toBe("mid");
    expect(result.posts[2].id).toBe("older");

    // Subreddits stay lowercased
    expect(result.posts.every((p) => p.subreddit === p.subreddit.toLowerCase())).toBe(true);

    // Author stripped of /u/ prefix
    expect(result.posts.every((p) => !p.author.startsWith("/u/"))).toBe(true);

    // RSS doesn't expose score — must be 0
    expect(result.posts.every((p) => p.score === 0)).toBe(true);
    expect(result.posts.every((p) => p.numComments === 0)).toBe(true);

    // Sentiment populated
    expect(["bullish", "bearish", "neutral"]).toContain(result.posts[0].sentiment);

    expect(result.errored).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("one bad sub doesn't tank the whole result (allSettled)", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          atomFeed([{ id: "s1", title: "AAPL bullish setup", subreddit: "stocks" }])
        );
      }
      return new Response("Too Many Requests", { status: 429 });
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "wallstreetbets"]);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].subreddit).toBe("stocks");
  });

  it("word-boundary filter rejects loose ticker matches", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(
        atomFeed([
          { id: "g1", title: "I bought a AAPLE", subreddit: "stocks" },
          { id: "g2", title: "AAPL crushed Q3", subreddit: "stocks" },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("g2");
  });

  it("matches both bare ticker and cashtag in titles", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(
        atomFeed([
          { id: "c1", title: "$AAPL to the moon", subreddit: "wallstreetbets" },
          { id: "c2", title: "AAPL fundamentals", subreddit: "wallstreetbets" },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["wallstreetbets"]);
    expect(result.posts.map((p) => p.id).sort()).toEqual(["c1", "c2"]);
  });

  it("falls back to body text when title doesn't mention the ticker", async () => {
    // Sometimes a post is about AAPL but the title is decorative
    // ("My YOLO play"). RSS gives us the body in <content type="html">.
    const fetchMock = vi.fn(async () =>
      mockOk(
        atomFeed([
          {
            id: "b1",
            title: "My weekly YOLO",
            subreddit: "stocks",
            content: "<p>Going all-in on AAPL calls this week</p>",
          },
          {
            id: "b2",
            title: "Unrelated weekend chatter",
            subreddit: "stocks",
            content: "<p>Stocks I like: MSFT, GOOG.</p>",
          },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("b1");
    // HTML stripped from excerpt
    expect(result.posts[0].excerpt).not.toContain("<p>");
    expect(result.posts[0].excerpt).toContain("AAPL");
  });

  it("dedupes posts that appear in multiple subs (by id)", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          atomFeed([{ id: "dup", title: "AAPL cross post", subreddit: "stocks" }])
        );
      }
      return mockOk(
        atomFeed([{ id: "dup", title: "AAPL cross post", subreddit: "investing" }])
      );
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "investing"]);
    expect(result.posts).toHaveLength(1);
  });

  it("cache hit on second call within TTL", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(atomFeed([{ id: "k1", title: "AAPL up", subreddit: "stocks" }]))
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getRedditMentions("AAPL", ["stocks"]);
    await getRedditMentions("AAPL", ["stocks"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("malformed XML response yields empty array for that sub", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("not valid xml at all <not-closed", {
          status: 200,
          headers: { "content-type": "application/atom+xml" },
        })
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toEqual([]);
  });

  it("handles a feed with no entries", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>`)
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toEqual([]);
  });

  it("normalizes symbol and subreddit names", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(atomFeed([{ id: "n1", title: "AAPL stuff", subreddit: "Stocks" }]))
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("aapl", ["Stocks"]);
    expect(result.symbol).toBe("AAPL");
    expect(result.subreddits).toEqual(["stocks"]);
    expect(result.posts[0].subreddit).toBe("stocks");
  });

  it("strips t3_ prefix from feed entry id", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(atomFeed([{ id: "abc123", title: "AAPL post", subreddit: "stocks" }]))
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts[0].id).toBe("abc123");
  });
});
