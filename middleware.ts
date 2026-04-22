import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("session");

  if (session) {
    try {
      const decoded = Buffer.from(session.value, "base64").toString();
      const [data, signature] = decoded.split("|");
      
      if (data && signature) {
        const sessionData = JSON.parse(data);
        
        if (sessionData.exp > Date.now()) {
          const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
          const expectedSignature = btoa(unescape(encodeURIComponent(data + secret)));
          
          if (signature === expectedSignature) {
            return NextResponse.next();
          }
        }
      }
    } catch (e: any) {
      // Invalid session
    }
  }

  // Redirect to login if accessing protected routes
  if (request.nextUrl.pathname.startsWith("/projects") || 
      request.nextUrl.pathname.startsWith("/api/projects")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/projects", "/api/projects/:path*", "/api/projects"],
};