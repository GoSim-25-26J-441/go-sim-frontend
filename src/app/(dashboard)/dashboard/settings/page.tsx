"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function DashboardSettingsPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/40 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-black transition-all duration-150 hover:bg-white/80 hover:text-black/80"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-md font-bold text-white">Settings</h1>
            <p className="mt-0.5 text-xs text-white/60">
              Dashboard preferences and workspace options
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col space-y-5">
        <div className="overflow-hidden rounded-lg bg-white/4 p-10 text-center">
          <p className="text-sm font-semibold text-white">Under construction</p>
          <p className="mt-2 text-xs text-white/55">More options will be available here soon.</p>
        </div>
      </div>
    </div>
  );
}
