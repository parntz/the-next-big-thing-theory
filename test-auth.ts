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

async function testAuth() {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });

  const email = "paul";
  const password = "TPdaGnd26!23";

  // Get user
  const result = await client.execute({ sql: "SELECT * FROM users WHERE email = ? OR name = ?", args: [email, email] });
  console.log("User query result:", result.rows.length, "rows");

  if (result.rows.length > 0) {
    const user = result.rows[0];
    console.log("User found:", user.email, user.name);

    // Check password
    const matches = await bcrypt.compare(password, user.password_hash as string);
    console.log("Password matches:", matches);
  } else {
    console.log("No user found");
  }

  client.close();
}

testAuth().catch(console.error);
