import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected routes that require authentication
const protectedRoots = [
  "/dashboard",
  "/chat",
  "/cost",
  "/simulator",
  "/patterns",
  "/diagram",
];

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  
  // Allow auth pages and public routes
  if (p.startsWith("/signup") || p === "/" || p.startsWith("/api") || p.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Check if route is protected
  const isProtected = protectedRoots.some(r => p.startsWith(r));
  
  if (isProtected) {
    // Note: Firebase authentication uses client-side tokens, not server-side session cookies
    // Client-side AuthGuard provides the main protection and redirects unauthenticated users
    // We allow the request to proceed and let AuthGuard handle authentication checks
    // This prevents server-side redirect loops that would occur with session cookie checks
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|static|favicon.ico).*)"] };
