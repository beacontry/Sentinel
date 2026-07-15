import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as typeof globalThis & {
  __dbClient?: ReturnType<typeof postgres>;
  __db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getClient() {
  g.__dbClient ??= (() => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    return postgres(connectionString, {
      max: 20,
      // 30s idle_timeout churned physical connections constantly, so scan
      // bursts + engine boot were always opening fresh sockets; with the old
      // 5s connect_timeout the handshake regularly lost the race on the
      // shared 4-vCPU droplet and postgres.js threw CONNECT_TIMEOUT —
      // surfacing as generic drizzle "Failed query" errors with NO
      // server-side trace (the 2026-07-15 00:11:42 boot failures were
      // exactly 5.000s after engine start). Keep connections warm longer
      // and tolerate slow handshakes. max 20 vs the shared instance's
      // max_connections=100 leaves room for the other tenants.
      idle_timeout: 120,
      connect_timeout: 15,
    });
  })();
  return g.__dbClient;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    g.__db ??= drizzle(getClient(), { schema });
    return Reflect.get(g.__db, prop, receiver);
  },
});

/**
 * Run a query with a statement timeout. The timeout is scoped to the
 * transaction via SET LOCAL so it cannot leak to other queries.
 */
export async function withTimeout<T>(
  ms: number,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${Math.round(ms)}'`));
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Check if an error was caused by a PostgreSQL statement timeout.
 */
export function isStatementTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes("statement timeout");
}
