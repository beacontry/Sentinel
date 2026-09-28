import { sql } from "drizzle-orm";
import type { db } from "@/lib/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialize one user's dashboard-layout writes for the rest of the
 * transaction (released on COMMIT or ROLLBACK).
 *
 * A user has at most one default layout (partial unique index, migration
 * 0053). The writers that move the default demote the current one and then
 * insert or promote another, and under READ COMMITTED two of them running at
 * once each miss the other's uncommitted row: before the index that left two
 * defaults, and with it the second writer would fail on the index. Taking
 * this lock first makes the second writer wait and then see the first one's
 * committed result. It also keeps the 10-layout cap check honest.
 */
export async function lockUserLayouts(tx: Tx, userId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('dashboard_layouts'), hashtext(${userId}))`
  );
}
