"use client";

import type { ReactNode } from "react";
import { RQProvider } from "@/providers/query-client";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RQProvider>{children}</RQProvider>;
}
