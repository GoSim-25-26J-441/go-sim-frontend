// src/components/dashboard/Topbar.tsx
"use client";

import Link from "next/link";

export default function Topbar() {

  return (
    <header className="h-14 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-40">
      <div className="flex flex-row justify-between h-full mx-auto px-4">
        <Link href={`/dashboard`} className="flex items-center gap-2">
          <div className="font-semibold">GO-SIM</div>
        </Link>
        <Link
          href="/dashboard/patterns/upload"
          className="rounded-xl border border-border p-4 hover:bg-surface"
        >
          <div className="font-medium">AMG &amp; APD</div>
          <div className="opacity-60 text-sm">Upload &amp; analyze YAML</div>
        </Link>
      </div>
    </header>
  );
}
