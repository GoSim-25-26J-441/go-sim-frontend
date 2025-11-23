"use client";
import { KIND_COLOR } from "@/app/features/amg-apd/utils/colors";

export default function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {Object.entries(KIND_COLOR).map(([k, c]) => (
        <span key={k} className="inline-flex items-center gap-2">
          <span style={{ background: c }} className="inline-block w-3 h-3 rounded-full" />
          {k}
        </span>
      ))}
    </div>
  );
}
