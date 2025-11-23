import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold text-center">
        GO-SIM Frontend (AMG & APD)
      </h1>
      <p className="text-slate-600 text-center max-w-xl">
        Upload your microservice architecture as YAML, generate the service
        graph, and visualize anti-patterns like cycles, god services, and tight
        coupling.
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link
          href="/dashboard/patterns/upload"
          className="px-4 py-2 rounded bg-black text-white text-sm"
        >
          Upload & Analyze YAML
        </Link>
        <Link
          href="/dashboard/patterns"
          className="px-4 py-2 rounded border border-slate-300 text-sm"
        >
          View last analysis
        </Link>
      </div>
    </div>
  );
}
