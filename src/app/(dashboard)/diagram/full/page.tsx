"use client";

import { DiagramEditor } from "../DiagramEditor";

export default function DiagramFullViewPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiagramEditor variant="fullView" />
    </div>
  );
}
