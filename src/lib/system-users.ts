/**
 * System users — fake user accounts that exist only as author rows
 * for AI / cron-generated content. They cannot log in (random
 * unguessable bcrypt hash) and never show up in leaderboard / admin
 * mutating surfaces (role=user, no opt-ins).
 *
 * Pattern borrowed from GitHub's @github-actions, Dependabot, etc.
 * Cleaner than putting human admins' names on auto-generated content,
 * and lets the UI render a stable byline without a schema change.
 */

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/users";

const DESK_EMAIL = "desk@beacontry.com";
const DESK_NAME = "Beacontry Desk";

/**
 * Returns the user-id of the "Beacontry Desk" system account. Creates it
 * if it doesn't exist (lazily, on first call). Cached at the row level —
 * subsequent calls hit the DB but return the same id.
 */
export async function getOrCreateBeacontryDeskUser(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DESK_EMAIL))
    .limit(1);
  if (existing) return existing.id;

  // 32 random bytes hex → bcrypt cost 12. Nobody will ever know this
  // password; the row exists only to be referenced by article.authorId.
  // Login attempts against this email will always fail.
  const randomPassword = randomBytes(32).toString("hex");
  const passwordHash = await hash(randomPassword, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: DESK_EMAIL,
      name: DESK_NAME,
      passwordHash,
      role: "user",
      tier: "free",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (created) return created.id;

  // Conflict path — another concurrent invocation beat us. Re-select.
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DESK_EMAIL))
    .limit(1);
  if (!found) {
    throw new Error(
      "getOrCreateBeacontryDeskUser: failed to insert and re-select"
    );
  }
  return found.id;
}
