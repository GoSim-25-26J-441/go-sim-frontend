"use client";

import { SessionProvider } from "@/modules/session/context";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SessionProvider>
        <div className="min-h-dvh grid grid-rows-[56px_1fr]">
          <Topbar />
          <div className="grid md:grid-cols-[280px_1fr]">
            <Sidebar />
            <main className="p-4">{children}</main>
          </div>
        </div>
      </SessionProvider>
    </AuthGuard>
  );
}