"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, MessageCircle, Search } from "lucide-react";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";

type LatestResponse = AnalysisResult & { yaml_content?: string };

function isYamlBlankOrIncomplete(yaml?: string | null): boolean {
  if (!yaml || typeof yaml !== "string") return true;
  const trimmed = yaml.trim();
  return trimmed.length === 0;
}

export default function ProjectPatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const setLast = useAmgApdStore((s) => s.setLast);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const [loading, setLoading] = useState(true);
  const [emptyState, setEmptyState] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    const projectID = projectId.trim();
    if (!projectID) {
      setLoading(false);
      setEmptyState(true);
      return;
    }

    const fetchAndProceed = async () => {
      setLoading(true);
      setEmptyState(false);
      try {
        const res = await fetch(
          `/api/amg-apd/projects/${encodeURIComponent(projectID)}/latest`,
          {
            method: "GET",
            headers: getAmgApdHeaders({ chatId: projectID }),
          }
        );

        if (!res.ok) {
          setEmptyState(true);
          setLoading(false);
          return;
        }

        const data: LatestResponse = await res.json();

        if (
          !data?.graph ||
          isYamlBlankOrIncomplete(data?.yaml_content)
        ) {
          setEmptyState(true);
          setLoading(false);
          return;
        }

        setLast(data);
        if (data.yaml_content) {
          setEditedYaml(data.yaml_content);
        }
        router.push(`/project/${projectID}/patterns`);
      } catch {
        setEmptyState(true);
        setLoading(false);
      }
    };

    fetchAndProceed();
  }, [projectId, router, setLast, setEditedYaml]);

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project ID missing in URL.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
        <p className="text-white/60 text-sm">Loading pattern detection…</p>
      </div>
    );
  }

  if (emptyState) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/project/${projectId}/summary`)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5" />
              Pattern Detection
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Project <span className="font-mono text-xs">{projectId}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm max-w-lg">
          <p className="text-white/90 text-base leading-relaxed">
            No Architecture Diagrams found for this project yet. Please create
            an Architecture using the &quot;Chat&quot; Function to Proceed with
            the &quot;Pattern Detection&quot; Function.
          </p>
          <Link
            href={`/project/${projectId}/chat`}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Go to Chat
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
