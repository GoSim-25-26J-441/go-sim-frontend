"use clinet";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoots = ["/input","/patterns","/simulator","/costing","/dashboard"];

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (!protectedRoots.some(r => p.startsWith(r))) return NextResponse.next();
  if (!req.cookies.has("session")) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", p);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|static|favicon.ico).*)"] };
