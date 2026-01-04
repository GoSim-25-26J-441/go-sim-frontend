import Link from "next/link";

export default function Summary({ params }: { params: { id: string } }) {
  const id = params.id;
  return (
    <div className="p-6 space-y-4">
      <div className="text-sm opacity-70">
        Job: <span className="font-mono">{id}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/chat/${id}/talk`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Chat</div>
          <div className="opacity-60 text-sm">Ask about the architecture</div>
        </Link>
        <Link href={`/graph/${id}`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Graph</div>
          <div className="opacity-60 text-sm">Visualize services & edges</div>
        </Link>
        <Link href={`/cost`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Cost Analysis</div>
          <div className="opacity-60 text-sm">Sizing</div>
        </Link>
        <Link href={`/reports/${id}`} className="rounded-xl border border-border p-4 hover:bg-surface">
          <div className="font-medium">Reports</div>
          <div className="opacity-60 text-sm">Export & summaries</div>
        </Link>
      </div>
    </div>
  );
}
