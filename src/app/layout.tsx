import type { Metadata } from "next";
import "@/styles/globals.css";
import "@/styles/theme.css";
import { AuthProvider } from "@/providers/auth-context";

export const metadata: Metadata = { title: "GO-SIM", description: "Design Input & Analysis" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
