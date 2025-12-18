import type { Metadata } from "next";
import "@/styles/globals.css";
import "@/styles/theme.css";
import { AuthProvider } from "@/providers/auth-context";

export const metadata: Metadata = {
  title: "ArcFind",
  description: "Software for simulating and analyzing ARCs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
