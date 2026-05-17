/**
 * Server-wide NON-secret configuration (feature flags, toggles).
 *
 * Sibling of `system-config.ts` (which holds encrypted API keys). Same
 * KV pattern, no encryption, allow-listed keys.
 *
 * Lookup order:
 *   1. In-memory cache (60s TTL)
 *   2. DB row
 *   3. `KEY_DEFAULTS[key]` — so a fresh DB without rows still behaves correctly
 *
 * Admin UI lives on /dashboard/admin/system-config (same page, separate
 * card). Audit metadata can safely include the value (no secrets here).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema/app-settings";
import { writeAudit, AuditAction } from "@/lib/audit";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("app-settings");

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  value: string;
  expiry: number;
}

const g = globalThis as typeof globalThis & {
  __appSettingsCache?: Map<string, CacheEntry>;
};
g.__appSettingsCache ??= new Map();
const cache = g.__appSettingsCache;

/**
 * Allow-listed keys. Admins can't write anything outside this list.
 * The default value is used when the DB row is absent (fresh install
 * or never-toggled flag).
 */
export const KNOWN_KEYS = {
  /**
   * Public free-tier signup. When false, /api/auth/register returns 503
   * with "Signups paused — email hello@beacontry.com" message. Existing
   * users unaffected. Invite-token signup still works (admin can let
   * specific people in even when the general gate is closed).
   */
  REGISTRATION_OPEN: "true",
  /**
   * Whether new free-tier signups send an alert email to all admin
   * users. Off by default to avoid mail-flood during a Show HN spike;
   * admin can toggle on after the initial wave.
   */
  NOTIFY_ADMINS_ON_REGISTER: "true",
} as const;

export type KnownAppSettingKey = keyof typeof KNOWN_KEYS;

export function isKnownAppSettingKey(key: string): key is KnownAppSettingKey {
  return key in KNOWN_KEYS;
}

/**
 * Resolve a setting. Always returns a value — falls back to the
 * compiled-in default if the DB row is absent.
 */
export async function getAppSetting(key: KnownAppSettingKey): Promise<string> {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  let value: string = KNOWN_KEYS[key];
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    if (row?.value !== undefined) {
      value = row.value;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.warn({ err: message, key }, "app_settings read failed — using default");
  }

  cache.set(key, { value, expiry: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Boolean convenience. Treats "true"/"1"/"yes"/"on" as true; everything
 * else as false. The compiled-in defaults follow the same convention so
 * BOOL_TRUE_DEFAULT keys default to true.
 */
export async function getAppSettingBool(key: KnownAppSettingKey): Promise<boolean> {
  const v = (await getAppSetting(key)).toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * Set a setting. Writes the new value, invalidates cache, and logs an
 * audit row. `actor` is the admin user performing the change.
 */
export async function setAppSetting(
  key: KnownAppSettingKey,
  value: string,
  actor: { userId: string; email: string }
): Promise<void> {
  if (!isKnownAppSettingKey(key)) {
    throw new Error(`Unknown app_settings key: ${key}`);
  }

  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: actor.userId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: actor.userId, updatedAt: new Date() },
    });

  cache.delete(key);

  await writeAudit({
    actor: { userId: actor.userId, email: actor.email },
    action: AuditAction.SYSTEM_CONFIG_UPDATED,
    resourceType: "app_setting",
    resourceId: key,
    metadata: {
      key,
      value, // safe to log — these are non-secret booleans
    },
  });
}

/**
 * Bulk fetch for admin UI rendering. Returns every known key + current
 * resolved value + whether it's from the default or from a DB row.
 */
export async function listAppSettings(): Promise<
  Array<{ key: KnownAppSettingKey; value: string; isDefault: boolean }>
> {
  const rows = await db.select().from(appSettings);
  const dbValues = new Map(rows.map((r) => [r.key, r.value]));

  return (Object.keys(KNOWN_KEYS) as KnownAppSettingKey[]).map((key) => {
    const dbValue = dbValues.get(key);
    return {
      key,
      value: dbValue ?? KNOWN_KEYS[key],
      isDefault: dbValue === undefined,
    };
  });
}
