/**
 * Default-layout save and first risk-profile save are atomic upserts
 * (WP12, finding #16).
 *
 * PUT /api/dashboard/layout selected the user's default layout and inserted
 * one when none existed, so two concurrent autosaves both inserted a default
 * and the read (LIMIT 1, no ORDER BY) flipped between them. PATCH
 * /api/risk-profile did the same select-then-insert outside any try/catch, so
 * a concurrent first save hit the unique index and escaped as an unlogged
 * framework 500.
 *
 * The database is faked with drizzle's pg-proxy driver, so the routes build
 * their real SQL; the fake applies each statement to a small in-memory model
 * with Postgres's unique-index and ON CONFLICT semantics. The race is modelled
 * as another request's row landing right after this request's first
 * statement, which is the window the old code left open. (Migration 0053 and
 * the generated statements were also run against a scratch Postgres; see the
 * commit message.)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  userId: "00000000-0000-0000-0000-0000000000a1",
  statements: [] as string[],
  layouts: [] as Row[],
  profiles: new Map<string, Row>(),
  // Runs once, after this request's first SQL statement.
  afterFirst: null as null | (() => void),
  audits: [] as Row[],
  input: {} as Row,
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ userId: state.userId }),
  requireAuthWithCsrf: async () => ({ userId: state.userId, email: "u@example.com", name: "U", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/logger", () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { logger, createRouteLogger: () => logger };
});

vi.mock("@/lib/audit", () => ({
  AuditAction: { RISK_PROFILE_UPDATED: "risk_profile.updated" },
  writeAudit: async (params: Row) => {
    state.audits.push(params);
    return null;
  },
}));

vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { getTableColumns } = await import("drizzle-orm");
  const schema = await import("@/lib/db/schema");

  function uniqueViolation(index: string): Error {
    return Object.assign(new Error(`duplicate key value violates unique constraint "${index}"`), {
      code: "23505",
      constraint_name: index,
    });
  }

  const profileColumns = Object.keys(getTableColumns(schema.userRiskProfiles));
  function profileRow(p: Row): unknown[] {
    return profileColumns.map((k) => p[k] ?? null);
  }

  function run(sqlText: string, params: unknown[]): unknown[] {
    const q = sqlText.toLowerCase();

    if (q.includes("pg_advisory_xact_lock")) return [];

    if (q.includes('"dashboard_layouts"')) {
      const widgetsParam = params.find((p) => typeof p === "string" && p.includes("widgets"));
      const mine = () => state.layouts.filter((l) => l.userId === state.userId && l.isDefault);
      if (q.startsWith("insert")) {
        const existing = mine()[0];
        if (existing) {
          if (!q.includes("on conflict")) throw uniqueViolation("dashboard_layouts_one_default_idx");
          existing.layoutData = widgetsParam;
          return [];
        }
        state.layouts.push({ id: `layout-${state.layouts.length + 1}`, userId: state.userId, isDefault: true, layoutData: widgetsParam });
        return [];
      }
      if (q.startsWith("select")) return mine().map((l) => [l.id]);
      if (q.startsWith("update")) {
        const target = state.layouts.find((l) => params.includes(l.id));
        if (target) target.layoutData = widgetsParam;
        return [];
      }
    }

    if (q.includes('"user_risk_profiles"')) {
      const existing = state.profiles.get(state.userId);
      if (q.startsWith("insert")) {
        if (existing) {
          if (!q.includes("on conflict")) throw uniqueViolation("risk_profiles_user_idx");
          return [];
        }
        const created = { id: "profile-1", userId: state.userId, ...state.input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        state.profiles.set(state.userId, created);
        return [profileRow(created)];
      }
      if (q.startsWith("select")) return existing ? [profileRow(existing)] : [];
      if (q.startsWith("update")) {
        if (!existing) return [];
        Object.assign(existing, state.input, { updatedAt: new Date().toISOString() });
        return [profileRow(existing)];
      }
    }

    throw new Error(`fake db: unhandled statement ${sqlText}`);
  }

  const proxy = drizzle(async (sqlText, params) => {
    state.statements.push(sqlText);
    const rows = run(sqlText, params);
    if (state.afterFirst) {
      const hook = state.afterFirst;
      state.afterFirst = null;
      hook();
    }
    return { rows };
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
    withTimeout: async (_ms: number, fn: (tx: typeof proxy) => Promise<unknown>) => fn(proxy),
    isStatementTimeout: () => false,
  };
});

function put(widgets: string[]): Request {
  return new Request("http://localhost/api/dashboard/layout", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ widgets }),
  });
}

function patch(body: Row) {
  return new Request("http://localhost/api/risk-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.statements = [];
  state.layouts = [];
  state.profiles = new Map();
  state.afterFirst = null;
  state.audits = [];
  state.input = {};
});

describe("PUT /api/dashboard/layout", () => {
  async function widgetIds(): Promise<[string, string]> {
    const { DEFAULT_LAYOUT } = await import("@/lib/widget-registry");
    return [DEFAULT_LAYOUT[0], DEFAULT_LAYOUT[1]];
  }

  it("a concurrent first save leaves one default holding this save's widgets", async () => {
    const [a, b] = await widgetIds();
    const { PUT } = await import("@/app/api/dashboard/layout/route");
    // Another tab's autosave inserts the default right after our first statement.
    state.afterFirst = () => {
      state.layouts.push({ id: "other-tab", userId: state.userId, isDefault: true, layoutData: JSON.stringify({ widgets: [{ id: a }] }) });
    };
    const res = await PUT(put([b]));
    expect(res.status).toBe(200);
    const defaults = state.layouts.filter((l) => l.isDefault);
    expect(defaults).toHaveLength(1);
    expect(JSON.parse(defaults[0].layoutData as string)).toEqual({ widgets: [{ id: b }] });
  });

  it("writes with one INSERT ... ON CONFLICT against the partial index, under the user lock", async () => {
    const [a] = await widgetIds();
    const { PUT } = await import("@/app/api/dashboard/layout/route");
    await PUT(put([a]));
    const writes = state.statements.filter((s) => s.toLowerCase().includes('"dashboard_layouts"'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/on conflict \("user_id"\) where "dashboard_layouts"\."is_default" do update/i);
    expect(state.statements[0]).toMatch(/pg_advisory_xact_lock/);
  });

  it("POST /api/dashboard/layouts takes the user lock before it reads or writes", async () => {
    const [a] = await widgetIds();
    const { POST } = await import("@/app/api/dashboard/layouts/route");
    const res = await POST(
      new Request("http://localhost/api/dashboard/layouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Mine", widgets: [a] }),
      })
    );
    expect(res.status).toBe(200);
    expect(state.statements[0]).toMatch(/pg_advisory_xact_lock/);
  });

  it("the default-layout read is ordered", async () => {
    const { GET } = await import("@/app/api/dashboard/layout/route");
    await GET().catch(() => undefined);
    const read = state.statements.find((s) => s.toLowerCase().startsWith("select"));
    expect(read).toMatch(/order by "dashboard_layouts"\."created_at" desc, "dashboard_layouts"\."id" desc/i);
  });
});

describe("PATCH /api/risk-profile", () => {
  it("a concurrent first save is not a 500: one row, and this request updates it", async () => {
    const { PATCH } = await import("@/app/api/risk-profile/route");
    state.input = { maxPositionPct: 10 };
    // The other request creates the profile right after our first statement.
    state.afterFirst = () => {
      if (!state.profiles.has(state.userId)) {
        state.profiles.set(state.userId, { id: "profile-other", userId: state.userId, maxPositionPct: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    };
    const res = await PATCH(patch({ maxPositionPct: 10 }) as never);
    expect(res.status).toBe(200);
    expect(state.profiles.size).toBe(1);
    expect(state.profiles.get(state.userId)?.maxPositionPct).toBe(10);
  });

  it("first save creates and audits the creation", async () => {
    const { PATCH } = await import("@/app/api/risk-profile/route");
    state.input = { maxPositionPct: 10 };
    const res = await PATCH(patch({ maxPositionPct: 10 }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).profile.maxPositionPct).toBe(10);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].metadata).toEqual({ created: true, fields: { maxPositionPct: 10 } });
    expect(state.statements[0]).toMatch(/on conflict \("user_id"\) do nothing/i);
  });

  it("an update diffs against the row read FOR UPDATE and audits only changed fields", async () => {
    const { PATCH } = await import("@/app/api/risk-profile/route");
    state.profiles.set(state.userId, { id: "profile-1", userId: state.userId, maxPositionPct: 5, maxDrawdownPct: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    state.input = { maxPositionPct: 10, maxDrawdownPct: 20 };
    const res = await PATCH(patch({ maxPositionPct: 10, maxDrawdownPct: 20 }) as never);
    expect(res.status).toBe(200);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].metadata).toEqual({ changes: { maxPositionPct: { from: 5, to: 10 } } });
    expect(state.statements.some((s) => /select .* from "user_risk_profiles" .* for update/i.test(s))).toBe(true);
  });

  it("an unchanged save writes no audit row", async () => {
    const { PATCH } = await import("@/app/api/risk-profile/route");
    state.profiles.set(state.userId, { id: "profile-1", userId: state.userId, maxPositionPct: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    state.input = { maxPositionPct: 5 };
    const res = await PATCH(patch({ maxPositionPct: 5 }) as never);
    expect(res.status).toBe(200);
    expect(state.audits).toHaveLength(0);
  });
});
