"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle, Search, Play, BarChart3, ShieldAlert, Upload } from "lucide-react";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import { DiagramImagesModal } from "@/components/project/DiagramImagesModal";

type LatestResponse = AnalysisResult & { yaml_content?: string };

const iconSize = 15;
const Icons = {
  Chat: <MessageCircle size={iconSize} />,
  Pattern: <Search size={iconSize} />,
  Simulation: <Play size={iconSize} />,
  Analysis: <BarChart3 size={iconSize} />,
};

const navDelays = ["delay-0", "delay-75", "delay-100", "delay-150"];

function isYamlBlankOrIncomplete(yaml?: string | null): boolean {
  if (!yaml || typeof yaml !== "string") return true;
  const trimmed = yaml.trim();
  return trimmed.length === 0;
}

function ProjectNavSidebar({
  projectId,
  activeKey,
}: {
  projectId: string;
  activeKey: string;
}) {
  const router = useRouter();

  const handleChatClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/project/${projectId}/chat`);
  };

  const navItems = [
    { key: "chat", label: "Chat", icon: Icons.Chat, onClick: handleChatClick },
    {
      key: "pattern",
      label: "Pattern Detection",
      icon: Icons.Pattern,
      href: `/project/${projectId}/pattern`,
    },
    {
      key: "simulation",
      label: "Simulation Engine",
      icon: Icons.Simulation,
      href: `/project/${projectId}/simulation`,
    },
    {
      key: "analysis",
      label: "Analysis",
      icon: Icons.Analysis,
      href: `/project/${projectId}/analysis`,
    },
  ];

  return (
    <aside className="w-56 shrink-0 border-r border-white/60 flex flex-col gap-6 px-3 py-5">
      {navItems.map((item, i) => {
        const isActive = activeKey === item.key;
        const sharedClass = [
          "flex w-full justify-start items-center gap-2 px-4 py-2 text-left transition-transform duration-200",
          "translate-x-0 opacity-100",
          navDelays[i] ?? "delay-150",
          isActive
            ? "text-white border-l-2 border-white text-md"
            : "text-white/80 text-sm",
        ].join(" ");

        const content = (
          <>
            <span
              className={[
                "transition-transform duration-200 group-hover:scale-110",
                isActive ? "text-primary" : "",
              ].join(" ")}
            >
              {item.icon}
            </span>
            <span className="truncate flex-1 text-left">{item.label}</span>
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
            )}
          </>
        );

        if ("href" in item && item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`group ${sharedClass}`}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={(e) => item.onClick?.(e)}
            className={`group ${sharedClass}`}
          >
            {content}
          </button>
        );
      })}
    </aside>
  );
}

function WorkspaceHeader({ projectId }: { projectId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-row justify-between items-center w-full">
        <div className="flex flex-row justify-around items-baseline gap-4">
          <h2 className="text-lg font-medium">Architecture workspace</h2>
          <p className="text-xs font-regular text-white/60 align-bottom">
            Project ID for {projectId}
          </p>
        </div>
        <div className="flex flex-row gap-1">
          <button
            onClick={() => router.push("/docs")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-800/50 text-white/80 hover:text-white transition-colors shadow-md"
          >
            <ShieldAlert className="w-4 h-4" />
            <span className="text-sm font-regular">Docs & Guides</span>
          </button>
        </div>
      </div>
      <div className="w-full h-0.5 bg-white/50" />
    </div>
  );
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
  const [showImagesModal, setShowImagesModal] = useState(false);

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
      <div className="relative p-6 space-y-4 min-h-full">
        <WorkspaceHeader projectId={projectId} />
        <div className="flex flex-row justify-end">
          <button
            onClick={() => setShowImagesModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-800/50 text-white/80 hover:text-white transition-colors shadow-md"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-regular">
              Show Diagram and resource images{" "}
            </span>
          </button>
        </div>
        <div className="flex mt-5 h-[calc(90vh-180px)] flex-row gap-6">
          <ProjectNavSidebar projectId={projectId} activeKey="pattern" />
          <div className="flex-1 flex flex-col items-center justify-center min-h-[280px] gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            <p className="text-sm text-white/50">Loading pattern detection…</p>
          </div>
        </div>
        <DiagramImagesModal
          projectId={projectId}
          isOpen={showImagesModal}
          onClose={() => setShowImagesModal(false)}
        />
      </div>
    );
  }

  if (emptyState) {
    return (
      <div className="relative p-6 space-y-4 min-h-full">
        <WorkspaceHeader projectId={projectId} />
        <div className="flex flex-row justify-end">
          <button
            onClick={() => setShowImagesModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-800/50 text-white/80 hover:text-white transition-colors shadow-md"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-regular">
              Show Diagram and resource images{" "}
            </span>
          </button>
        </div>
        <div className="flex mt-5 h-[calc(90vh-180px)] flex-row gap-6">
          <ProjectNavSidebar projectId={projectId} activeKey="pattern" />
          <main className="flex-1 flex flex-col items-center pt-[8vh] px-6">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.03] p-6 text-center shadow-lg">
              <p className="text-white/90 text-sm leading-relaxed">
                No architecture diagrams found for this project yet. Create an
                architecture using the <strong>Chat</strong> flow, then return
                here for pattern detection.
              </p>
              <Link
                href={`/project/${projectId}/chat`}
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/15 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Go to Chat
              </Link>
            </div>
          </main>
        </div>
        <DiagramImagesModal
          projectId={projectId}
          isOpen={showImagesModal}
          onClose={() => setShowImagesModal(false)}
        />
      </div>
    );
  }

  return null;
}
