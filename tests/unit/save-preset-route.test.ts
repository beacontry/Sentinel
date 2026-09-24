/**
 * WP08 (finding #12): save-preset flips the global active slot in one
 * transaction.
 *
 * The deactivate-all and activate-one UPDATEs ran as two statements outside a
 * transaction, so a failure between them left no active preset, and an
 * interleaved auto-optimizer flip could leave two. They now share one
 * transaction, and a one-active index violation (a concurrent flip committed
 * first) answers 409 instead of 500.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  committed: [] as Array<Record<string, unknown>>,
  failOnUpdate: 0, // 1-based index of the tx UPDATE that throws; 0 = none
  failWith: null as null | Error,
}));

vi.mock("@/lib/auth", () => ({
  requireAuthWithCsrf: async () => ({ userId: "user-1", email: "u@example.com", role: "user" }),
}));

vi.mock("@/lib/tiers-server", () => ({ checkTier: async () => null }));

vi.mock("@/lib/db", () => {
  const run = { id: "run-1", userId: "user-1", status: "complete", bestParams: { a: 1 } };
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => [run],
  };
  const db = {
    select: () => selectChain,
    // Outside a transaction a write lands immediately and cannot be undone.
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          state.committed.push(v);
        },
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const staged: Array<Record<string, unknown>> = [];
      let n = 0;
      const tx = {
        update: () => ({
          set: (v: Record<string, unknown>) => ({
            where: async () => {
              n++;
              if (n === state.failOnUpdate) throw state.failWith ?? new Error("connection reset");
              staged.push(v);
            },
          }),
        }),
      };
      const out = await cb(tx); // a throw discards `staged`: rollback
      state.committed.push(...staged);
      return out;
    },
  };
  return { db };
});

import { POST } from "@/app/api/optimize/save-preset/route";

function req(): Request {
  return new Request("http://localhost/api/optimize/save-preset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: "run-1" }),
  });
}

describe("save-preset flips the active slot atomically (WP08)", () => {
  beforeEach(() => {
    state.committed = [];
    state.failOnUpdate = 0;
    state.failWith = null;
  });

  it("commits the demote and the promote together", async () => {
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(state.committed).toEqual([{ isActive: false }, { isActive: true }]);
  });

  it("rolls back the demote when the promote fails, leaving the slot as it was", async () => {
    state.failOnUpdate = 2;
    const res = await POST(req() as never);
    expect(res.status).toBe(500);
    expect(state.committed).toEqual([]);
  });

  it("answers 409 when a concurrent flip took the one-active index first", async () => {
    state.failOnUpdate = 2;
    state.failWith = new Error("Failed query: update optimization_runs", {
      cause: { constraint_name: "optimization_runs_one_active_idx" },
    });
    const res = await POST(req() as never);
    expect(res.status).toBe(409);
    expect(state.committed).toEqual([]);
  });
});
