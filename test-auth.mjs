import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const client = createClient({
  url: "libsql://the-next-big-thing-theory-the-next-big-thing-theory.aws-us-east-2.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzY2MTAwNTMsImlkIjoiMDE5ZGE2MzQtY2YwMS03NjI5LWE4OTAtMDZlMDBiMWYyNDFlIiwicmlkIjoiYjdiZGZjMmItMmE0MS00NDBkLTg0ZmEtMGMyZmI1MGY5OThlIn0.WO_PpFtdpGQmRJBeaC3HxGv7Vw-OS0gxhjNYnZneodZYS8c97bBNo3SrxvGHQyqDE5o6eycrGBwg3awouQb9Bg",
});

async function main() {
  const result = await client.execute("SELECT id, email, password_hash FROM users WHERE email = ?", ["paul@paularntz.com"]);
  const user = result.rows[0];
  console.log("User found:", user.email);
  console.log("Password hash:", user.password_hash);

  // Test if the hash is valid
  const isValid = await bcrypt.compare("password123", user.password_hash);
  console.log("Password 'password123' is valid:", isValid);

  process.exit(0);
}
main();