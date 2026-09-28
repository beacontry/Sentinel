/**
 * Forum GETs no longer race into duplicate boards or lock threads for a whole
 * read (WP12, finding #5).
 *
 * GET /api/forum/categories and POST /api/forum/seed counted the boards and
 * inserted the nine defaults when the count was 0. forum_categories had no
 * unique name, so two first loads that both saw 0 seeded every board twice.
 * GET /api/forum/[threadId] ran `view_count = view_count + 1` first inside its
 * 3s read transaction, so every viewer held the thread row's lock for the
 * whole read. Both seeds now insert ON CONFLICT (name) DO NOTHING (unique
 * index, migration 0054), and the view count is bumped after the read in its
 * own short transaction.
 *
 * The database is drizzle's pg-proxy driver over a small in-memory model, so
 * the routes build their real SQL.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  statements: [] as string[],
  categories: [] as Row[],
  // Both first loads see an empty table: the race the unique index closes.
  countSeesEmpty: false,
  viewCount: 7,
  failViewUpdate: false,
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ userId: "00000000-0000-0000-0000-0000000000b1" }),
  requireAuthWithCsrf: async () => ({ userId: "00000000-0000-0000-0000-0000000000b1", email: "a@example.com", name: "A", role: "admin" }),
}));

vi.mock("@/lib/logger", () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { logger, createRouteLogger: () => logger };
});

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/lib/db/schema");

  function run(sqlText: string, params: unknown[]): unknown[] {
    const q = sqlText.toLowerCase();
    if (q.startsWith("set local")) return [];

    if (q.startsWith("insert into \"forum_categories\"")) {
      // values are (default, $name, $description, $sortOrder, default) per row
      const names = params.filter((_, i) => i % 3 === 0) as string[];
      const inserted: unknown[] = [];
      for (const name of names) {
        if (q.includes("on conflict") && state.categories.some((c) => c.name === name)) continue;
        const id = `cat-${state.categories.length + 1}`;
        state.categories.push({ id, name });
        inserted.push([id]);
      }
      return inserted;
    }
    if (q.startsWith("select count(*)::int from \"forum_categories\"")) {
      return [[state.countSeesEmpty ? 0 : state.categories.length]];
    }
    if (q.startsWith("select") && q.includes("from \"forum_categories\"")) return [];

    if (q.startsWith("update \"forum_threads\"")) {
      if (state.failViewUpdate) throw new Error("lock timeout");
      state.viewCount += 1;
      return [[state.viewCount]];
    }
    if (q.startsWith("select") && q.includes("from \"forum_threads\"")) {
      const now = new Date().toISOString();
      return [["thread-1", "Title", "Body", false, false, state.viewCount, now, now, "u1", "cat-1", "Author", "General"]];
    }
    if (q.startsWith("select") && q.includes("from \"forum_replies\"")) return [];

    throw new Error(`fake db: unhandled statement ${sqlText}`);
  }

  const proxy = drizzle(async (sqlText, params) => {
    state.statements.push(sqlText);
    return { rows: run(sqlText, params) };
  }, { schema });

  const db = new Proxy(proxy, {
    get(target, prop, receiver) {
      if (prop === "transaction") {
        return async (fn: (tx: typeof proxy) => Promise<unknown>) => fn(proxy);
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return {
    db,
    withTimeout: async (_ms: number, fn: (tx: typeof proxy) => Promise<unknown>) => {
      state.statements.push("BEGIN");
      try {
        return await fn(proxy);
      } finally {
        state.statements.push("COMMIT");
      }
    },
    isStatementTimeout: () => false,
  };
});

beforeEach(() => {
  state.statements = [];
  state.categories = [];
  state.countSeesEmpty = false;
  state.viewCount = 7;
  state.failViewUpdate = false;
});

const boardCount = (name: string) => state.categories.filter((c) => c.name === name).length;

describe("forum category seed", () => {
  it("two first loads that both see an empty table seed each board once", async () => {
    const { GET } = await import("@/app/api/forum/categories/route");
    state.countSeesEmpty = true;
    expect((await GET()).status).toBe(200);
    expect((await GET()).status).toBe(200);
    expect(state.categories).toHaveLength(9);
    expect(boardCount("General Discussion")).toBe(1);
  });

  it("the admin seed after a GET seed adds nothing and reports it", async () => {
    const { GET } = await import("@/app/api/forum/categories/route");
    const { POST } = await import("@/app/api/forum/seed/route");
    state.countSeesEmpty = true;
    await GET();
    const res = await POST(new Request("http://localhost/api/forum/seed", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ message: "Seeded", count: 0 });
    expect(boardCount("General Discussion")).toBe(1);
  });

  it("both seeds insert ON CONFLICT (name) DO NOTHING", async () => {
    const { GET } = await import("@/app/api/forum/categories/route");
    const { POST } = await import("@/app/api/forum/seed/route");
    state.countSeesEmpty = true;
    await GET();
    await POST(new Request("http://localhost/api/forum/seed", { method: "POST" }));
    const inserts = state.statements.filter((s) => s.startsWith("insert"));
    expect(inserts).toHaveLength(2);
    for (const s of inserts) expect(s).toMatch(/on conflict \("name"\) do nothing/i);
  });
});

describe("forum thread view count", () => {
  const params = { params: Promise.resolve({ threadId: "thread-1" }) };

  it("is bumped after the read, in its own transaction", async () => {
    const { GET } = await import("@/app/api/forum/[threadId]/route");
    const res = await GET(new Request("http://localhost/api/forum/thread-1"), params);
    expect(res.status).toBe(200);
    const s = state.statements.map((x) =>
      x === "BEGIN" || x === "COMMIT" ? x : x.toLowerCase().startsWith("update") ? "UPDATE" : x.toLowerCase().startsWith("select") ? "SELECT" : "OTHER"
    );
    const update = s.indexOf("UPDATE");
    const firstCommit = s.indexOf("COMMIT");
    expect(update).toBeGreaterThan(firstCommit);
    expect(s.slice(0, firstCommit)).not.toContain("UPDATE");
    expect(s[update - 1]).toBe("BEGIN");
    expect(s[update + 1]).toBe("COMMIT");
  });

  it("the response still counts this view", async () => {
    const { GET } = await import("@/app/api/forum/[threadId]/route");
    const res = await GET(new Request("http://localhost/api/forum/thread-1"), params);
    expect((await res.json()).thread.viewCount).toBe(8);
  });

  it("a failed view-count update still serves the thread", async () => {
    const { GET } = await import("@/app/api/forum/[threadId]/route");
    state.failViewUpdate = true;
    const res = await GET(new Request("http://localhost/api/forum/thread-1"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).thread.viewCount).toBe(7);
  });
});
