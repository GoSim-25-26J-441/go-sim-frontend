/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-context";
import { useEffect, useState, useRef } from "react";
import {
  Plus,
  LogOut,
  Settings,
  MoreVertical,
  Edit,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
  useGetProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  type Project,
} from "../store/projectsApi";
import { getCurrentUser, getFirebaseIdToken } from "@/lib/firebase/auth";
import { diFetchClient } from "@/modules/di/clientFetch";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const { showToast } = useToast();

  const { signOut } = useAuth();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const {
    data: projects = [],
    isLoading: loading,
    isError,
    error,
  } = useGetProjectsQuery();
  const [createProject, { isLoading: isCreatingRemote }] =
    useCreateProjectMutation();
  const [updateProject] = useUpdateProjectMutation();
  const [deleteProject] = useDeleteProjectMutation();

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isOpeningMenuRef = useRef(false);

  const selectedProject = sp.get("project") ?? sp.get("job");

  async function onNew() {
    if (isCreatingNew) return;

    try {
      setIsCreatingNew(true);

      try {
        const firebaseUser = getCurrentUser();
        const token = await getFirebaseIdToken();
        if (firebaseUser && token) {
          const syncData: {
            email?: string;
            display_name?: string;
            photo_url?: string;
          } = {};
          if (firebaseUser.email) {
            syncData.email = firebaseUser.email;
          }
          if (firebaseUser.displayName) {
            syncData.display_name = firebaseUser.displayName;
          }
          if (firebaseUser.photoURL) {
            syncData.photo_url = firebaseUser.photoURL;
          }
          const syncRes = await fetch("/api/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(syncData),
          });
          if (!syncRes.ok) {
            const syncErrorText = await syncRes.text();
            let syncErrorMsg = `Sync failed: ${syncRes.status}`;
            try {
              const syncErrorJson = JSON.parse(syncErrorText);
              syncErrorMsg = syncErrorJson?.error || syncErrorMsg;
            } catch {
              if (syncErrorText) syncErrorMsg = syncErrorText.slice(0, 200);
            }
            throw new Error(syncErrorMsg);
          }
        }
      } catch (syncError) {
        console.error("User sync failed:", syncError);
        const syncMsg =
          syncError instanceof Error ? syncError.message : String(syncError);
        showToast(
          `User sync failed: ${syncMsg}. Project creation may fail.`,
          "error",
        );
      }

      const project = await createProject({
        name: "New project",
        is_temporary: false,
      }).unwrap();

      router.push(`/diagram?project=${project.id}`);
      showToast("New project created successfully", "success");
    } catch (e: any) {
      const offline =
        e?.status === "FETCH_ERROR" ||
        e?.status === 502 ||
        e?.status === 503 ||
        e?.status === 504;

      const errorMessage =
        e?.data?.error || e?.error || "Failed to create new project";

      if (errorMessage.includes("foreign key constraint")) {
        showToast(
          "Please ensure you are logged in and try again. If the issue persists, contact support.",
          "error",
        );
      } else {
        showToast(
          offline ? "Server is offline. Please try again." : errorMessage,
          "error",
        );
      }
    } finally {
      setIsCreatingNew(false);
    }
  }

  useEffect(() => {
    if (!isError) return;

    const e: any = error;
    const offline =
      e?.status === "FETCH_ERROR" ||
      e?.status === 502 ||
      e?.status === 503 ||
      e?.status === 504;

    const errorMessage =
      e?.error || e?.data?.error || "Failed to load projects";
    console.error("Projects fetch error:", e, errorMessage);

    showToast(
      offline ? "Server is offline. Please check and try again." : errorMessage,
      "error",
    );
  }, [isError, error, showToast]);

  useEffect(() => {
    if (!openMenuId) return;

    function handleClickOutside(event: MouseEvent) {
      if (isOpeningMenuRef.current) {
        isOpeningMenuRef.current = false;
        return;
      }

      const currentOpenMenuId = openMenuId;
      if (!currentOpenMenuId) return;

      const target = event.target as Element;
      const menuElement = menuRefs.current[currentOpenMenuId];

      if (menuElement?.contains(target)) {
        return;
      }

      const clickedButton = target.closest(
        'button[aria-label="Project options"]',
      );
      if (clickedButton) {
        return;
      }

      // Close the menu
      setOpenMenuId(null);
    }

    // Use a small delay to ensure button click completes first
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [openMenuId]);

  const handleRenameClick = (project: Project) => {
    setRenamingId(project.id);
    setRenameValue(project.name || "");
    setOpenMenuId(null);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameSubmit = async (projectId: string) => {
    if (!renameValue.trim()) {
      showToast("Project name cannot be empty", "error");
      return;
    }
    try {
      await updateProject({ id: projectId, name: renameValue.trim() }).unwrap();
      setRenamingId(null);
      setRenameValue("");
      showToast("Project renamed successfully", "success");
    } catch (e: any) {
      showToast(
        e?.data?.error || e?.error || "Failed to rename project",
        "error",
      );
    }
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDeleteClick = async (project: Project) => {
    setOpenMenuId(null);
    if (
      !confirm(
        `Are you sure you want to delete "${project.name || "Untitled"}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteProject(project.id).unwrap();
      showToast("Project deleted successfully", "success");
      if (selectedProject === project.id) {
        router.push("/dashboard");
      }
    } catch (e: any) {
      showToast(
        e?.data?.error || e?.error || "Failed to delete project",
        "error",
      );
    }
  };

  const handleProjectClick = async (projectId: string, e: React.MouseEvent) => {
    if (openMenuId === projectId) {
      e.preventDefault();
      return;
    }

    e.preventDefault();

    try {
      const response = await diFetchClient(
        `/api/projects/${projectId}/summary`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.status}`);
      }

      const summary = await response.json();

      const hasDiagram =
        summary?.latest_diagram_version?.diagram_json &&
        typeof summary.latest_diagram_version.diagram_json === "object" &&
        Object.keys(summary.latest_diagram_version.diagram_json).length > 0;

      if (hasDiagram) {
        router.push(`/project/${projectId}/summary`);
      } else {
        router.push(`/diagram?project=${projectId}`);
      }
    } catch (error) {
      console.error("Failed to fetch project summary:", error);
      router.push(`/diagram?project=${projectId}`);
    }
  };

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

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-2 px-2">
              Projects
            </div>

            {loading && (
              <div className="px-3 py-2 text-xs text-gray-500 animate-pulse">
                Loading projects...
              </div>
            )}

            {!loading && !projects.length && (
              <div className="px-3 py-2 text-xs text-gray-600">
                No projects yet.
              </div>
            )}

            <nav className="space-y-1">
              {projects
                .filter((project) => project.id)
                .map((project) => {
                  const isActive =
                    pathname === "/dashboard" && selectedProject === project.id;
                  const isRenaming = renamingId === project.id;

                  return (
                    <div
                      key={project.id}
                      className={`group relative flex items-center rounded-lg transition-all duration-150 ${
                        isActive
                          ? "bg-white-600/10 text-white-400 border border-white-600/30"
                          : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                      }`}
                    >
                      {isRenaming ? (
                        <div className="flex items-center gap-2 p-1 flex-1">
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameSubmit(project.id);
                              } else if (e.key === "Escape") {
                                handleRenameCancel();
                              }
                            }}
                            onBlur={() => handleRenameSubmit(project.id)}
                            className="flex-1 rounded border border-gray-700/50 px-2 py-1 text-xs text-white"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="flex items-center flex-1">
                          <button
                            type="button"
                            onClick={(e) => handleProjectClick(project.id, e)}
                            className="flex items-center justify-between flex-1 px-3 py-2 text-sm min-w-0 text-left hover:bg-transparent"
                            title={project.name ?? project.id}
                          >
                            <span className="truncate flex-1">
                              {project.name || "Untitled"}
                            </span>
                          </button>
                          <div
                            className="relative flex-shrink-0"
                            ref={(el) => {
                              menuRefs.current[project.id] = el;
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!project.id) return;

                                isOpeningMenuRef.current = true;

                                setOpenMenuId((currentId) => {
                                  return currentId === project.id
                                    ? null
                                    : project.id;
                                });

                                setTimeout(() => {
                                  isOpeningMenuRef.current = false;
                                }, 200);
                              }}
                              className={`px-2 py-2 transition-opacity flex-shrink-0 cursor-pointer ${
                                openMenuId === project.id
                                  ? "opacity-100"
                                  : "opacity-30 group-hover:opacity-100 hover:opacity-100"
                              }`}
                              aria-label="Project options"
                              aria-expanded={openMenuId === project.id}
                              type="button"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {openMenuId === project.id && (
                              <div
                                className="absolute right-0 top-full mt-3 w-56 py-2 bg-[#1F2937] border border-gray-700 rounded-md shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRenameClick(project);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700/50 transition-colors duration-150"
                                  type="button"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Rename</span>
                                </button>
                                <div className="h-[1px] bg-white mx-2 my-2" />
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDeleteClick(project);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                                  type="button"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
