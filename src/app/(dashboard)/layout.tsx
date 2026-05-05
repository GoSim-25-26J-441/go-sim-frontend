/* eslint-disable @next/next/no-img-element */
"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ConnectionMonitor } from "@/components/connection/ConnectionMonitor";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { DesktopOnlyNotice } from "./DesktopOnlyNotice";
import { ReduxProvider } from "../store/uidp/ReduxProvider";

function isDiagramFullViewPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/diagram/full" || pathname.startsWith("/diagram/full/")
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const diagramFullView = isDiagramFullViewPath(pathname);

  // One persistent provider tree — do not duplicate branches, or /diagram <-> /diagram/full
  // unmounts all children and drops in-memory diagram handoff state.
  return (
    <AuthGuard>
      <SessionProvider>
        <ReduxProvider>
          <ConnectionMonitor />
          {diagramFullView ? (
            <div className="h-[100dvh] min-h-0 w-full overflow-hidden bg-slate-950">
              {children}
            </div>
          ) : (
            <div className="h-screen overflow-hidden grid grid-rows-[80px_minmax(0,1fr)] bg-linear-to-b from-[#1F1F1F] to-black">
              <Topbar />
              <div className="min-h-0 overflow-hidden grid grid-cols-1 lg:max-[1919px]:grid-cols-[236px_minmax(0,1fr)] min-[1920px]:grid-cols-[320px_minmax(0,1fr)]">
                {/* Phones & tablets: message only; top bar remains for sign-out. */}
                <div className="flex h-full min-h-0 flex-col lg:hidden">
                  <DesktopOnlyNotice />
                </div>
                <div className="hidden min-h-0 lg:contents">
                  <Sidebar />
                  <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* Watermark: fixed within the main pane (does not scroll with page content). */}
                    <div
                      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center p-4"
                      aria-hidden
                    >
                      <img
                        src="/logo/logo.png"
                        alt=""
                        className="h-18 w-18 select-none opacity-10"
                      />
                    </div>

                    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 scrollbar-subtle">
                      {children}
                    </div>
                  </main>
                </div>
              </div>
            </div>
          )}
        </ReduxProvider>
      </SessionProvider>
    </AuthGuard>
  );
}
