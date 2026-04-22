import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/options";

console.log("NextAuth handler initialized, providers:", authOptions.providers.length);

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
