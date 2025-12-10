// src/modules/session/context.tsx
"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Session = { userId: string; setUserId: (id: string) => void };
const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const forced = process.env.NEXT_PUBLIC_FORCE_UID; // dev-only override
  const [userId, setUserId] = useState("");

  useEffect(() => {
    let id = forced || document.cookie.match(/(?:^|;\s*)uid=([^;]+)/)?.[1] || localStorage.getItem("uid") || "";
    if (!id) {
      id = `user_${crypto.randomUUID()}`;
      localStorage.setItem("uid", id);
    }
    document.cookie = `uid=${id}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setUserId(id);
  }, [forced]);

  const value = useMemo(() => ({ userId, setUserId }), [userId]);
  if (!userId) return null;
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
