import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const taxDocuments = pgTable("tax_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  taxYear: integer("tax_year").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tax_documents_user_idx").on(t.userId),
  index("tax_documents_year_idx").on(t.taxYear),
]);

export const taxReports = pgTable("tax_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taxYear: integer("tax_year").notNull(),
  reportData: jsonb("report_data").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tax_reports_user_idx").on(t.userId),
  index("tax_reports_year_idx").on(t.taxYear),
]);

export const taxHarvestingSuggestions = pgTable("tax_harvesting_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  suggestion: text("suggestion").notNull(),
  potentialSavings: real("potential_savings"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tax_harvesting_user_idx").on(t.userId),
  index("tax_harvesting_symbol_idx").on(t.symbol),
]);
