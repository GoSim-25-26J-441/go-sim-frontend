"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Standalone /simulator: simulation runs are scoped to a project.
 * Redirect to dashboard; users open a project and use "Simulation Engine" to get to
 * /project/[id]/simulation.
 */
export default function SimulatorPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-4" />
        <p className="text-white/60">Simulation runs are managed per project.</p>
        <Link href="/dashboard" className="text-white hover:underline mt-2 inline-block">
          Open a project to run simulations
        </Link>
      </div>
    </div>
  );
}
