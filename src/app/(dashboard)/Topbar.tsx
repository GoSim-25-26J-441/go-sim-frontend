// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import { useState, useEffect, useRef } from "react";

export default function Topbar() {
  const router = useRouter();
  const { signOut, userProfile, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      setIsDropdownOpen(false);
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
            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              {/* Avatar Button */}
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 rounded-full hover:bg-surface transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-bg"
                aria-label="User menu"
                aria-expanded={isDropdownOpen}
              >
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
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-black border border-border/50 rounded-lg shadow-2xl z-50 backdrop-blur-sm">
                  <div className="py-1.5">
                    {/* Profile Link */}
                    <Link
                      href="/profile"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors rounded-t-lg"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </Link>

                    {/* Divider */}
                    <div className="border-t border-border/50 my-1" />

                    {/* Sign Out Button */}
                    <button
                      onClick={handleLogout}
                      disabled={isSigningOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-b-lg"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
