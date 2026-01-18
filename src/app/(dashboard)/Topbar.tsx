/* eslint-disable @next/next/no-img-element */
// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, FileText } from "lucide-react";
import { useAuth } from "@/providers/auth-context";
import { useEffect, useRef, useState } from "react";

export default function Topbar() {
  const router = useRouter();
  const { signOut, userProfile, user } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = dropdownRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setIsDropdownOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDropdownOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      setIsDropdownOpen(false);
      await signOut();

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Error signing out:", error);
      setIsSigningOut(false);
    }
  };

  const displayName =
    userProfile?.display_name || user?.displayName || user?.email || "User";
  const photoUrl = userProfile?.photo_url || user?.photoURL;

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-40 h-20">
      <div className="flex h-full max-w-[1800px] mx-auto items-center justify-between">
        <Link href="/dashboard" className="flex items-center">
          <img src="/logo/logo.png" alt="logo" className="h-8 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/patterns/upload"
            className="group flex items-center gap-3 px-4 py-2 bg-[#9AA4B2] text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-[1.02]"
          >
            <div className="flex flex-col items-start">
              <span className="text-xs font-bold leading-none">AMG & APD</span>
              <span className="text-[10px] opacity-90 leading-none mt-0.5">
                Upload & analyze YAML
              </span>
            </div>
          </Link>

          <div className="h-8 w-px bg-gray-700" />

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((v) => !v)}
              className="flex items-center gap-2 p-1 rounded-full hover:text-white/50 transition-all duration-200"
              aria-label="User menu"
              aria-expanded={isDropdownOpen}
              aria-haspopup="menu"
            >
              {photoUrl && !imageLoadError ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  className="w-9 h-9 rounded-full object-cover border-2 border-white transition-colors duration-200"
                  onError={() => setImageLoadError(true)}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black text-sm font-bold border-2 border-white/50"
                  title={displayName}
                >
                  {initials}
                </div>
              )}

              <div className="text-left">
                <p className="font-bold text-sm">Welcome</p>
                <p className="font-normal text-sm">{user?.email}</p>
              </div>
            </button>

            {isDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-3 w-56 bg-[#1F2937] border border-gray-700 rounded-md shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
                  <p className="text-sm font-semibold text-white truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>

                <div className="py-1.5">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/50 transition-colors duration-150"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <User className="w-4 h-4 text-gray-400" />
                    <span>View Profile</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/50 transition-colors duration-150"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span>Settings</span>
                  </Link>

                  <div className="border-t border-gray-700 my-1.5" />

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isSigningOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
