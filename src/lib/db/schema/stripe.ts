// Stripe webhook idempotency dedup table.
//
// Stripe retries webhooks for up to 3 days on failure AND can deliver
// the same event twice within seconds for at-least-once semantics. Every
// event carries a unique `evt_xxx` ID; the webhook handler claims it with
// an INSERT-OR-CONFLICT-DO-NOTHING on this table before processing and
// sets `completed_at` only after the handler succeeds. A redelivery is
// deduped only when `completed_at` is set; a claim left without it (a
// failed handler whose rollback also failed, or a crash mid-handler) is
// re-claimed after a grace window and reprocessed.
//
// Schema lives in migrations 0036_stripe.sql and
// 0051_stripe_events_completed_at.sql. This Drizzle schema lets the
// handler write to it with type safety.

import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const stripeEventsProcessed = pgTable(
  "stripe_events_processed",
  {
    /** Stripe event ID (e.g., "evt_1NXxxYYZZ..."). Primary key for dedup. */
    eventId: text("event_id").primaryKey(),
    /** Stripe event type — `checkout.session.completed`, `customer.subscription.updated`, etc. */
    eventType: text("event_type").notNull(),
    /** When the event was (last) claimed for processing. */
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * When the handler finished successfully. NULL means claimed but not
     * completed: in flight, or abandoned and reclaimable after the grace window.
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** User the event affected, if resolvable. NULL for system events. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** What we did — short label for forensics ("granted trader", "reverted to free"). */
    actionTaken: text("action_taken"),
  },
  (t) => [
    index("stripe_events_processed_user_idx").on(t.userId, t.processedAt),
    index("stripe_events_processed_type_idx").on(t.eventType, t.processedAt),
  ]
);
