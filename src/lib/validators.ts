import { z } from "zod";

// ─── Auth ──────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Watchlist ────────────────────────────────────────────────────

export const addSymbolSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(10, "Symbol too long")
    .transform((s) => s.toUpperCase().trim()),
});

export const removeSymbolSchema = z.object({
  symbol: z.string().min(1),
});

// ─── Discord Webhooks ─────────────────────────────────────────────

export const createWebhookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => url.startsWith("https://discord.com/api/webhooks/"),
      "Must be a Discord webhook URL"
    ),
  channelName: z.string().max(100).optional(),
  minSignalStrength: z.number().int().min(1).max(2).default(1),
  symbols: z.array(z.string().max(10)).max(50).default([]),
});

export const updateWebhookSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  minSignalStrength: z.number().int().min(1).max(2).optional(),
  symbols: z.array(z.string().max(10)).max(50).optional(),
});

// ─── Feed ─────────────────────────────────────────────────────────

export const publishSignalSchema = z.object({
  signalId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

// ─── AI Chat ──────────────────────────────────────────────────────

export const chatMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000, "Message too long"),
  sessionId: z.string().uuid().optional(),
});

// ─── Trade Journal ──────────────────────────────────────────────────

export const createJournalSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(10, "Symbol too long")
    .transform((s) => s.toUpperCase().trim()),
  title: z.string().min(1, "Title is required").max(200),
  notes: z.string().min(1, "Notes are required").max(5000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  mood: z.enum(["confident", "anxious", "neutral", "fomo", "disciplined"]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  portfolioTradeId: z.string().uuid().optional(),
  traderTradeId: z.string().uuid().optional(),
});

export const updateJournalSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().min(1).max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  mood: z.enum(["confident", "anxious", "neutral", "fomo", "disciplined"]).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

export const deleteJournalSchema = z.object({
  id: z.string().uuid(),
});

// ─── Saved Strategies ───────────────────────────────────────────────

export const createStrategySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  config: z.object({
    symbol: z
      .string()
      .min(1, "Symbol is required")
      .max(10)
      .transform((s) => s.toUpperCase().trim()),
    days: z.number().int().min(7).max(365),
    holdPeriod: z.number().int().min(1).max(100),
    windowSize: z.number().int().min(30).max(200).optional(),
    stepSize: z.number().int().min(1).max(50).optional(),
  }),
});

export const updateStrategySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.object({
    symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase().trim()),
    days: z.number().int().min(7).max(365),
    holdPeriod: z.number().int().min(1).max(100),
    windowSize: z.number().int().min(30).max(200).optional(),
    stepSize: z.number().int().min(1).max(50).optional(),
  }).optional(),
  lastRunAt: z.string().datetime().optional(),
  lastResult: z.any().optional(),
});

export const deleteStrategySchema = z.object({
  id: z.string().uuid(),
});

// ─── Symbol Strategy Assignments ──────────────────────────────────

export const createSymbolStrategySchema = z.object({
  symbol: z.string().min(1).max(10).transform((s) => s.toUpperCase().trim()),
  presetName: z.enum(["conservative", "moderate", "aggressive", "day_trade", "swing", "auto"]).nullable().optional(),
  stopLossPct: z.number().min(0.001).max(0.5),
  takeProfitPct: z.number().min(0.001).max(1.0),
  trailingStopPct: z.number().min(0.001).max(0.5),
  holdPeriod: z.number().int().min(1).max(100),
  atrTuned: z.boolean().default(false),
  lastAtr: z.number().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const deleteSymbolStrategySchema = z.object({
  id: z.string().uuid(),
});

// ─── User Risk Profile ────────────────────────────────────────────

export const updateRiskProfileSchema = z.object({
  accountSize: z.number().min(100).max(10_000_000).optional(),
  maxDailyLossPct: z.number().min(0.1).max(100).optional(),
  maxDrawdownPct: z.number().min(1).max(100).optional(),
  riskTolerance: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  maxPositionPct: z.number().min(0.5).max(100).optional(),
  maxPositionSize: z.number().int().min(1).max(10000).optional(),
  maxSingleTradeLoss: z.number().min(1).max(100000).optional(),
});

// ─── Forum ────────────────────────────────────────────────────────

export const createForumThreadSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Body is required").max(10000),
  categoryId: z.string().uuid("Invalid category"),
});

export const createForumReplySchema = z.object({
  body: z.string().min(1, "Reply is required").max(5000),
  parentReplyId: z.string().uuid().optional(),
});

// ─── Social ───────────────────────────────────────────────────────

export const createSocialPostSchema = z.object({
  content: z.string().min(1, "Content is required").max(500, "Post must be 500 characters or fewer"),
  symbol: z.string().max(10).optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1, "Comment is required").max(1000, "Comment must be 1000 characters or fewer"),
});

// ─── Admin User Management ──────────────────────────────────────

export const adminCreateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  role: z.enum(["user", "admin"]).default("user"),
});

export const adminUpdateUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  email: z.string().email("Invalid email address").optional(),
  role: z.enum(["user", "admin"]).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .optional(),
});

export const adminDeleteUserSchema = z.object({
  id: z.string().uuid(),
});

// ─── Broker Connections ──────────────────────────────────────────

export const createBrokerConnectionSchema = z.object({
  broker: z.enum(["alpaca", "ibkr", "tradier"]),
  label: z.string().min(1, "Label is required").max(100).default("Default"),
  apiKey: z.string().min(1, "API key is required").max(500),
  apiSecret: z.string().min(1, "API secret is required").max(500),
  environment: z.enum(["paper", "live"]).default("paper"),
});

export const updateBrokerConnectionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  apiSecret: z.string().min(1).max(500).optional(),
  environment: z.enum(["paper", "live"]).optional(),
  isActive: z.boolean().optional(),
});

export const deleteBrokerConnectionSchema = z.object({
  id: z.string().uuid(),
});

export const testBrokerConnectionSchema = z.object({
  broker: z.enum(["alpaca", "ibkr", "tradier"]),
  apiKey: z.string().min(1, "API key is required").max(500),
  apiSecret: z.string().min(1, "API secret is required").max(500),
  environment: z.enum(["paper", "live"]).default("paper"),
});

export const placeBrokerOrderSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(10).transform((s) => s.toUpperCase().trim()),
  side: z.enum(["buy", "sell"]),
  qty: z.string().min(1, "Quantity is required"),
  type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).default("day"),
  limitPrice: z.string().optional(),
  stopPrice: z.string().optional(),
});

// ─── Inferred Types ───────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddSymbolInput = z.infer<typeof addSymbolSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type CreateJournalInput = z.infer<typeof createJournalSchema>;
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>;
export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>;
export type CreateSymbolStrategyInput = z.infer<typeof createSymbolStrategySchema>;
export type UpdateRiskProfileInput = z.infer<typeof updateRiskProfileSchema>;
export type CreateForumThreadInput = z.infer<typeof createForumThreadSchema>;
export type CreateForumReplyInput = z.infer<typeof createForumReplySchema>;
export type CreateSocialPostInput = z.infer<typeof createSocialPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminDeleteUserInput = z.infer<typeof adminDeleteUserSchema>;
export type CreateBrokerConnectionInput = z.infer<typeof createBrokerConnectionSchema>;
export type UpdateBrokerConnectionInput = z.infer<typeof updateBrokerConnectionSchema>;
export type TestBrokerConnectionInput = z.infer<typeof testBrokerConnectionSchema>;
export type PlaceBrokerOrderInput = z.infer<typeof placeBrokerOrderSchema>;

// ─── Dashboard Layout ────────────────────────────────────────────

export const updateDashboardLayoutSchema = z.object({
  widgets: z
    .array(z.string().min(1).max(50))
    .min(0)
    .max(20, "Maximum 20 widgets allowed"),
});

export type UpdateDashboardLayoutInput = z.infer<typeof updateDashboardLayoutSchema>;
