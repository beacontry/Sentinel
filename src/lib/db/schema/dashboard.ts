import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
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
]);
