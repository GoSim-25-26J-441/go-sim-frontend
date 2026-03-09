/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjectThreadId } from "@/modules/di/getProjectThread";
import {
  ShieldAlert,
  Upload,
  MessageCircle,
  Search,
  Play,
  BarChart3,
} from "lucide-react";
import Overview from "@/components/summary/Overview";
import { DiagramImagesModal } from "@/components/project/DiagramImagesModal";

const iconSize = 15;

const Icons = {
  Chat: <MessageCircle size={iconSize} />,
  Pattern: <Search size={iconSize} />,
  Simulation: <Play size={iconSize} />,
  Analysis: <BarChart3 size={iconSize} />,
};

export default function Summary({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(true);
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showImagesModal, setShowImagesModal] = useState(false);

  useEffect(() => {
    setMounted(true);
    getProjectThreadId(id)
      .then((tid) => {
        setThreadId(tid);
        setLoadingThread(false);
      })
      .catch(() => setLoadingThread(false));
  }, [id]);

  const handleChatClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(
      threadId
        ? `/project/${id}/chat?thread=${threadId}`
        : `/project/${id}/chat`,
    );
  };

  const navItems = [
    { key: "chat", label: "Chat", icon: Icons.Chat, action: handleChatClick },
    {
      key: "pattern",
      label: "Pattern Detection",
      icon: Icons.Pattern,
      href: `/project/${id}/pattern`,
    },
    {
      key: "simulation",
      label: "Simulation Engine",
      icon: Icons.Simulation,
      href: `/project/${id}/simulation`,
    },
    {
      key: "cost",
      label: "Cost Analysis",
      icon: Icons.Analysis,
      href: `/project/${id}/cost`,
    },
  ];

  const delays = ["delay-0", "delay-75", "delay-100", "delay-150"];

  return (
    <div className="relative p-6 space-y-4 min-h-full">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-row justify-between items-center w-full">
          <div className="flex flex-row justify-around items-baseline gap-4">
            <h2 className="text-lg font-medium">Architecture workspace</h2>

            <p className="text-xs font-regular text-white/60 align-bottom">
              Project ID for {id}
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
        <aside className="w-56 shrink-0 border-r border-white/60 flex flex-col gap-6 px-3 py-5">
          {navItems.map((item, i) => {
            const isActive = activeNav === item.key;

            const sharedClass = [
              "flex w-full justify-start items-center gap-2 px-4 py-2 text-left",
              mounted
                ? "translate-x-0 opacity-100"
                : "-translate-x-4 opacity-0",
              delays[i] ?? "delay-150",
              isActive
                ? "text-white border-l-2 border-white text-md"
                : "text-white/80 text-sm",
            ].join(" ");

            const content = (
              <>
                <span
                  className={[
                    "transition-transform duration-200",
                    "group-hover:scale-110",
                    isActive ? "text-primary" : "",
                  ].join(" ")}
                >
                  {item.icon}
                </span>
                <span className="truncate flex-1 text-left">{item.label}</span>
                {item.key === "chat" && loadingThread && (
                  <span className="text-[10px] text-muted-foreground animate-pulse">
                    …
                  </span>
                )}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                )}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={sharedClass}
                  onClick={() => setActiveNav(item.key)}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                onClick={(e) => {
                  setActiveNav(item.key);
                  item.action?.(e as any);
                }}
                disabled={item.key === "chat" && loadingThread}
                className={sharedClass}
              >
                {content}
              </button>
            );
          })}
        </aside>

        <Overview />
      </div>

      <DiagramImagesModal
        projectId={id}
        isOpen={showImagesModal}
        onClose={() => setShowImagesModal(false)}
      />
    </div>
  );
}
