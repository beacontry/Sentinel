import { z } from "zod";

// Single source of truth for which env vars exist and which are required.
// Use validateEnv() at boot to fail fast in production when a required
// secret is missing — better than discovering a corrupt encryption key
// the first time a user logs in.

const productionRequired = process.env.NODE_ENV === "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Required for any persisted data
  DATABASE_URL: z.string().url(),

  // Required for session signing — refuse the dev fallback in production
  JWT_SECRET: productionRequired
    ? z.string().min(32, "JWT_SECRET must be 32+ chars in production")
    : z.string().min(8).optional(),

  // Required for at-rest encryption (broker tokens, etc.)
  ENCRYPTION_KEY: productionRequired
    ? z.string().min(32, "ENCRYPTION_KEY must be 32+ chars in production")
    : z.string().optional(),

  // Required for cron route authentication
  CRON_SECRET: productionRequired
    ? z.string().min(16, "CRON_SECRET must be 16+ chars in production")
    : z.string().optional(),

  // Optional — feature degrades if absent
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TRADER_SECRET: z.string().optional(),
  TRADER_URL: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),

  // Configuration
  MARKET_DATA_PROVIDER: z.string().optional(),
  CACHE_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  FORCE_HTTPS: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Hybrid pipeline feature flags
  HYBRID_AI_SCORING_ENABLED: z.string().optional(),
  HYBRID_ANALYST_ENABLED: z.string().optional(),
  HYBRID_OPTIONS_ENABLED: z.string().optional(),
  HYBRID_SENTIMENT_ENABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function validateEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
