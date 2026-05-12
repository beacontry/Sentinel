import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// 2026-05-12 — customer support ticketing. Users open tickets, admins
// reply, status walks through open → responded → resolved/closed.
//
// Email notifications fire on every new message; recipient is the other
// side of the conversation (admin notified on user reply, user notified
// on admin reply).

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"),       // open | responded | resolved | closed
  priority: text("priority").notNull().default("normal"), // low | normal | high
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("support_tickets_user_idx").on(t.userId),
  index("support_tickets_status_idx").on(t.status),
]);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull(), // "user" | "admin"
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("support_messages_ticket_idx").on(t.ticketId),
  index("support_messages_created_idx").on(t.createdAt),
]);
