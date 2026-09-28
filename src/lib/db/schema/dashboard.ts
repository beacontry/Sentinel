import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const dashboardLayouts = pgTable("dashboard_layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  layoutData: jsonb("layout_data").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dashboard_layouts_user_idx").on(t.userId),
  // At most one default per user (migration 0053). The layout PUT upserts
  // against this index; see lockUserLayouts for the writers that move it.
  uniqueIndex("dashboard_layouts_one_default_idx").on(t.userId).where(sql`${t.isDefault}`),
]);
