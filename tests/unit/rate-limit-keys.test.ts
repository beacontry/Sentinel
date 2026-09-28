/**
 * Rate-limit keys cannot be rotated with X-Forwarded-For (WP12, finding #14).
 *
 * The admin create-user limiter keyed on the raw x-forwarded-for chain, and
 * the waitlist limiter fell back to the first XFF hop when cf-connecting-ip
 * was absent. Both headers are client-settable, so a new XFF value per
 * request meant a new bucket per request. Admin create-user now keys on the
 * admin's user id; the waitlist keys only on the proxy-trusted header via
 * getRateLimitIp, which collapses direct-to-origin traffic into one bucket in
 * production.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";

const state = vi.hoisted(() => ({
  userId: "",
  waitlistInserts: 0,
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithCsrf: async () => ({ userId: state.userId, email: "a@example.com", name: "A", role: "admin" }),
  requireAuthForRead: async () => ({ userId: state.userId, email: "a@example.com", name: "A", role: "admin" }),
  hashPassword: async () => "hash",
}));

vi.mock("@/lib/logger", () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { logger, createRouteLogger: () => logger };
});

vi.mock("@/lib/audit", () => ({
  extractIp: (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
}));

vi.mock("@/lib/db", () => ({
  db: {
    execute: async () => {
      state.waitlistInserts++;
      return [];
    },
  },
  withTimeout: async () => [],
  isStatementTimeout: () => false,
}));

function adminCreate(xff: string): Request {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": xff },
    // Invalid on purpose: the limiter runs first, then validation answers 400
    // without touching the database.
    body: JSON.stringify({}),
  });
}

function waitlist(headers: Record<string, string>) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: `${randomUUID()}@example.com` }),
  });
}

describe("admin create-user limiter keys on the user id", () => {
  beforeEach(() => {
    state.userId = randomUUID();
  });

  it("a new X-Forwarded-For on every request does not get a new bucket", async () => {
    const { POST } = await import("@/app/api/admin/users/route");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(adminCreate(`203.0.113.${i}, 198.51.100.7`));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("another admin has their own bucket", async () => {
    const { POST } = await import("@/app/api/admin/users/route");
    for (let i = 0; i < 10; i++) await POST(adminCreate("203.0.113.1"));
    expect((await POST(adminCreate("203.0.113.1"))).status).toBe(429);
    state.userId = randomUUID();
    expect((await POST(adminCreate("203.0.113.1"))).status).toBe(400);
  });
});

describe("waitlist limiter keys on the trusted header only", () => {
  beforeEach(() => {
    state.waitlistInserts = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("in production, rotating XFF without cf-connecting-ip shares one bucket", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/waitlist/route");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await POST(waitlist({ "x-forwarded-for": `192.0.2.${i}` }) as never);
      statuses.push(res.status);
    }
    expect(statuses[5]).toBe(429);
    expect(state.waitlistInserts).toBeLessThanOrEqual(5);
  });

  it("with cf-connecting-ip, a changing XFF does not change the key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/waitlist/route");
    const cf = `trusted-${randomUUID()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        waitlist({ "cf-connecting-ip": cf, "x-forwarded-for": `192.0.2.${i}` }) as never
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("a different trusted IP gets its own bucket", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/waitlist/route");
    const res = await POST(waitlist({ "cf-connecting-ip": `trusted-${randomUUID()}` }) as never);
    expect(res.status).toBe(200);
  });
});
