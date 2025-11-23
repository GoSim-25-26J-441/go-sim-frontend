"use client";

import { useEffect } from "react";
import Link from "next/link";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";

export default function PatternsPage() {
  const last = useAmgApdStore((s) => s.last);
  const setLast = useAmgApdStore((s) => s.setLast);

  useEffect(() => {
    if (!last?.graph && typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem("amg_last");
      if (raw) {
        try {
          setLast(JSON.parse(raw));
        } catch {
          // ignore parse error
        }
      }
    }
  }, [last, setLast]);

  if (!last?.graph) {
    return (
      <div className="p-6 space-y-3">
        <div>No graph to display yet. Upload a YAML and run analysis.</div>
        <Link
          className="text-blue-600 underline"
          href="/dashboard/patterns/upload"
        >
          Upload a YAML to analyze →
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Visualization</h1>
        <Legend />
      </div>
      <GraphCanvas data={last} />
    </div>
  );
}
