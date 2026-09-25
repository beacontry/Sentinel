/**
 * The DB role re-check tells a failed lookup apart from a missing role
 * (WP12, finding #15).
 *
 * getCurrentRole caught every error and returned null, so a connection
 * failure or connect timeout on the role lookup answered 403 Forbidden on
 * every admin route with nothing in the logs. Admins read that as a revoked
 * role. A failed lookup is now logged and answered 503 with a retryable
 * envelope; a missing user or role is still 403. Both deny access.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: "" as string,
  lookup: "row" as "row" | "missing" | "throw",
  role: "admin" as string,
  errors: [] as Array<{ obj: Record<string, unknown>; msg: string }>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "sentinel-session" && state.token ? { value: state.token } : undefined),
  }),
}));

vi.mock("@/lib/csrf", () => ({ requireCsrf: async () => null }));

vi.mock("@/lib/logger", () => {
  const logger = {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: (obj: Record<string, unknown>, msg: string) => {
      state.errors.push({ obj, msg });
    },
  };
  return { logger, createRouteLogger: () => logger };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (state.lookup === "throw") {
              throw new Error("write CONNECT_TIMEOUT db:5432");
            }
            return state.lookup === "missing" ? [] : [{ role: state.role }];
          },
        }),
      }),
    }),
  },
}));

async function loadAuth() {
  const auth = await import("@/lib/auth");
  state.token = await auth.createToken({
    userId: "00000000-0000-0000-0000-000000000001",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
  });
  return auth;
}

function post(): Request {
  return new Request("http://localhost/api/admin/users", { method: "POST" });
}

describe("role gate: failed lookup vs missing role (WP12 #15)", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "test-secret-that-is-long-enough-for-hs256-signing");
    state.lookup = "row";
    state.role = "admin";
    state.errors = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requireAuthWithCsrf answers 503 retryable and logs when the lookup throws", async () => {
    const auth = await loadAuth();
    state.lookup = "throw";
    const res = await auth.requireAuthWithCsrf(post(), ["admin"]);
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(503);
    expect(r.headers.get("Retry-After")).toBe("5");
    const body = await r.json();
    expect(body).toMatchObject({ code: "SERVICE_UNAVAILABLE", retryable: true });
    // The driver message is logged server-side, never returned to the client.
    expect(JSON.stringify(body)).not.toContain("CONNECT_TIMEOUT");
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].obj).toMatchObject({
      err: "write CONNECT_TIMEOUT db:5432",
      userId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("requireAuthForRead answers 503 retryable when the lookup throws", async () => {
    const auth = await loadAuth();
    state.lookup = "throw";
    const res = await auth.requireAuthForRead(["admin"]);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(503);
    expect(await (res as Response).json()).toMatchObject({ retryable: true });
  });

  it("a missing user row is still 403, with nothing logged", async () => {
    const auth = await loadAuth();
    state.lookup = "missing";
    const write = await auth.requireAuthWithCsrf(post(), ["admin"]);
    const read = await auth.requireAuthForRead(["admin"]);
    expect((write as Response).status).toBe(403);
    expect((read as Response).status).toBe(403);
    expect(state.errors).toHaveLength(0);
  });

  it("a demoted user is 403 even though the token still says admin", async () => {
    const auth = await loadAuth();
    state.role = "user";
    const res = await auth.requireAuthWithCsrf(post(), ["admin"]);
    expect((res as Response).status).toBe(403);
  });

  it("a live admin passes and gets the live role", async () => {
    const auth = await loadAuth();
    const res = await auth.requireAuthForRead(["admin"]);
    expect(res).not.toBeInstanceOf(Response);
    expect((res as { role: string }).role).toBe("admin");
  });

  it("requireRole throws the distinct lookup error, never resolves", async () => {
    const auth = await loadAuth();
    state.lookup = "throw";
    await expect(auth.requireRole(["admin"])).rejects.toBeInstanceOf(auth.RoleLookupUnavailableError);
    state.lookup = "missing";
    await expect(auth.requireRole(["admin"])).rejects.toThrow("Forbidden");
  });
});
