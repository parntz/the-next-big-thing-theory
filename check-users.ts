import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import bcrypt from "bcryptjs";

// Load .env.local
const envFile = readFileSync(".env.local", "utf-8");
envFile.split("\n").forEach((line) => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join("=").trim();
  }
});

async function checkUsers() {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  const result = await client.execute({ sql: "SELECT id, email, name, password_hash FROM users", args: [] });
  console.log("Users in database:", JSON.stringify(result.rows, null, 2));

  if (result.rows.length > 0) {
    const user = result.rows[0];
    const passwordHash = user.password_hash as string;
    console.log("Password hash exists:", !!passwordHash);

    // Test if the password matches
    const testPassword = "TPdaGnd26!23";
    const matches = await bcrypt.compare(testPassword, passwordHash);
    console.log("Password 'TPdaGnd26!23' matches:", matches);
  }

  client.close();
}

checkUsers().catch(console.error);
