import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

// Database client configuration
let dbClient: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbClient) {
    return dbClient;
  }

  const databaseUrl = process.env.DATABASE_URL || "./db.sqlite";
  
  // Create SQLite database connection
  const sqlite = new Database(databaseUrl);
  dbClient = drizzle(sqlite, { schema });
  
  return dbClient;
}