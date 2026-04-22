import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Database client configuration
let dbClient: ReturnType<typeof drizzle> | null = null;

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  return drizzle(client, { schema });
}

export const db = (() => {
  if (!dbClient) {
    dbClient = createDb();
  }
  return dbClient;
})();

export function getDb() {
  return db;
}