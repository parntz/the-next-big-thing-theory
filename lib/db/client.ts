import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Database client configuration
let dbClient: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbClient) {
    return dbClient;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Create Turso/libSQL client
  const client = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  dbClient = drizzle(client, { schema });

  return dbClient;
}