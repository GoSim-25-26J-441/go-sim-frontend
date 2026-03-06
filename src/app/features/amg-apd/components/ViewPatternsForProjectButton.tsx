"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

interface Props {
  projectPublicId: string;
  label?: string;
}

/**
 * Reusable button that:
 * - Calls GET /api/amg-apd/projects/{project_public_id}/latest
 * - Updates AMG-APD store with graph + yaml_content
 * - Redirects to /dashboard/patterns
 *
 * Usage example:
 *
 *   <ViewPatternsForProjectButton projectPublicId={projectId} />
 */
export function ViewPatternsForProjectButton({
  projectPublicId,
  label = "View Patterns for Project",
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  async function handleClick() {
    const projectID = projectPublicId.trim();
    if (!projectID) {
      alert("project_public_id is required");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        `/api/amg-apd/projects/${encodeURIComponent(projectID)}/latest`,
        {
          method: "GET",
          headers: getAmgApdHeaders({ chatId: projectID }),
        }
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load latest version for project");
      }

      const data: AnalysisResult & { yaml_content?: string } = await res.json();
      if (!data?.graph) {
        throw new Error("Backend did not return a graph.");
      }

      setLast(data);
      if (data.yaml_content) {
        setEditedYaml(data.yaml_content);
      }

      router.push("/dashboard/patterns");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert("Could not load patterns: " + msg);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface/80 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? "Loading…" : label}
    </button>
  );
}

