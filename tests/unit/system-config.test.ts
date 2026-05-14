/**
 * Unit tests for src/lib/system-config.ts.
 *
 * The helper has two layers we can test without a live DB:
 *
 *  1. `maskValue`, `isKnownKey`, `invalidateCache` — pure functions.
 *  2. `getConfig` env-fallback path — when the DB query throws (table
 *     missing, no DATABASE_URL), the helper logs a warn and falls back
 *     to process.env[<key>]. We exercise that branch by leaving
 *     DATABASE_URL unset so the lazy `db` proxy throws on first use.
 *
 * Full DB round-trip (setConfig → getConfig with persistence + audit row)
 * is covered by integration tests against a live PG instance, not here.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

const ORIGINAL_ENC_KEY = process.env.ENCRYPTION_KEY;
const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_GROQ = process.env.GROQ_API_KEY;
const ORIGINAL_FINNHUB = process.env.FINNHUB_API_KEY;
const ORIGINAL_ANTHROPIC = process.env.ANTHROPIC_API_KEY;

const TEST_ENC_KEY = randomBytes(32).toString("hex");

async function loadModule() {
  // Fresh import so any module-scope state (the singleton cache) starts
  // clean per test.
  return await import("@/lib/system-config");
}

describe("system-config", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
    // DATABASE_URL absent — db proxy will throw on first read, which we
    // expect getConfig to log-and-fall-through.
    delete process.env.DATABASE_URL;
    delete process.env.GROQ_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_ENC_KEY ?? "";
    if (ORIGINAL_DB_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = ORIGINAL_DB_URL;
    }
    if (ORIGINAL_GROQ === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = ORIGINAL_GROQ;
    if (ORIGINAL_FINNHUB === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = ORIGINAL_FINNHUB;
    if (ORIGINAL_ANTHROPIC === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC;
  });

  // ─── isKnownKey ────────────────────────────────────────────────

  describe("isKnownKey", () => {
    it("accepts the canonical keys", async () => {
      const { isKnownKey } = await loadModule();
      expect(isKnownKey("GROQ_API_KEY")).toBe(true);
      expect(isKnownKey("FINNHUB_API_KEY")).toBe(true);
      expect(isKnownKey("ANTHROPIC_API_KEY")).toBe(true);
    });

    it("rejects unknown keys (no silent allow)", async () => {
      const { isKnownKey } = await loadModule();
      expect(isKnownKey("SECRET_KEY")).toBe(false);
      expect(isKnownKey("DATABASE_URL")).toBe(false);
      expect(isKnownKey("")).toBe(false);
      // Case-sensitive — admins shouldn't be able to bypass via casing
      expect(isKnownKey("groq_api_key")).toBe(false);
    });
  });

  // ─── maskValue ────────────────────────────────────────────────

  describe("maskValue", () => {
    it("returns 'Not set' for null and empty", async () => {
      const { maskValue } = await loadModule();
      expect(maskValue(null)).toBe("Not set");
      expect(maskValue("")).toBe("Not set");
    });

    it("masks short values to a fixed-length bullet string (no length leak)", async () => {
      const { maskValue } = await loadModule();
      expect(maskValue("abc")).toBe("••••••••");
      expect(maskValue("1234567")).toBe("••••••••");
    });

    it("shows last 4 chars on longer values", async () => {
      const { maskValue } = await loadModule();
      const masked = maskValue("sk-proj-abcdefghijklmnop");
      // Bullet-padded prefix, last 4 chars verbatim
      expect(masked.endsWith("mnop")).toBe(true);
      expect(masked.startsWith("•")).toBe(true);
      expect(masked).not.toContain("abcde");
    });
  });

  // ─── getConfig env-fallback path ──────────────────────────────

  describe("getConfig (env fallback)", () => {
    it("returns process.env value when DB is unavailable", async () => {
      process.env.GROQ_API_KEY = "fallback-from-env";
      const { getConfig, invalidateCache } = await loadModule();
      invalidateCache(); // ensure no stale cache from prior tests
      expect(await getConfig("GROQ_API_KEY")).toBe("fallback-from-env");
    });

    it("returns null when neither DB nor env has the key", async () => {
      const { getConfig, invalidateCache } = await loadModule();
      invalidateCache();
      // GROQ_API_KEY cleared in beforeEach, DATABASE_URL not set
      expect(await getConfig("GROQ_API_KEY")).toBeNull();
    });

    it("getLlmApiKey / getFinnhubApiKey / getAnthropicApiKey delegate to getConfig", async () => {
      process.env.GROQ_API_KEY = "groq-env";
      process.env.FINNHUB_API_KEY = "finn-env";
      process.env.ANTHROPIC_API_KEY = "anth-env";
      const { getLlmApiKey, getFinnhubApiKey, getAnthropicApiKey, invalidateCache } =
        await loadModule();
      invalidateCache();
      expect(await getLlmApiKey()).toBe("groq-env");
      expect(await getFinnhubApiKey()).toBe("finn-env");
      expect(await getAnthropicApiKey()).toBe("anth-env");
    });
  });

  // ─── Cache invalidation ───────────────────────────────────────

  describe("invalidateCache", () => {
    it("forces a re-resolution from env on next read", async () => {
      const { getConfig, invalidateCache } = await loadModule();
      process.env.GROQ_API_KEY = "v1";
      invalidateCache();
      expect(await getConfig("GROQ_API_KEY")).toBe("v1");

      // Change env, re-read WITHOUT invalidating — should hit cache (still v1)
      process.env.GROQ_API_KEY = "v2";
      expect(await getConfig("GROQ_API_KEY")).toBe("v1");

      // Now invalidate and re-read — should pick up v2
      invalidateCache("GROQ_API_KEY");
      expect(await getConfig("GROQ_API_KEY")).toBe("v2");
    });

    it("clearing without a key invalidates all entries", async () => {
      const { getConfig, invalidateCache } = await loadModule();
      process.env.GROQ_API_KEY = "g1";
      process.env.FINNHUB_API_KEY = "f1";
      invalidateCache();
      await getConfig("GROQ_API_KEY");
      await getConfig("FINNHUB_API_KEY");
      process.env.GROQ_API_KEY = "g2";
      process.env.FINNHUB_API_KEY = "f2";
      invalidateCache();
      expect(await getConfig("GROQ_API_KEY")).toBe("g2");
      expect(await getConfig("FINNHUB_API_KEY")).toBe("f2");
    });
  });

  // ─── setConfig validation ─────────────────────────────────────

  describe("setConfig (validation only — DB write paths exercised in integration)", () => {
    it("rejects unknown keys", async () => {
      const { setConfig } = await loadModule();
      await expect(
        setConfig("BOGUS_KEY", "anything", { userId: "u1" })
      ).rejects.toThrow(/Unknown config key/i);
    });

    it("rejects empty values", async () => {
      const { setConfig } = await loadModule();
      await expect(
        setConfig("GROQ_API_KEY", "", { userId: "u1" })
      ).rejects.toThrow(/non-empty/i);
    });

    it("rejects values over 2048 characters", async () => {
      const { setConfig } = await loadModule();
      await expect(
        setConfig("GROQ_API_KEY", "x".repeat(2049), { userId: "u1" })
      ).rejects.toThrow(/2048/i);
    });
  });

  // ─── KNOWN_KEYS const stability ───────────────────────────────

  describe("KNOWN_KEYS", () => {
    it("includes Groq, Finnhub, Anthropic, and Reddit OAuth in stable order", async () => {
      const { KNOWN_KEYS } = await loadModule();
      expect(KNOWN_KEYS).toEqual([
        "GROQ_API_KEY",
        "FINNHUB_API_KEY",
        "ANTHROPIC_API_KEY",
        "REDDIT_CLIENT_ID",
        "REDDIT_CLIENT_SECRET",
      ]);
    });
  });
});
