/* eslint-disable @next/next/no-img-element */
"use client";

import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ReduxProvider } from "../store/uidp/ReduxProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SessionProvider>
        <ReduxProvider>
          <div className="h-dvh grid grid-rows-[56px_1fr] bg-linear-to-b from-[#1F1F1F] to-black">
            <Topbar />
            <div className="min-h-0 grid md:grid-cols-[280px_1fr]">
              <Sidebar />
              <main className="relative min-h-0 overflow-y-auto p-4">
                <img
                  src="/logo/logo.png"
                  alt="logo"
                  className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-18 h-18 opacity-10"
                />

                <div className="relative z-10">{children}</div>
              </main>
            </div>
          </div>
        </ReduxProvider>
      </SessionProvider>
    </AuthGuard>
  );
}
