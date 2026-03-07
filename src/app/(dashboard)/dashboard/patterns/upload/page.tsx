"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAmgApdStore } from "@/app/features/amg-apd/state/useAmgApdStore";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import type { AnalysisResult } from "@/app/features/amg-apd/types";
import { ViewPatternsForProjectButton } from "@/app/features/amg-apd/components/ViewPatternsForProjectButton";

function decodeSafe(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchingVersions, setSearchingVersions] = useState(false);
  const [existingVersionsModalOpen, setExistingVersionsModalOpen] =
    useState(false);
  const [existingVersionsProjectId, setExistingVersionsProjectId] =
    useState("");

  const setLast = useAmgApdStore((s) => s.setLast);
  const editedYaml = useAmgApdStore((s) => s.editedYaml);
  const setEditedYaml = useAmgApdStore((s) => s.setEditedYaml);

  const router = useRouter();
  const searchParams = useSearchParams();

  const projectPublicId =
    searchParams.get("project_public_id") ??
    searchParams.get("projectPublicId") ??
    searchParams.get("public_id") ??
    "";

  const regen = searchParams.get("regen") === "1";
  const regenTitleRaw = searchParams.get("title") ?? "Edited architecture";
  const regenTitle = decodeSafe(regenTitleRaw);

  const ranRef = useRef(false);

  useEffect(() => {
    if (!regen) return;
    if (ranRef.current) return;
    ranRef.current = true;

    if (!editedYaml) {
      alert(
        "No edited YAML found.\n\nIf you refreshed this page, the edited YAML in session storage may be gone.\nGo back to the graph and click Generate Graph again.",
      );
      router.replace("/dashboard/patterns");
      return;
    }

    setTitle(regenTitle);
    setLoading(true);

    (async () => {
      try {
        const blob = new Blob([editedYaml], { type: "text/yaml" });
        const fd = new FormData();
        fd.append("file", blob, "edited-architecture.yaml");
        fd.append("title", regenTitle || "Edited architecture");

        const res = await fetch("/api/amg-apd/analyze-upload", {
          method: "POST",
          headers: getAmgApdHeaders({
            chatId: projectPublicId || undefined,
          }),
          body: fd,
        });

        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Request failed");
        }

        const data: AnalysisResult = await res.json();
        if (!data?.graph) throw new Error("Backend did not return a graph.");

        setLast(data);
        router.replace("/dashboard/patterns");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(err);
        alert("Analyze failed: " + msg);
        setLoading(false);
      }
    })();
  }, [regen, editedYaml, regenTitle, router, setLast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      const yamlText = await file.text();
      setEditedYaml(yamlText);

      const blob = new Blob([yamlText], { type: "text/yaml" });
      const fd = new FormData();
      fd.append("file", blob, file.name || "architecture.yaml");
      fd.append("title", title || "Uploaded");

      const res = await fetch("/api/amg-apd/analyze-upload", {
        method: "POST",
        headers: getAmgApdHeaders({
          chatId: projectPublicId || undefined,
        }),
        body: fd,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Request failed");
      }

      const data: AnalysisResult = await res.json();
      if (!data?.graph) throw new Error("Backend did not return a graph.");

      setLast(data);
      router.push("/dashboard/patterns");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      alert("Analyze failed: " + msg);
      setLoading(false);
    }
  }

  function handleViewExistingVersions() {
    setExistingVersionsProjectId(projectPublicId);
    setExistingVersionsModalOpen(true);
  }

  async function runViewExistingVersions(projectIDRaw: string) {
    setSearchingVersions(true);
    try {
      const projectID = (projectIDRaw || "").trim();
      if (!projectID) {
        throw new Error("project_public_id is required");
      }

      const res = await fetch(
        `/api/amg-apd/projects/${encodeURIComponent(projectID)}/latest`,
        {
          headers: getAmgApdHeaders({
            chatId: projectID || undefined,
          }),
        },
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load latest version for project");
      }

      const data: AnalysisResult & { yaml_content?: string } = await res.json();
      if (!data?.graph) throw new Error("Backend did not return a graph.");

      setLast(data);
      if (data?.yaml_content) setEditedYaml(data.yaml_content);
      router.push("/dashboard/patterns");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      alert("Could not load versions: " + msg);
    } finally {
      setSearchingVersions(false);
    }
  }

  if (loading || searchingVersions) {
    return (
      <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold mb-2">
                {searchingVersions
                  ? "Searching for versions…"
                  : "Analyzing architecture…"}
              </h1>
              <p className="text-sm opacity-70">
                {searchingVersions
                  ? "Loading your saved architecture versions."
                  : "Parsing YAML, building the graph, and running detectors."}
              </p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold mb-2">
              Upload YAML to Begin Analysis
            </h1>
            <p className="text-sm opacity-70">
              Upload your architecture specification to visualize and detect
              anti-patterns
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleViewExistingVersions}
              disabled={searchingVersions}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface/80 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {searchingVersions ? "Searching…" : "View Existing Versions"}
            </button>
            {/* Test Button using shared component with fixed project ID */}
            <ViewPatternsForProjectButton
              projectPublicId="archfind-33878-1296"
              label="Test Button"
            />
          </div>
        </div>

        {existingVersionsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">
                  View Existing Versions
                </h2>
                <p className="text-sm opacity-70 mt-1">
                  Enter the{" "}
                  <span className="font-medium">project_public_id</span> to load
                  the latest saved version.
                </p>
              </div>

              <input
                value={existingVersionsProjectId}
                onChange={(e) => setExistingVersionsProjectId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setExistingVersionsModalOpen(false);
                  if (e.key === "Enter") {
                    setExistingVersionsModalOpen(false);
                    void runViewExistingVersions(existingVersionsProjectId);
                  }
                }}
                placeholder="e.g. ARCHFIND-XXXX"
                className="block w-full rounded-lg border border-border bg-card px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface/80 transition-colors"
                  onClick={() => setExistingVersionsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => {
                    setExistingVersionsModalOpen(false);
                    void runViewExistingVersions(existingVersionsProjectId);
                  }}
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Architecture spec (YAML)
            </label>
            <input
              type="file"
              accept=".yaml,.yml,text/yaml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Title</label>
            <input
              className="block w-full rounded-lg border border-border bg-card px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={title}
              placeholder="Enter a title for this analysis"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!file || loading}
          >
            {loading ? "Analyzing…" : "Analyze & Visualize"}
          </button>
        </form>
      </div>
    </div>
  );
}
