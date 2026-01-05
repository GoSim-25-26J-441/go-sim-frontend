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
    // For now, allow access - actual auth check happens client-side via AuthProvider
    // This allows the page to load and check auth state client-side
    // In the future, you could add server-side token validation here
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|static|favicon.ico).*)"] };
