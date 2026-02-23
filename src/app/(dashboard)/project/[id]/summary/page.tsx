/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProjectThreadId } from "@/modules/di/getProjectThread";
import { ShieldAlert, Upload } from "lucide-react";
import Overview from "@/components/summary/Overview";

const Icons = {
  Chat: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Pattern: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Simulation: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Analysis: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Graph: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  Cost: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Reports: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Activity: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
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
  const [activeNav, setActiveNav] = useState("simulation");
  const [mounted, setMounted] = useState(false);

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
      key: "analysis",
      label: "Analysis",
      icon: Icons.Analysis,
      href: `/project/${id}/analysis`,
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
          onClick={() => router.push("/upload")}
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
              "flex justify-start items-center gap-2 px-4 py-2",
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
                <span className="truncate flex-1">{item.label}</span>
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
    </div>
  );
}
