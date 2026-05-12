/**
 * Server-wide encrypted configuration.
 *
 * Replaces the env-only model where rotating GROQ_API_KEY required SSH +
 * podman recreate. Admin UI at /dashboard/admin/system-config writes to the
 * `system_config` table; runtime reads here.
 *
 * Lookup order:
 *   1. In-memory cache (60s TTL) — keyed by config key
 *   2. DB row (decrypted)
 *   3. process.env[<key>] fallback — preserves "works locally without DB row"
 *   4. null
 *
 * Plaintext never leaves this module's return values for the admin UI path;
 * listConfig() returns last-4-char masks. Audit metadata only records the
 * key name + actor + "had-old-value" bit, never the value itself.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { systemConfig } from "@/lib/db/schema/system-config";
import { encrypt, decrypt } from "@/lib/crypto";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("system-config");

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  value: string | null;
  expiry: number;
}

const g = globalThis as typeof globalThis & {
  __sysConfigCache?: Map<string, CacheEntry>;
};
g.__sysConfigCache ??= new Map();
const cache = g.__sysConfigCache;

/**
 * Keys the system-config table is allowed to store. Anything outside this
 * allow-list is rejected — admins shouldn't be able to silently overwrite
 * arbitrary env vars from the UI.
 *
 * The first entry per provider is the canonical name; add aliases below if
 * you ever rotate naming.
 */
export const KNOWN_KEYS = [
  "GROQ_API_KEY",
  "FINNHUB_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export type KnownKey = (typeof KNOWN_KEYS)[number];

export function isKnownKey(key: string): key is KnownKey {
  return (KNOWN_KEYS as readonly string[]).includes(key);
}

/**
 * Mask a value for display: keep last 4 chars, replace rest with •
 * Returns "Not set" for empty/null, "••••" for very short values to avoid
 * leaking length info.
 */
export function maskValue(value: string | null): string {
  if (!value) return "Not set";
  if (value.length < 8) return "•".repeat(8);
  return "•".repeat(Math.max(8, value.length - 4)) + value.slice(-4);
}

/** Invalidate the entire in-memory cache or just one key. Used after setConfig and in tests. */
export function invalidateCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Read a config value. DB first, env fallback. Returns null when neither
 * has a value. Async because DB reads are async — fits naturally with the
 * existing LLM callers, which are all already async.
 */
export async function getConfig(key: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiry > now) {
    return cached.value;
  }

  let value: string | null = null;
  try {
    const [row] = await db
      .select({ valueEncrypted: systemConfig.valueEncrypted })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (row?.valueEncrypted) {
      try {
        value = decrypt(row.valueEncrypted);
      } catch (err) {
        // Tampered ciphertext or wrong ENCRYPTION_KEY. Log and fall through
        // to env fallback rather than crashing the LLM call path.
        log.error(
          { key, err: err instanceof Error ? err.message : "unknown" },
          "Failed to decrypt system_config row — falling back to env"
        );
      }
    }
  } catch (err) {
    // DB unreachable / table missing pre-migration — fall through to env.
    log.warn(
      { key, err: err instanceof Error ? err.message : "unknown" },
      "system_config read failed — falling back to env"
    );
  }

  if (!value) {
    value = process.env[key] ?? null;
  }

  cache.set(key, { value, expiry: now + CACHE_TTL_MS });
  return value;
}

/**
 * Write a config value. Encrypts before INSERT, invalidates cache, writes
 * an audit row. Never logs the value itself.
 */
export async function setConfig(
  key: string,
  value: string,
  actor: { userId: string; email?: string | null; role?: string | null },
  request?: Request
): Promise<void> {
  if (!isKnownKey(key)) {
    throw new Error(`Unknown config key: ${key}. Allow-list: ${KNOWN_KEYS.join(", ")}`);
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Value must be a non-empty string");
  }
  // Generous upper bound — real API keys are 32–256 chars. Anything bigger
  // is almost certainly a mistake (pasted file contents, etc.).
  if (value.length > 2048) {
    throw new Error("Value exceeds 2048-character limit");
  }

  // Look up "did this key already have a value?" for the audit row — without
  // ever exposing the prior plaintext.
  let hadOldValue = false;
  try {
    const [existing] = await db
      .select({ key: systemConfig.key })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    hadOldValue = !!existing;
  } catch {
    /* table missing pre-migration; treat as no prior value */
  }

  const ciphertext = encrypt(value);

  // Upsert via ON CONFLICT — Drizzle's onConflictDoUpdate covers it.
  await db
    .insert(systemConfig)
    .values({
      key,
      valueEncrypted: ciphertext,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: {
        valueEncrypted: ciphertext,
        updatedBy: actor.userId,
        updatedAt: new Date(),
      },
    });

  invalidateCache(key);

  await writeAudit({
    actor: {
      userId: actor.userId,
      email: actor.email ?? null,
      role: actor.role ?? null,
    },
    action: AuditAction.SYSTEM_CONFIG_UPDATED,
    resourceType: "system_config",
    resourceId: key,
    metadata: { key, hadOldValue, valueLength: value.length },
    request: request ?? null,
  });
}

/**
 * List all known keys with their current state, masked. Never returns
 * plaintext. Used by the admin UI.
 */
export interface ConfigListing {
  key: KnownKey;
  hasValue: boolean;
  masked: string;
  source: "db" | "env" | "none";
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function listConfig(): Promise<ConfigListing[]> {
  // Pull all rows in one query, then build the listing from KNOWN_KEYS so
  // unset keys still appear in the UI.
  type Row = {
    key: string;
    valueEncrypted: string;
    updatedAt: Date;
    updatedBy: string | null;
  };
  let rows: Row[] = [];
  try {
    rows = await db
      .select({
        key: systemConfig.key,
        valueEncrypted: systemConfig.valueEncrypted,
        updatedAt: systemConfig.updatedAt,
        updatedBy: systemConfig.updatedBy,
      })
      .from(systemConfig);
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "listConfig DB read failed — returning env-only view"
    );
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return KNOWN_KEYS.map((key): ConfigListing => {
    const row = byKey.get(key);
    if (row) {
      let plaintext: string | null = null;
      try {
        plaintext = decrypt(row.valueEncrypted);
      } catch (err) {
        log.error(
          { key, err: err instanceof Error ? err.message : "unknown" },
          "Failed to decrypt for listing — treating as not-set"
        );
      }
      return {
        key,
        hasValue: !!plaintext,
        masked: maskValue(plaintext),
        source: plaintext ? "db" : "none",
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
      };
    }
    const envValue = process.env[key];
    return {
      key,
      hasValue: !!envValue,
      masked: maskValue(envValue ?? null),
      source: envValue ? "env" : "none",
      updatedAt: null,
      updatedBy: null,
    };
  });
}

/**
 * Smoke-test a candidate key against the live provider WITHOUT saving it.
 * Used by the admin UI's "Test before save" button. Returns ok + optional
 * error message. Never logs the candidate value.
 */
export async function testConfig(
  key: string,
  value: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isKnownKey(key)) {
    return { ok: false, error: `Unknown key: ${key}` };
  }
  if (!value) {
    return { ok: false, error: "Empty value" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    switch (key) {
      case "GROQ_API_KEY": {
        // 1-token completion — cheapest valid call that proves the key works.
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${value}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        });
        if (res.ok) return { ok: true };
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Groq ${res.status}: ${body.slice(0, 200)}` };
      }
      case "FINNHUB_API_KEY": {
        // /quote on a guaranteed-to-exist symbol; 401 == bad key.
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: "Finnhub rejected key (401/403)" };
        }
        if (!res.ok) {
          return { ok: false, error: `Finnhub ${res.status}` };
        }
        const data = (await res.json().catch(() => null)) as { c?: number } | null;
        if (data && typeof data.c === "number") return { ok: true };
        return { ok: false, error: "Finnhub returned unexpected payload" };
      }
      case "ANTHROPIC_API_KEY": {
        // Minimal /messages call. Anthropic rejects bad keys with 401.
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": value,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: controller.signal,
        });
        if (res.ok) return { ok: true };
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Anthropic ${res.status}: ${body.slice(0, 200)}` };
      }
      default: {
        const exhaustive: never = key;
        return { ok: false, error: `Unhandled key: ${String(exhaustive)}` };
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Test timed out after 10s" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Convenience: resolve the active LLM key (currently Groq). */
export function getLlmApiKey(): Promise<string | null> {
  return getConfig("GROQ_API_KEY");
}

/** Convenience: resolve the active Finnhub key. */
export function getFinnhubApiKey(): Promise<string | null> {
  return getConfig("FINNHUB_API_KEY");
}

/** Convenience: resolve the active Anthropic key (rarely used; here for parity). */
export function getAnthropicApiKey(): Promise<string | null> {
  return getConfig("ANTHROPIC_API_KEY");
}
