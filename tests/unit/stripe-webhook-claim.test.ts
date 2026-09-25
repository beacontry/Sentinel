/**
 * POST /api/webhooks/stripe claim lifecycle (WP09, finding #9).
 *
 * The event row is claimed before the handler runs and marked completed_at
 * after it succeeds. Only a completed row dedups a redelivery:
 *
 *   - handler throws and the rollback DELETE also throws -> the rollback
 *     failure is logged with the event id, and a redelivery after the grace
 *     window re-claims and reprocesses the event (previously deduped forever);
 *   - a fresh uncompleted claim -> 409 so Stripe retries;
 *   - a completed event redelivered -> 200 deduped.
 *
 * The db mock models the stripe_events_processed row semantics by call shape:
 * insert-on-conflict-do-nothing, the reclaim UPDATE (sets processedAt only),
 * the completion UPDATE (sets completedAt), DELETE and SELECT.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

interface Row {
  eventId: string;
  eventType: string;
  processedAt: Date;
  completedAt: Date | null;
  actionTaken: string | null;
}

const GRACE_MS = 5 * 60 * 1000;

const state = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  handlerThrows: false,
  deleteThrows: false,
  handlerRuns: 0,
  errors: [] as Array<{ obj: unknown; msg: unknown }>,
  event: null as null | { id: string; type: string; data: { object: unknown } },
}));

vi.mock("@/lib/logger", () => {
  const make = (): Record<string, unknown> => ({
    info: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    error: (obj: unknown, msg?: unknown) => {
      state.errors.push({ obj, msg });
    },
    child: () => make(),
  });
  const logger = make();
  return { logger, createRouteLogger: () => make(), default: logger };
});

vi.mock("@/lib/system-config", () => ({ getStripeWebhookSecret: async () => "whsec_test" }));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: async () => ({
    webhooks: { constructEvent: () => state.event },
  }),
}));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return { ...actual, writeAudit: vi.fn(async () => {}) };
});

vi.mock("@/lib/db", async () => {
  const { stripeEventsProcessed } = await import("@/lib/db/schema/stripe");
  const now = () => new Date();

  const db = {
    insert: (table: unknown) => ({
      values: (v: { eventId: string; eventType: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (table !== stripeEventsProcessed) throw new Error("unexpected insert");
            if (state.rows.has(v.eventId)) return [];
            state.rows.set(v.eventId, {
              eventId: v.eventId,
              eventType: v.eventType,
              processedAt: now(),
              completedAt: null,
              actionTaken: null,
            });
            return [{ eventId: v.eventId }];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          if (table !== stripeEventsProcessed) throw new Error("unexpected update");
          const id = state.event!.id;
          if ("completedAt" in patch) {
            // Completion marker.
            const row = state.rows.get(id);
            if (row) {
              row.completedAt = patch.completedAt as Date;
              row.actionTaken = (patch.actionTaken as string | null) ?? null;
            }
            return Promise.resolve([]);
          }
          // Reclaim: WHERE completed_at IS NULL AND processed_at < now() - grace.
          return {
            returning: async () => {
              const row = state.rows.get(id);
              if (!row || row.completedAt || now().getTime() - row.processedAt.getTime() <= GRACE_MS) {
                return [];
              }
              row.processedAt = now();
              return [{ eventId: id }];
            },
          };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table !== stripeEventsProcessed) throw new Error("unexpected delete");
        if (state.deleteThrows) throw new Error("connection terminated");
        const row = state.rows.get(state.event!.id);
        if (row && !row.completedAt) state.rows.delete(row.eventId);
      },
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === stripeEventsProcessed) {
            const row = state.rows.get(state.event!.id);
            return Promise.resolve(row ? [{ completedAt: row.completedAt }] : []);
          }
          // users lookup inside the handler (findUserByStripeCustomer).
          state.handlerRuns++;
          const result = state.handlerThrows
            ? Promise.reject(new Error("connection terminated"))
            : Promise.resolve([]);
          result.catch(() => {});
          return Object.assign(result, { limit: () => result });
        },
      }),
    }),
  };
  return { db };
});

import { POST } from "@/app/api/webhooks/stripe/route";

function checkoutEvent(id: string) {
  return {
    id,
    type: "checkout.session.completed",
    data: { object: { mode: "subscription", customer: "cus_1", subscription: "sub_1" } },
  };
}

function deliver() {
  return POST(
    new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=x" },
    })
  );
}

beforeEach(() => {
  state.rows.clear();
  state.handlerThrows = false;
  state.deleteThrows = false;
  state.handlerRuns = 0;
  state.errors = [];
  state.event = checkoutEvent("evt_1");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stripe webhook claim lifecycle", () => {
  it("logs a failed rollback and reprocesses the event after the grace window", async () => {
    state.handlerThrows = true;
    state.deleteThrows = true;

    const first = await deliver();
    expect(first.status).toBe(500);
    // The claim survived (the rollback failed) but is not completed.
    expect(state.rows.get("evt_1")?.completedAt).toBeNull();
    const rollbackLog = state.errors.find((e) => String(e.msg).includes("rollback failed"));
    expect(rollbackLog).toBeDefined();
    expect((rollbackLog!.obj as { eventId: string }).eventId).toBe("evt_1");

    // Stripe retries while the claim is fresh: not deduped, asked to retry.
    state.handlerThrows = false;
    state.deleteThrows = false;
    vi.setSystemTime(new Date("2026-09-23T12:01:00Z"));
    const early = await deliver();
    expect(early.status).toBe(409);
    expect(state.handlerRuns).toBe(1);

    // After the grace window the abandoned claim is re-claimed and reprocessed.
    vi.setSystemTime(new Date("2026-09-23T12:10:00Z"));
    const retry = await deliver();
    expect(retry.status).toBe(200);
    const body = await retry.json();
    expect(body.deduped).toBeUndefined();
    expect(state.handlerRuns).toBe(2);
    expect(state.rows.get("evt_1")?.completedAt).toBeInstanceOf(Date);
    expect(state.rows.get("evt_1")?.actionTaken).toBe("no_user_link");
  });

  it("releases the claim when the handler fails and the rollback succeeds", async () => {
    state.handlerThrows = true;
    const first = await deliver();
    expect(first.status).toBe(500);
    expect(state.rows.has("evt_1")).toBe(false);

    state.handlerThrows = false;
    const retry = await deliver();
    expect(retry.status).toBe(200);
    expect(state.handlerRuns).toBe(2);
  });

  it("dedups a redelivery of a completed event", async () => {
    const first = await deliver();
    expect(first.status).toBe(200);
    expect(state.rows.get("evt_1")?.completedAt).toBeInstanceOf(Date);

    vi.setSystemTime(new Date("2026-09-23T13:00:00Z"));
    const again = await deliver();
    expect(again.status).toBe(200);
    expect((await again.json()).deduped).toBe(true);
    expect(state.handlerRuns).toBe(1);
  });

  it("answers non-2xx for a fresh in-flight claim so Stripe retries", async () => {
    state.rows.set("evt_1", {
      eventId: "evt_1",
      eventType: "checkout.session.completed",
      processedAt: new Date("2026-09-23T11:59:30Z"),
      completedAt: null,
      actionTaken: null,
    });
    const res = await deliver();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EVENT_IN_FLIGHT");
    expect(body.error.retryable).toBe(true);
    expect(state.handlerRuns).toBe(0);
  });
});
