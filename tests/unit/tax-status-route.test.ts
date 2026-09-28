/**
 * WP10 (finding #36): PUT /api/tax-status leaves omitted fields alone.
 *
 * The trader page's MTM checkbox re-asserted the election with
 * `notes: taxStatus?.notes ?? null` and the current year, and the route
 * treated a missing notes field as a clear and stamped mtmDeclaredAt on every
 * write. A tick after a failed status load wiped the user's notes, and any
 * re-assert rewrote a prior election year and the declared date. Omitted now
 * means unchanged, an explicit null still clears, and the declared date is
 * kept with COALESCE.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";

type Row = {
  userId: string;
  hasTraderTaxStatus: boolean;
  mtmElectionYear: number | null;
  mtmDeclaredAt: Date | null;
  notes: string | null;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({
  stored: null as null | Record<string, unknown>,
  lastSet: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => ({ userId: "user-1" }),
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/logger", () => ({
  createRouteLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

vi.mock("@/lib/db", () => {
  // Applies the upsert to one stored row the way Postgres would for the plain
  // values; SQL expressions are recorded for the test to inspect and left
  // unapplied (the stored value stands in for COALESCE keeping it).
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
          returning: async () => {
            state.lastSet = set;
            if (!state.stored) {
              state.stored = { ...values, updatedAt: new Date() };
            } else {
              for (const [k, v] of Object.entries(set)) {
                if (!(v instanceof Object && "queryChunks" in (v as object))) {
                  state.stored[k] = v;
                }
              }
            }
            return [state.stored];
          },
        }),
      }),
    }),
  };
  return { db, withTimeout: async () => [], isStatementTimeout: () => false };
});

import { PUT } from "@/app/api/tax-status/route";

function put(body: unknown): Request {
  return new Request("http://localhost/api/tax-status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DECLARED = new Date("2024-03-01T12:00:00Z");

describe("PUT /api/tax-status keeps what the caller did not send (WP10 #36)", () => {
  beforeEach(() => {
    state.lastSet = null;
    state.stored = {
      userId: "user-1",
      hasTraderTaxStatus: true,
      mtmElectionYear: 2024,
      mtmDeclaredAt: DECLARED,
      notes: "Filed Form 3115 with my CPA",
      updatedAt: new Date("2024-03-01T12:00:00Z"),
    } satisfies Row;
  });

  it("keeps stored notes when the PUT omits them", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: true, mtmElectionYear: 2024 }));
    expect(res.status).toBe(200);
    expect(state.lastSet).not.toHaveProperty("notes");
    const json = await res.json();
    expect(json.notes).toBe("Filed Form 3115 with my CPA");
  });

  it("still clears notes on an explicit null", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: true, mtmElectionYear: 2024, notes: null }));
    expect(res.status).toBe(200);
    expect(state.lastSet).toHaveProperty("notes", null);
    expect((await res.json()).notes).toBeNull();
  });

  it("keeps the prior election year and declared date on a re-assert without a year", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: true }));
    expect(res.status).toBe(200);
    expect(state.lastSet).not.toHaveProperty("mtmElectionYear");
    expect(state.lastSet).not.toHaveProperty("mtmDeclaredAt");
    const json = await res.json();
    expect(json.mtmElectionYear).toBe(2024);
    expect(json.mtmDeclaredAt).toBe(DECLARED.toISOString());
  });

  it("keeps the first declared date when a year is written again (COALESCE)", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: true, mtmElectionYear: 2024 }));
    expect(res.status).toBe(200);
    const declared = state.lastSet?.mtmDeclaredAt;
    expect(declared).toBeInstanceOf(SQL);
    const rendered = new PgDialect().sqlToQuery(declared as SQL).sql;
    expect(rendered).toMatch(/^COALESCE\("user_tax_status"\."mtm_declared_at", now\(\)\)$/);
    expect((await res.json()).mtmDeclaredAt).toBe(DECLARED.toISOString());
  });

  it("clears the year and the declared date on an explicit null year", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: false, mtmElectionYear: null }));
    expect(res.status).toBe(200);
    expect(state.lastSet).toMatchObject({ mtmElectionYear: null, mtmDeclaredAt: null });
    expect(state.lastSet).not.toHaveProperty("notes");
  });

  it("rejects a notes value that is neither a string nor null", async () => {
    const res = await PUT(put({ hasTraderTaxStatus: true, notes: 42 }));
    expect(res.status).toBe(400);
    expect(state.lastSet).toBeNull();
  });
});
