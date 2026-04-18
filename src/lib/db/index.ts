import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as typeof globalThis & {
  __dbClient?: ReturnType<typeof postgres>;
  __db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getClient() {
  if (!g.__dbClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    g.__dbClient = postgres(connectionString, {
      max: 20,
      idle_timeout: 30,
      connect_timeout: 5,
    });
  }
  return g.__dbClient;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    if (!g.__db) {
      g.__db = drizzle(getClient(), { schema });
    }
    return Reflect.get(g.__db, prop, receiver);
  },
});
