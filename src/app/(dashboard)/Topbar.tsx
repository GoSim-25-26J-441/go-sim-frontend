// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import { useState } from "react";

export default function Topbar() {
  const router = useRouter();
  const { signOut, userProfile, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsSigningOut(false);
    }
  };

  // Get display name and photo for avatar
  const displayName = userProfile?.display_name || user?.displayName || user?.email || "User";
  const photoUrl = userProfile?.photo_url || user?.photoURL;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-14 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-40">
      <div className="flex flex-row justify-between items-center h-full mx-auto px-4">
        <Link href={`/dashboard`} className="flex items-center gap-2">
          <div className="font-semibold">GO-SIM</div>
        </Link>
        
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/patterns/upload"
            className="border border-border my-1 p-2 hover:bg-surface rounded"
          >
            <div className="text-xs font-bold">AMG &amp; APD</div>
            <div className="opacity-60 text-xs">Upload &amp; analyze YAML</div>
          </Link>

          <div className="flex items-center gap-3 border-l border-border pl-4">
            {/* Avatar Circle */}
            <div className="relative">
              {photoUrl && !imageLoadError ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-border"
                  onError={() => setImageLoadError(true)}
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold border border-border"
                  title={displayName}
                >
                  {initials}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              disabled={isSigningOut}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-surface rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
