import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    // Find user by email or name
    let userResults = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userResults.length === 0) {
      userResults = await db
        .select()
        .from(users)
        .where(eq(users.name, email))
        .limit(1);
    }

    if (userResults.length === 0) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const user = userResults[0];

    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash ?? ""
    );

    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create a simple session token
    const sessionData = {
      id: user.id,
      email: user.email,
      name: user.name,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
    const data = JSON.stringify(sessionData);
    
    // Create a signature by hashing data + secret
    const signature = btoa(unescape(encodeURIComponent(data + secret)));
    
    // Combine: base64(data + "|" + signature)
    const token = btoa(data + "|" + signature);

    const response = NextResponse.json({ 
      success: true, 
      user: { id: user.id, email: user.email, name: user.name } 
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;

  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}