import Link from "next/link";

export default function DashboardHome() {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm text-slate-600">Choose a module to get started:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>
          <Link
            className="text-blue-600 underline"
            href="/dashboard/patterns/upload"
          >
            Patterns → Upload & analyze YAML
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" href="/dashboard/input">
            Input module
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" href="/dashboard/costing">
            Costing module
          </Link>
        </li>
      </ul>
    </div>
  );
}
