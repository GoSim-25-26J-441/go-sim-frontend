// src/app/(dashboard)/SessionBoundary.tsx
"use client";
import { SessionProvider } from "@/modules/session/context";

export default function SessionBoundary({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
