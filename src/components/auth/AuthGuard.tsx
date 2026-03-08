"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push("/");
    }
  }, [isLoggedIn, isLoading, router]);

  // Show nothing while loading or redirecting
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <div className="text-xl font-bold text-white tracking-wide">
          ArcFind
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#9AA4B2] border-t-transparent"></div>

          <p className="text-sm text-white/60">
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  // Don't render children if not logged in (redirect will happen)
  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}
