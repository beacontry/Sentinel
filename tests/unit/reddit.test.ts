import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRedditMentions, clearRedditCache } from "@/lib/reddit";

// Reddit lib unit tests. We mock `globalThis.fetch` to control responses
// and assert that:
//  - happy path returns posts with sentiment + filtering
//  - one bad sub doesn't tank the whole result (Promise.allSettled)
//  - in-memory cache short-circuits a second call within TTL
//  - word-boundary regex rejects loose matches ("AAPL" must not match "AAPLE")
//  - minScore filter drops ghost posts
//  - empty subreddit list returns an empty shape immediately
//  - non-OK / malformed responses degrade gracefully (return [] for that sub,
//    keep other subs)
//  - invalid symbol throws

type FetchMock = ReturnType<typeof vi.fn>;

// Helper: build a minimal Reddit listing JSON response.
function listing(
  posts: Array<{
    id: string;
    title: string;
    subreddit: string;
    score?: number;
    selftext?: string;
    num_comments?: number;
    created_utc?: number;
    stickied?: boolean;
    link_flair_text?: string | null;
    author?: string;
    permalink?: string;
  }>
): unknown {
  return {
    data: {
      children: posts.map((p) => ({
        kind: "t3",
        data: {
          id: p.id,
          title: p.title,
          subreddit: p.subreddit,
          selftext: p.selftext ?? "",
          author: p.author ?? "tester",
          permalink: p.permalink ?? `/r/${p.subreddit}/comments/${p.id}/x/`,
          score: p.score ?? 100,
          num_comments: p.num_comments ?? 10,
          created_utc: p.created_utc ?? Math.floor(Date.now() / 1000) - 600,
          link_flair_text: p.link_flair_text ?? null,
          stickied: p.stickied ?? false,
        },
      })),
    },
  };
}

function mockOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
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
    // No network call when there's nothing to query
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid symbols up front", async () => {
    await expect(getRedditMentions("aapl1", ["stocks"])).rejects.toThrow();
    await expect(getRedditMentions("", ["stocks"])).rejects.toThrow();
    await expect(getRedditMentions("TOOLONGSYMBOL", ["stocks"])).rejects.toThrow();
  });

  it("happy path: returns posts merged across subs sorted by score", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          listing([
            { id: "a1", title: "AAPL beats earnings — bullish", subreddit: "stocks", score: 500 },
            { id: "a2", title: "AAPL drops on guidance miss", subreddit: "stocks", score: 200 },
          ])
        );
      }
      if (u.includes("/r/investing/")) {
        return mockOk(
          listing([
            { id: "i1", title: "Long-term thesis on AAPL", subreddit: "investing", score: 800 },
          ])
        );
      }
      return mockOk(listing([]));
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "investing"]);

    expect(result.posts).toHaveLength(3);
    // Sorted by score desc
    expect(result.posts[0].id).toBe("i1");
    expect(result.posts[0].score).toBe(800);
    expect(result.posts[1].id).toBe("a1");
    expect(result.posts[2].id).toBe("a2");

    // Sentiment populated
    expect(result.posts[0].sentiment).toBeDefined();
    expect(["bullish", "bearish", "neutral"]).toContain(result.posts[0].sentiment);

    // Subreddit field is lowercased
    expect(result.posts.every((p) => p.subreddit === p.subreddit.toLowerCase())).toBe(true);

    expect(result.errored).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("one bad sub doesn't tank the whole result (allSettled)", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          listing([{ id: "s1", title: "AAPL bullish setup", subreddit: "stocks", score: 100 }])
        );
      }
      // Simulate a 429 — Reddit being rate-limited
      return new Response("Too Many Requests", { status: 429 });
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "wallstreetbets"]);

    // We still got the working sub's results
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].subreddit).toBe("stocks");
    // 429 returns empty array (not an exception) so it isn't in `errored`
    // — Promise.allSettled is for thrown errors, not just empty fetches.
    // The bad sub just contributes no posts.
  });

  it("word-boundary filter rejects loose ticker matches", async () => {
    // Reddit search occasionally returns posts that contain the ticker
    // as a substring (e.g. "AAPLE" matching "AAPL"). Our regex must
    // require a word boundary so we don't surface false positives.
    const fetchMock = vi.fn(async () =>
      mockOk(
        listing([
          { id: "g1", title: "I bought a AAPLE", subreddit: "stocks", score: 50 },
          { id: "g2", title: "AAPL crushed Q3", subreddit: "stocks", score: 50 },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("g2");
  });

  it("matches both bare ticker and cashtag", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(
        listing([
          { id: "c1", title: "$AAPL to the moon", subreddit: "wallstreetbets", score: 100 },
          { id: "c2", title: "AAPL fundamentals", subreddit: "wallstreetbets", score: 100 },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["wallstreetbets"]);
    expect(result.posts.map((p) => p.id).sort()).toEqual(["c1", "c2"]);
  });

  it("minScore filter drops low-engagement posts", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(
        listing([
          { id: "lo", title: "AAPL random thought", subreddit: "stocks", score: 2 },
          { id: "hi", title: "AAPL detailed DD", subreddit: "stocks", score: 200 },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"], { minScore: 10 });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("hi");
  });

  it("drops stickied (pinned mod) posts", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(
        listing([
          { id: "p1", title: "AAPL Megathread", subreddit: "stocks", score: 500, stickied: true },
          { id: "p2", title: "AAPL hot take", subreddit: "stocks", score: 100 },
        ])
      )
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe("p2");
  });

  it("dedupes posts that appear in multiple subs (by id)", async () => {
    // A crosspost can show up in search for two subs. The dedup-by-id
    // logic in the merge step should keep just one copy.
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/r/stocks/")) {
        return mockOk(
          listing([{ id: "dup", title: "AAPL cross post", subreddit: "stocks", score: 100 }])
        );
      }
      return mockOk(
        listing([{ id: "dup", title: "AAPL cross post", subreddit: "investing", score: 50 }])
      );
    }) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks", "investing"]);
    expect(result.posts).toHaveLength(1);
  });

  it("cache hit on second call within TTL", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(listing([{ id: "k1", title: "AAPL up", subreddit: "stocks", score: 100 }]))
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getRedditMentions("AAPL", ["stocks"]);
    await getRedditMentions("AAPL", ["stocks"]);

    // Second call must hit cache — fetch only called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("malformed JSON response yields empty array for that sub", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("not json at all", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toEqual([]);
  });

  it("handles missing data.children gracefully", async () => {
    const fetchMock = vi.fn(async () => mockOk({ data: {} })) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await getRedditMentions("AAPL", ["stocks"]);
    expect(result.posts).toEqual([]);
  });

  it("normalizes symbol and subreddit names", async () => {
    const fetchMock = vi.fn(async () =>
      mockOk(listing([{ id: "n1", title: "AAPL stuff", subreddit: "Stocks", score: 100 }]))
    ) as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Lowercase symbol + mixed-case sub
    const result = await getRedditMentions("aapl", ["Stocks"]);
    expect(result.symbol).toBe("AAPL");
    expect(result.subreddits).toEqual(["stocks"]);
    expect(result.posts[0].subreddit).toBe("stocks");
  });
});
