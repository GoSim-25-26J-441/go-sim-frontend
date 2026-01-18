"use client";

import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SessionProvider>
        <div className="h-dvh grid grid-rows-[56px_1fr] bg-linear-to-b from-[#1F1F1F] to-black">
          <Topbar />

          <div className="min-h-0 grid md:grid-cols-[280px_1fr]">
            <Sidebar />

            <main className="min-h-0 overflow-y-auto p-4">
              {children}
            </main>
          </div>
        </div>
      </SessionProvider>
    </AuthGuard>
  );
}
