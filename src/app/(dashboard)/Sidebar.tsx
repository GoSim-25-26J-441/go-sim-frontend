/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChats } from "@/modules/chat/useChats";
import { useSession } from "@/modules/session/context";
import { useAuth } from "@/providers/auth-context";
import { useEffect, useMemo, useState } from "react";
import { Plus, LogOut, Settings, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/useToast";

type RemoteChat = {
  jobId: string;
  title: string;
  lastAt: number | null;
  lastBy: string | null;
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();

  const { userId } = useSession();
  const { signOut } = useAuth();
  const { chats, ensureByJob } = useChats(userId || "");
  const [remote, setRemote] = useState<RemoteChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const selectedJob = sp.get("job");

  async function onNew() {
    if (isCreatingNew) return;

    try {
      setIsCreatingNew(true);

      const draft = chats.find((c) => c.title === "New chat");
      if (draft) {
        router.push(`/dashboard?job=${draft.id}`);
        return;
      }

      const r = await fetch("/api/di/new-job", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": userId },
        body: "{}",
      });

      const raw = await r.text();
      let j: any;

      try {
        j = JSON.parse(raw);
      } catch {
        console.error("new-job not JSON:", raw);
        showToast("Failed to create new project. Invalid response.", "error");
        return;
      }

      if (!r.ok || !j?.jobId) {
        console.error(j?.error || "new-job failed");
        showToast(j?.error || "Failed to create new project", "error");
        return;
      }

      ensureByJob(j.jobId, "New chat");
      router.push(`/dashboard?job=${j.jobId}`);
      showToast("New project created successfully", "success");
    } catch (error) {
      console.error("Error creating new project:", error);
      showToast("An error occurred while creating project", "error");
    } finally {
      setIsCreatingNew(false);
    }
  }

  function openServerChat(rc: { jobId: string; title: string }) {
    router.push(`/chat/${rc.jobId}/summary`);
  }

  const handleLogout = async () => {
    try {
      await signOut();
      router.push("/");
      showToast("Logged out successfully", "info");
    } catch (error) {
      console.error("Error logging out:", error);
      showToast("Failed to log out", "error");
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/di/chats", { cache: "no-store" });

        if (!r.ok) {
          showToast(
            r.status === 502 || r.status === 503 || r.status === 504
              ? "Server is offline. Please try again."
              : `Failed to load chats (HTTP ${r.status})`,
            "error",
          );
          if (!cancelled) setRemote([]);
          return;
        }

        const text = await r.text();
        if (!text.trim()) {
          showToast("Server returned an empty response.", "error");
          if (!cancelled) setRemote([]);
          return;
        }

        let j: any;
        try {
          j = JSON.parse(text);
        } catch {
          showToast("Server returned invalid data.", "error");
          if (!cancelled) setRemote([]);
          return;
        }

        if (j?.ok) {
          if (!cancelled) setRemote(j.chats as RemoteChat[]);
        } else {
          showToast(j?.error || "Failed to load server chats", "error");
          if (!cancelled) setRemote([]);
        }
      } catch (e: any) {
        showToast("Server is offline. Please check and try again.", "error");
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const filteredServer = useMemo(() => {
    const draftIds = new Set(
      chats.filter((c) => c.title === "New chat").map((c) => c.id),
    );
    return remote.filter((rc) => !draftIds.has(rc.jobId));
  }, [remote, chats]);

  return (
    <aside className="h-[95%] flex flex-row">
      <div className="w-64 md:w-[280px] lg:w-[320px] h-full flex flex-col px-5 pt-5">
        <div className="p-4 border-b border-gray-800 flex justify-end">
          <button
            onClick={onNew}
            disabled={isCreatingNew}
            className="flex items-center gap-2 text-white transition-colors duration-200 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreatingNew ? "Creating..." : "New Project"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {!!chats.length && (
            <div>
              <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2 px-2">
                Local
              </div>
              <nav className="space-y-1">
                {chats.map((c) => {
                  const active =
                    pathname === "/dashboard" && selectedJob === c.id;
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard?job=${c.id}`}
                      className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150 ${
                        active
                          ? "bg-blue-600/10 text-blue-400 border border-blue-600/30"
                          : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                      }`}
                      title={c.title}
                    >
                      <span className="truncate flex-1">
                        {c.title || "Untitled"}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2 px-2">
              Server
            </div>

            {loading && (
              <div className="px-3 py-2 text-xs text-gray-500 animate-pulse">
                Loading chats...
              </div>
            )}

            {!loading && !filteredServer.length && (
              <div className="px-3 py-2 text-xs text-gray-600">
                No server chats.
              </div>
            )}

            <nav className="space-y-1">
              {filteredServer.map((rc) => (
                <button
                  key={rc.jobId}
                  onClick={() => openServerChat(rc)}
                  className="group w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 transition-all duration-150"
                  title={rc.title}
                >
                  <span className="truncate flex-1 text-left">{rc.title}</span>
                  <MoreVertical className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="border-t border-gray-800 p-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 rounded-lg transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>

          <Link
            href="/dashboard/settings"
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 rounded-lg transition-all duration-150"
          >
            <Settings className="w-4 h-4" />
            <span>Setting</span>
          </Link>
        </div>
      </div>

      <div
        className="w-0.5 bg-white animate-grow-center"
        style={{ height: "100%" }}
      ></div>

      <style jsx>{`
        @keyframes grow-center {
          from {
            height: 0%;
            opacity: 0;
          }
          to {
            height: 100%;
            opacity: 1;
          }
        }
        .animate-grow-center {
          animation: grow-center 1.5s ease-out forwards;
        }
      `}</style>
    </aside>
  );
}
