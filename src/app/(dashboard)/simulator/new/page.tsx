"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Standalone /simulator/new: create run requires a project.
 * Redirect to dashboard; use project summary → "Simulation Engine" → New simulation.
 */
export default function NewSimulationPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="p-6">
      <p className="text-white/60">Create simulation from a project.</p>
      <Link href="/dashboard" className="text-white hover:underline mt-2 inline-block">
        Open a project, then use Simulation Engine → New simulation
      </Link>
    </div>
  );
}

