import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

// Load .env.local manually before anything else
const envFile = readFileSync(".env.local", "utf-8");
envFile.split("\n").forEach((line) => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join("=").trim();
  }
});

async function deleteAllUsers() {
  const databaseUrl = process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = createClient({ url: databaseUrl, authToken });

  console.log("Deleting all users...");
  await client.execute({ sql: "DELETE FROM users" });
  console.log("Done! All users have been deleted.");

  client.close();
}

deleteAllUsers().catch(console.error);
