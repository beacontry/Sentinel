// Stripe webhook idempotency dedup table.
//
// Stripe retries webhooks for up to 3 days on failure AND can deliver
// the same event twice within seconds for at-least-once semantics. Every
// event carries a unique `evt_xxx` ID; the webhook handler does an
// INSERT-OR-CONFLICT-DO-NOTHING on this table before processing. If the
// event ID already exists, the handler returns 200 immediately without
// re-applying side effects.
//
// Schema lives in migration 0036_stripe.sql. This Drizzle schema lets
// the handler write to it with type safety.

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
    /** When we recorded the event as processed. */
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
