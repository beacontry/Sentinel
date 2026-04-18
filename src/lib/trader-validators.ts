import { z } from "zod";

export const traderSignalSchema = z.object({
  symbol: z.string().min(1).max(10),
  signal: z.enum(["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"]),
  price: z.number(),
  volume: z.number().int(),
  indicators: z.record(z.number().nullable()),
  acted_on: z.boolean().default(false),
  timestamp: z.string(),
});

export const traderTradeSchema = z.object({
  trader_id: z.number().int(),
  symbol: z.string().min(1).max(10),
  signal: z.string(),
  action: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().min(1),
  order_type: z.string(),
  limit_price: z.number().nullable().optional(),
  stop_price: z.number().nullable().optional(),
  timestamp: z.string(),
  notes: z.string().nullable().optional(),
});

export const traderTradeUpdateSchema = z.object({
  trader_id: z.number().int(),
  status: z.enum(["FILLED", "CANCELLED", "REJECTED"]),
  fill_price: z.number().nullable().optional(),
  fill_time: z.string().nullable().optional(),
  pnl: z.number().nullable().optional(),
});

export const traderPnlSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  realized_pnl: z.number(),
  unrealized_pnl: z.number(),
  trades_count: z.number().int(),
  halted: z.boolean().default(false),
});

export const traderPositionsSchema = z.object({
  positions: z.array(z.object({
    symbol: z.string().min(1).max(10),
    quantity: z.number().int(),
    entry_price: z.number(),
    current_price: z.number(),
    unrealized_pnl: z.number(),
    stop_price: z.number().nullable().optional(),
  })),
});
