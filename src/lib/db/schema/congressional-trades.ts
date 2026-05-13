import {
  pgTable,
  bigserial,
  text,
  date,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Federal Periodic Transaction Reports (PTRs) — stock trades disclosed by
 * members of Congress. Sourced from official House Clerk + Senate eFD
 * bulk downloads, refreshed daily by /api/cron/refresh-congress.
 *
 * Schema: drizzle/0031_congressional_trades.sql
 */
export const congressionalTrades = pgTable(
  "congressional_trades",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chamber: text("chamber").notNull(), // "House" | "Senate"
    filerName: text("filer_name").notNull(),
    party: text("party"),
    stateDistrict: text("state_district"),
    transactionDate: date("transaction_date").notNull(),
    filingDate: date("filing_date"),
    ticker: text("ticker"),
    assetDescription: text("asset_description"),
    transactionType: text("transaction_type").notNull(),
    amountFrom: numeric("amount_from", { precision: 15, scale: 2 }),
    amountTo: numeric("amount_to", { precision: 15, scale: 2 }),
    ownerType: text("owner_type"),
    sourceDocId: text("source_doc_id"),
    sourceUrl: text("source_url"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("congressional_trades_ticker_idx").on(t.ticker, t.transactionDate),
    index("congressional_trades_txn_date_idx").on(t.transactionDate, t.filingDate),
    index("congressional_trades_chamber_idx").on(t.chamber, t.transactionDate),
    uniqueIndex("congressional_trades_unique").on(
      t.chamber,
      t.filerName,
      t.transactionDate,
      t.ticker,
      t.transactionType,
      t.amountFrom
    ),
  ]
);
