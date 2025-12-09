"use client";
import { createContext, useContext, useMemo, useState } from "react";

type Subscription = "free" | "pro";
type AuthCtx = {
  userId: string | null;
  isLoggedIn: boolean;
  subscription: Subscription;
  signIn: (userId: string, sub?: Subscription) => void;
  signOut: () => void;
  setSubscription: (sub: Subscription) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription>("free");

  const value = useMemo<AuthCtx>(() => ({
    userId,
    isLoggedIn: !!userId,
    subscription,
    signIn: (uid, sub = "free") => { setUserId(uid); setSubscription(sub); },
    signOut: () => { setUserId(null); setSubscription("free"); },
    setSubscription,
  }), [userId, subscription]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
