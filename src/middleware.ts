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
    // Check for session cookie as a basic server-side auth check
    // Note: For full server-side token validation, Firebase Admin SDK would be needed
    // For now, this provides a basic check while client-side AuthGuard provides the main protection
    const session = req.cookies.get("session")?.value;
    
    // If no session cookie is present, redirect to signup page
    // This prevents unauthorized access but doesn't validate the token server-side
    if (!session) {
      return NextResponse.redirect(new URL("/signup", req.url));
    }
    
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|static|favicon.ico).*)"] };
