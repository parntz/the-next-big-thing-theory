import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Database client configuration
let dbClient: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (dbClient) {
    return dbClient;
  }

  const databaseUrl = process.env.DATABASE_URL || "./db.sqlite";
  
  // Use libSQL for both local SQLite and Turso (remote SQLite)
  const client = createClient({
    url: databaseUrl,
    // Add auth token for Turso if needed
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  dbClient = drizzle(client, { schema });
  
  return dbClient;
}

// Helper function to check if database exists
export async function checkDatabaseExists(): Promise<boolean> {
  try {
    const fs = await import("fs");
    const databaseUrl = process.env.DATABASE_URL || "./db.sqlite";
    
    // If it's a file-based SQLite, check if file exists
    if (databaseUrl.endsWith(".sqlite") || databaseUrl.endsWith(".db")) {
      return fs.existsSync(databaseUrl);
    }
    
    // For Turso/remote, we can't easily check existence
    // The client will handle connection errors
    return true;
  } catch {
    return false;
  }
}

// Initialize database schema (run migrations)
export async function initializeDatabase() {
  const fs = await import("fs");
  const path = await import("path");
  
  const databaseUrl = process.env.DATABASE_URL || "./db.sqlite";
  
  // For file-based SQLite, create the file if it doesn't exist
  if (databaseUrl.endsWith(".sqlite") || databaseUrl.endsWith(".db")) {
    const dir = path.dirname(databaseUrl);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(databaseUrl)) {
      fs.writeFileSync(databaseUrl, "");
    }
  }
  
  return getDb();
}