import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// Load .env.local
const envFile = readFileSync(".env.local", "utf-8");
envFile.split("\n").forEach((line) => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join("=").trim();
  }
});

async function addUser() {
  const databaseUrl = process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  console.log("DATABASE_URL:", databaseUrl);

  const client = createClient({ url: databaseUrl, authToken });

  const email = "paul";
  const password = "TPdaGnd26!23";
  const name = "paul";

  console.log("Hashing password...");
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = randomUUID();

  console.log("Inserting user...");
  try {
    const result = await client.execute({
      sql: "INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
      args: [userId, email, name, passwordHash],
    });
    console.log("Result:", result);
    console.log("Done! User added: paul / TPdaGnd26!23");
  } catch (err) {
    console.error("Insert error:", err);
  }

  client.close();
}

addUser().catch(console.error);
