import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

console.log("Auth options module loaded");

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log("DEBUG authorize: credentials received:", credentials);
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log("DEBUG authorize: missing credentials");
            return null;
          }

          console.log("DEBUG authorize: searching for user by email:", credentials.email);
          
          const user = await db
            .select()
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1);

          console.log("DEBUG authorize: user by email:", user.length);

          if (user.length === 0) {
            console.log("DEBUG authorize: searching by name:", credentials.email);
            const byName = await db
              .select()
              .from(users)
              .where(eq(users.name, credentials.email))
              .limit(1);
            console.log("DEBUG authorize: user by name:", byName.length);
            if (byName.length > 0) user.push(byName[0]);
          }

          if (user.length === 0) {
            console.log("DEBUG authorize: no user found");
            return null;
          }

          console.log("DEBUG authorize: user found:", user[0].email, user[0].name);
          console.log("DEBUG authorize: password hash:", user[0].passwordHash ? "exists" : "missing");

          const passwordValid = await bcrypt.compare(
            credentials.password,
            user[0].passwordHash ?? ""
          );
          console.log("DEBUG authorize: password valid:", passwordValid);

          if (!passwordValid) {
            return null;
          }

          console.log("DEBUG authorize: SUCCESS");
          return {
            id: user[0].id,
            email: user[0].email,
            name: user[0].name,
          };
        } catch (err) {
          console.error("DEBUG authorize error:", err);
          throw err; // Re-throw to see the actual error
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
