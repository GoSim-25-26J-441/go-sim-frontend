/* eslint-disable @next/next/no-img-element */
"use client";

import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ConnectionMonitor } from "@/components/connection/ConnectionMonitor";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ReduxProvider } from "../store/uidp/ReduxProvider";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const patternsGraphFullscreen = useAmgApdStore(
    (s) => s.patternsGraphFullscreen,
  );

  return (
    <div
      className={
        patternsGraphFullscreen
          ? "grid h-dvh max-h-dvh grid-rows-[0px_1fr] overflow-hidden overscroll-none bg-linear-to-b from-[#1F1F1F] to-black"
          : "grid min-h-screen grid-rows-[56px_auto] bg-linear-to-b from-[#1F1F1F] to-black"
      }
    >
      {patternsGraphFullscreen ? (
        <div className="row-start-1 h-0 min-h-0 overflow-hidden" aria-hidden />
      ) : (
        <Topbar />
      )}
      <div
        className={
          patternsGraphFullscreen
            ? "row-start-2 grid min-h-0 grid-cols-1 overflow-hidden"
            : "min-h-0 grid md:grid-cols-[280px_1fr]"
        }
      >
        {!patternsGraphFullscreen && <Sidebar />}
        <main
          className={
            patternsGraphFullscreen
              ? "relative flex min-h-0 h-full min-w-0 flex-col overflow-hidden"
              : "relative flex min-h-0 flex-col overflow-x-hidden p-4 scrollbar-subtle"
          }
        >
          <img
            src="/logo/logo.png"
            alt="logo"
            className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-18 h-18 opacity-10"
          />

          <div
            className={
              patternsGraphFullscreen
                ? "relative z-10 flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden"
                : "relative z-10 flex min-h-full flex-col"
            }
          >
            {children}
          </div>
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
          <div className="h-screen overflow-hidden grid grid-rows-[80px_minmax(0,1fr)] bg-linear-to-b from-[#1F1F1F] to-black">
            <Topbar />
            <div className="min-h-0 overflow-hidden grid md:grid-cols-[280px_1fr]">
              <Sidebar />
              <main className="relative min-h-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col scrollbar-subtle">
                <img
                  src="/logo/logo.png"
                  alt="logo"
                  className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-18 h-18 opacity-10"
                />

                <div className="relative z-10 min-h-full flex flex-col">{children}</div>
              </main>
            </div>
          </div>
        </ReduxProvider>
      </SessionProvider>
    </AuthGuard>
  );
}
