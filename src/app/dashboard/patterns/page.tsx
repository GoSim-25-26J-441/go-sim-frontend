"use client";

import { useState } from "react";
import { useAnalyze } from "@/app/features/amg-apd/hooks/useAnalyze";
import GraphCanvas from "@/app/features/amg-apd/components/GraphCanvas";
import Legend from "@/app/features/amg-apd/components/Legend";

const SAMPLES = [
  { label: "Cycles only", path: "/app/samples/shop-suite-cycles.yaml", title: "Cycles Only" },
  { label: "ShopSuite (unified)", path: "/app/samples/shop-suite-with-issues-unified.yaml", title: "ShopSuite" },
  { label: "ShopSuite (graph)", path: "/app/samples/shop-suite-with-issues-graph.yaml", title: "ShopSuite (Graph)" },
];

export default function PatternsPage() {
  const [sel, setSel] = useState(SAMPLES[0]);
  const { data, isLoading, isError, error, refetch, isFetching } =
    useAnalyze({ path: sel.path, title: sel.title, out_dir: "/app/out" }, true);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <select className="border rounded px-3 py-2"
          value={sel.path}
          onChange={(e) => setSel(SAMPLES.find(o => o.path === e.target.value) ?? SAMPLES[0])}>
          {SAMPLES.map(o => <option key={o.path} value={o.path}>{o.label}</option>)}
        </select>

        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          {isFetching ? "Analyzing..." : "Run analysis"}
        </button>

        <Legend />
      </div>

      {isLoading && <div>Loading…</div>}
      {isError && <pre className="text-red-600 whitespace-pre-wrap">{String((error as any)?.message)}</pre>}
      {data && <GraphCanvas data={data} />}
    </div>
  );
}
