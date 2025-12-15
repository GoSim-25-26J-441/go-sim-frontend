"use client";
import { SessionProvider } from "@/modules/session";

export default function SessionBoundary({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
