/* eslint-disable @next/next/no-img-element */
"use client";

import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ConnectionMonitor } from "@/components/connection/ConnectionMonitor";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ReduxProvider } from "../store/uidp/ReduxProvider";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { GlobalLoader } from "@/components/loading/GlobalLoader";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const patternsFullscreen = useAmgApdStore((s) => s.patternsGraphFullscreen);

  return (
    <div
      className="grid h-screen overflow-hidden bg-linear-to-b from-[#1F1F1F] to-black"
      style={{
        gridTemplateRows: patternsFullscreen
          ? "0fr minmax(0, 1fr)"
          : "80px minmax(0, 1fr)",
      }}
    >
      <GlobalLoader />
      {/* Top row: 0fr when patterns fullscreen so Topbar stays mounted but takes no space. */}
      <div className="min-h-0 overflow-hidden" aria-hidden={patternsFullscreen}>
        <Topbar />
      </div>

      <div
        className={`min-h-0 overflow-hidden grid ${
          patternsFullscreen
            ? "grid-cols-1"
            : "md:max-[1919px]:grid-cols-[236px_minmax(0,1fr)] min-[1920px]:grid-cols-[320px_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`min-h-0 overflow-hidden ${patternsFullscreen ? "hidden" : ""}`}
          aria-hidden={patternsFullscreen}
        >
          <Sidebar />
        </div>
        <main
          className={`relative min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-subtle ${
            patternsFullscreen ? "p-0" : "p-4"
          }`}
        >
          <img
            src="/logo/logo.png"
            alt="logo"
            className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-18 h-18 opacity-10"
          />

          <div className="relative z-10 min-h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SessionProvider>
        <ReduxProvider>
          <ConnectionMonitor />
          <DashboardShell>{children}</DashboardShell>
        </ReduxProvider>
      </SessionProvider>
    </AuthGuard>
  );
}
