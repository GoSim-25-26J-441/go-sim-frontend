import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoots = ["/chat", "/cost"]; // remove "/patterns" (and "/simulator" if needed)

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (!protectedRoots.some(r => p.startsWith(r))) return NextResponse.next();
  if (!req.cookies.has("session")) return NextResponse.next(); // allow while prototyping
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|static|favicon.ico).*)"] };
