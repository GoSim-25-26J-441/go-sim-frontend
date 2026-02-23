/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/(dashboard)/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/modules/session/context";
import { useEffect, useState } from "react";
import { MessageCircle,  ShieldAlert, LayersPlus } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useCreateProjectMutation } from "@/app/store/projectsApi";
import { getCurrentUser, getFirebaseIdToken } from "@/lib/firebase/auth";
import TempChatModal from "@/components/chat/TempChatModal";

export default function DashboardLanding() {
  const router = useRouter();
  const { userId } = useSession();
  const sp = useSearchParams();
  const { showToast } = useToast();

  const [jobId, setJobId] = useState<string | null>(sp.get("job"));
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showTempChatModal, setShowTempChatModal] = useState(false);
  const [createProject] = useCreateProjectMutation();

  useEffect(() => {
    setJobId(sp.get("job"));
  }, [sp]);

  async function onNewProject() {
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

  return (
    <div className="relative p-6 space-y-4 min-h-full">
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-row justify-between items-center w-full">
          <h2 className="text-lg font-medium">Architecture workspace</h2>

          <div className="flex flex-row gap-1">
            <button
              onClick={() => setShowTempChatModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-800/50 text-white/80 hover:text-white transition-colors shadow-md"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-sm font-regular">Temporary Chat</span>
            </button>
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

      <div className="flex mt-10">
        <button
          onClick={onNewProject}
          disabled={isCreatingNew}
          className="flex items-center gap-1 px-3 py-2 rounded-md bg-[#E5E7EB]/80 hover:bg-[#E5E7EB]/40 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          <LayersPlus className="w-4 h-4" />
          <div className="font-medium text-xs">
            New Project (draw diagram/spec)
          </div>
        </button>
      </div>

      <TempChatModal
        isOpen={showTempChatModal}
        onClose={() => setShowTempChatModal(false)}
      />
    </div>
  );
}
