/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/(dashboard)/page.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/modules/session/context";
import { useEffect, useState } from "react";
import { Plus, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
  useCreateProjectMutation,
} from "@/app/store/projectsApi";
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

  // 🔄 reflect query changes (e.g., clicking Local → draft)
  useEffect(() => {
    setJobId(sp.get("job"));
  }, [sp]);

  async function onNewProject() {
    if (isCreatingNew) return;

    try {
      setIsCreatingNew(true);

      // Sync user to backend before creating project (required for FK constraint)
      try {
        const firebaseUser = getCurrentUser();
        const token = await getFirebaseIdToken();
        if (firebaseUser && token) {
          const syncData: { email?: string; display_name?: string; photo_url?: string } = {};
          if (firebaseUser.email) {
            syncData.email = firebaseUser.email;
          }
          if (firebaseUser.displayName) {
            syncData.display_name = firebaseUser.displayName;
          }
          if (firebaseUser.photoURL) {
            syncData.photo_url = firebaseUser.photoURL;
          }
          // Call sync endpoint directly to include email (syncUser type doesn't include email)
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
        // Sync failed - log and show error; project creation will likely fail with FK error
        console.error("User sync failed:", syncError);
        const syncMsg = syncError instanceof Error ? syncError.message : String(syncError);
        showToast(
          `User sync failed: ${syncMsg}. Project creation may fail.`,
          "error",
        );
        // Continue anyway - project creation will show its own error if FK constraint fails
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
      
      // Check for FK constraint error
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
      {/* Temporary Chat Button - Top Right */}
      <div className="absolute top-6 right-6">
        <button
          onClick={() => setShowTempChatModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Temporary Chat</span>
        </button>
      </div>

      <h2 className="text-lg font-medium">Architecture workspace</h2>

      {jobId && (
        <div className="bg-card py-2 text-sm">
          <span className="opacity-70 mr-2">Job:</span>
          <span className="font-mono">{jobId}</span>
        </div>
      )}

      {/* Centered New Project Button */}
      <div className="flex items-center justify-center min-h-[400px]">
        <button
          onClick={onNewProject}
          disabled={isCreatingNew}
          className="flex items-center gap-3 px-6 py-4 rounded-xl border border-border bg-surface hover:bg-surface/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <div className="text-left">
            <div className="font-medium text-lg">New Project</div>
            <div className="opacity-60 text-sm">Create a new architecture project</div>
          </div>
        </button>
      </div>

      {jobId && (
        <div className="flex gap-2 pt-2">
          <Link href={`/project/${jobId}/summary`} className="text-sm underline opacity-80 hover:opacity-100">
            Open Summary
          </Link>
          <span className="opacity-40">·</span>
          <Link href={`/project/${jobId}/chat`} className="text-sm underline opacity-80 hover:opacity-100">
            Open Chat
          </Link>
        </div>
      )}

      {/* Temporary Chat Modal */}
      <TempChatModal
        isOpen={showTempChatModal}
        onClose={() => setShowTempChatModal(false)}
      />
    </div>
  );
}
