/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/modules/session/context";
import { useEffect, useState } from "react";
import { MessageCircle, ShieldAlert, LayersPlus, ArrowRight } from "lucide-react";
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
    <div className="relative flex min-h-full w-full flex-1 flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/40 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="text-md font-bold text-white">Architecture workspace</h1>
          <p className="mt-0.5 text-xs text-white/60">
            Start projects, capture topology, and move into simulation and cost workflows.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowTempChatModal(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-white/80 shadow-md transition-colors hover:bg-gray-800/50 hover:text-white"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-sm font-normal">Temporary Chat</span>
          </button>
          <button
            type="button"
            onClick={() => {}}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-white/80 shadow-md transition-colors hover:bg-gray-800/50 hover:text-white"
          >
            <ShieldAlert className="h-4 w-4" />
            <span className="text-sm font-normal">Docs & Guides</span>
          </button>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <div className="mb-12 flex flex-wrap md:mb-16">
          <button
            type="button"
            onClick={onNewProject}
            disabled={isCreatingNew}
            className="flex items-center gap-1 rounded-md bg-white px-3 py-2 text-xs font-medium text-black shadow-lg transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LayersPlus className="h-4 w-4" />
            <span>New Project (draw diagram/spec)</span>
          </button>
        </div>

        <div className="min-h-0 flex-1" aria-hidden />

        <div className="mt-auto w-full space-y-3 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-white">How the platform flows</h2>
            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95">
              Read-only guide
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-white/4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="border-b border-white/15 bg-linear-to-r from-sky-500/10 via-transparent to-emerald-500/10 px-4 py-3 md:px-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Typical path
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px] font-medium text-white/85">
                <span className="rounded-md border border-white/20 bg-black/30 px-2 py-1">Diagram</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-white/35" aria-hidden />
                <span className="rounded-md border border-white/20 bg-black/30 px-2 py-1">Simulate</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-white/35" aria-hidden />
                <span className="rounded-md border border-white/20 bg-black/30 px-2 py-1">Metrics</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-white/35" aria-hidden />
                <span className="rounded-md border border-white/20 bg-black/30 px-2 py-1">Cost</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/55">
                You move down this chain as data hardens: topology first, then evidence from runs, then
                scoring and dollars—without jumping straight to numbers you have not earned yet.
              </p>
            </div>

            <div className="divide-y divide-white/40">
              <section className="px-4 py-4 md:px-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold text-sky-300/90">01</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Projects & diagrams
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Each project holds your architecture: services, dependencies, and deployment shape.
                  Use <span className="font-medium text-white/85">New Project</span> to open the diagram
                  editor, sketch or refine the graph, and keep that topology as the source of truth for
                  later steps.
                </p>
              </section>
              <section className="px-4 py-4 md:px-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold text-amber-300/90">02</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Simulation & runs
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  From a project you configure scenarios and launch simulation runs. Runs produce
                  utilization, latency, and candidate instance sets so you can see how the architecture
                  behaves under load before you commit to sizing.
                </p>
              </section>
              <section className="px-4 py-4 md:px-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold text-emerald-300/90">03</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Metrics analysis
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  After a run exports candidates, metrics analysis compares each option against your
                  design targets (vCPU, memory, concurrent users). It highlights the best fit and
                  surfaces surplus or shortfall so tuning decisions stay grounded in numbers.
                </p>
              </section>
              <section className="px-4 py-4 md:px-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold text-violet-300/90">04</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Cost analysis
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Cost views attach public catalog pricing to the same workload assumptions. You can
                  explore by provider and region, compare monthly estimates, and see a cross-cloud
                  recommendation when catalog data is available—all tied back to the project and run
                  you started from here.
                </p>
              </section>
              <section className="px-4 py-4 md:px-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold text-white/45">+</span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-white/80">
                    Workspace tools
                  </h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  <span className="font-medium text-white/85">Temporary Chat</span> is for quick questions
                  without leaving the page; <span className="font-medium text-white/85">Docs & Guides</span>{" "}
                  will collect walkthroughs as they ship. Together they sit beside your project workflow
                  so help stays one click away.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>

      <TempChatModal
        isOpen={showTempChatModal}
        onClose={() => setShowTempChatModal(false)}
      />
    </div>
  );
}
