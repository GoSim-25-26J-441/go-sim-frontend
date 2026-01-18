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
import { useGetChatsQuery, useNewJobMutation } from "../store/uidp/diApi";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();

  const { userId } = useSession();
  const { signOut } = useAuth();
  const { chats, ensureByJob } = useChats(userId || "");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const {
    data: remote = [],
    isLoading: loading,
    isError,
    error,
  } = useGetChatsQuery();
  const [newJob, { isLoading: isCreatingRemote }] = useNewJobMutation();

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

      const { jobId } = await newJob().unwrap();
      
      ensureByJob(jobId, "New chat");
      router.push(`/dashboard?job=${jobId}`);
      showToast("New project created successfully", "success");
    } catch (e: any) {
      const offline =
        e?.status === "FETCH_ERROR" ||
        e?.status === 502 ||
        e?.status === 503 ||
        e?.status === 504;

      showToast(
        offline
          ? "Server is offline. Please try again."
          : e?.data?.error || e?.error || "Failed to create new project",
        "error",
      );
    } finally {
      setIsCreatingNew(false);
    }
  }

  function openServerChat(rc: { jobId: string; title: string }) {
    router.push(`/chat/${rc.jobId}/summary`);
  }

  useEffect(() => {
    if (!isError) return;

    const e: any = error;
    const offline =
      e?.status === "FETCH_ERROR" ||
      e?.status === 502 ||
      e?.status === 503 ||
      e?.status === 504;

    showToast(
      offline
        ? "Server is offline. Please check and try again."
        : e?.error || e?.data?.error || "Failed to load server chats",
      "error",
    );
  }, [isError, error, showToast]);

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
            disabled={isCreatingNew || isCreatingRemote}
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
