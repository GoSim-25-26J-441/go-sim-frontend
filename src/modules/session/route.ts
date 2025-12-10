import { NextResponse } from "next/server";

export async function GET() {
  // Hard-coded for now; replace with real auth later.
  const uid   = process.env.DEMO_UID ?? "demo-user";
  const name  = "Demo User";
  const roles = ["user"];

  const res = NextResponse.json({ ok: true, session: { uid, name, roles } });

  // Set an HttpOnly cookie so server routes can read user securely.
  res.cookies.set("uid", uid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return res;
}
