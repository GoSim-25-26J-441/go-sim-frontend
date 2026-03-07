"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { InputField, TextAreaField } from "@/components/common/inputFeild/page";
import { useAuth } from "@/providers/auth-context";
import { getAmgApdHeaders } from "@/app/features/amg-apd/api/amgApdClient";
import { createSimulationRun } from "@/lib/api-client/simulation";

interface VersionOption {
  id: string;
  label: string;
  description?: string;
}

interface SimulationFormData {
  name: string;
  description: string;
  nodes: number;
  vcpu_per_node: number;
  memory_gb_per_node: number;
  concurrent_users: number;
  rps_target: number;
  duration_seconds: number;
  ramp_up_seconds: number;
  scenario: string;
}

const NONE_VERSION_ID = "";

export default function NewSimulationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const versionFromUrl = searchParams.get("version");
  const { userId } = useAuth();

  const [formData, setFormData] = useState<SimulationFormData>({
    name: "",
    description: "",
    nodes: 3,
    vcpu_per_node: 4,
    memory_gb_per_node: 8,
    concurrent_users: 1000,
    rps_target: 800,
    duration_seconds: 600,
    ramp_up_seconds: 60,
    scenario: "baseline",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Diagram version from AMG-APD
  const [availableVersions, setAvailableVersions] = useState<VersionOption[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(NONE_VERSION_ID);
  const [versionDetailResponse, setVersionDetailResponse] = useState<unknown>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [debugView, setDebugView] = useState<"hide" | "show">("hide");

  // Fetch versions list from AMG-APD (no project scope for standalone simulator)
  useEffect(() => {
    const controller = new AbortController();
    setVersionsLoading(true);
    const headers = getAmgApdHeaders({ userId: userId ?? undefined });
    fetch("/api/amg-apd/versions", { signal: controller.signal, headers })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          versions?: Array<{ id: string; version_number?: number; title?: string; created_at?: string }>;
        };
        const list = data.versions ?? [];
        const mapped: VersionOption[] = list.map((v) => ({
          id: v.id,
          label:
            v.version_number != null && v.title?.trim()
              ? `v${v.version_number} · ${v.title}`
              : (v.title?.trim() || v.id),
          description: v.created_at
            ? `Created ${new Date(v.created_at).toLocaleDateString()}`
            : undefined,
        }));
        setAvailableVersions(mapped);
        if (versionFromUrl && mapped.some((m) => m.id === versionFromUrl)) {
          setSelectedVersionId(versionFromUrl);
        }
      })
      .catch(() => {})
      .finally(() => setVersionsLoading(false));
    return () => controller.abort();
  }, [userId, versionFromUrl]);

  // Fetch full version when one is selected
  useEffect(() => {
    if (!selectedVersionId || selectedVersionId === NONE_VERSION_ID) {
      setVersionDetailResponse(null);
      return;
    }
    const controller = new AbortController();
    setVersionDetailLoading(true);
    setVersionDetailResponse(null);
    const headers = getAmgApdHeaders({ userId: userId ?? undefined });
    fetch(`/api/amg-apd/versions/${encodeURIComponent(selectedVersionId)}`, {
      signal: controller.signal,
      headers,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setVersionDetailResponse({ error: res.status, body: data });
          return;
        }
        setVersionDetailResponse(data);
      })
      .catch((err) => setVersionDetailResponse({ fetchError: String(err) }))
      .finally(() => setVersionDetailLoading(false));
    return () => controller.abort();
  }, [selectedVersionId, userId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name.includes("_") || name === "nodes" || name === "scenario"
        ? value
        : Number(value) || 0,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (formData.nodes < 1) {
      newErrors.nodes = "At least 1 node is required";
    }
    if (formData.vcpu_per_node < 1) {
      newErrors.vcpu_per_node = "At least 1 vCPU is required";
    }
    if (formData.memory_gb_per_node < 1) {
      newErrors.memory_gb_per_node = "At least 1 GB memory is required";
    }
    if (formData.concurrent_users < 1) {
      newErrors.concurrent_users = "At least 1 concurrent user is required";
    }
    if (formData.duration_seconds < 60) {
      newErrors.duration_seconds = "Duration must be at least 60 seconds";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Create simulation run (uses API client which will call backend when available)
      const simulationRun = await createSimulationRun({
        name: formData.name,
        config: {
          nodes: formData.nodes,
          workload: {
            concurrent_users: formData.concurrent_users,
            rps_target: formData.rps_target,
            duration_seconds: formData.duration_seconds,
            ramp_up_seconds: formData.ramp_up_seconds,
          },
          resources: {
            vcpu_per_node: formData.vcpu_per_node,
            memory_gb_per_node: formData.memory_gb_per_node,
          },
          scenario: formData.scenario,
          description: formData.description || undefined,
        },
      });

      // Optionally start the simulation immediately
      // await startSimulationRun(simulationRun.id);

      // Redirect to simulator dashboard or to the detail page
      router.push(`/simulator/${simulationRun.id}`);
    } catch (error) {
      console.error("Error creating simulation:", error);
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : "Failed to create simulation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/simulator"
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Simulation</h1>
          <p className="text-sm text-white/60 mt-1">
            Configure and start a new simulation run
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-lg p-6 border border-border space-y-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
            <div className="space-y-4">
              <InputField
                name="name"
                type="text"
                label="Simulation Name"
                placeholder="e.g., High Load Test - 2000 Users"
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
                required
              />
              <TextAreaField
                name="description"
                label="Description (optional)"
                placeholder="Describe the purpose of this simulation..."
                value={formData.description}
                onChange={handleChange}
                rows={3}
                required={false}
              />
            </div>
          </div>

          {/* Infrastructure Configuration */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Infrastructure</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                name="nodes"
                type="number"
                label="Number of Nodes"
                value={formData.nodes.toString()}
                onChange={handleChange}
                error={errors.nodes}
                required
                min={1}
              />
              <InputField
                name="vcpu_per_node"
                type="number"
                label="vCPU per Node"
                value={formData.vcpu_per_node.toString()}
                onChange={handleChange}
                error={errors.vcpu_per_node}
                required
                min={1}
              />
              <InputField
                name="memory_gb_per_node"
                type="number"
                label="Memory (GB) per Node"
                value={formData.memory_gb_per_node.toString()}
                onChange={handleChange}
                error={errors.memory_gb_per_node}
                required
                min={1}
              />
            </div>
          </div>

          {/* Workload Configuration */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Workload</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                name="concurrent_users"
                type="number"
                label="Concurrent Users"
                value={formData.concurrent_users.toString()}
                onChange={handleChange}
                error={errors.concurrent_users}
                required
                min={1}
              />
              <InputField
                name="rps_target"
                type="number"
                label="Target RPS (Requests Per Second)"
                value={formData.rps_target.toString()}
                onChange={handleChange}
                required
                min={1}
              />
            </div>
          </div>

          {/* Simulation Settings */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Simulation Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Diagram version
                </label>
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  disabled={versionsLoading}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                >
                  <option value={NONE_VERSION_ID}>Use default</option>
                  {availableVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                {versionsLoading && (
                  <p className="text-xs text-white/50 mt-1">Loading versions…</p>
                )}
              </div>
              <InputField
                name="duration_seconds"
                type="number"
                label="Duration (seconds)"
                value={formData.duration_seconds.toString()}
                onChange={handleChange}
                error={errors.duration_seconds}
                required
                min={60}
              />
              <InputField
                name="ramp_up_seconds"
                type="number"
                label="Ramp Up (seconds)"
                value={formData.ramp_up_seconds.toString()}
                onChange={handleChange}
                required
                min={0}
              />
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Scenario
                </label>
                <select
                  name="scenario"
                  value={formData.scenario}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="baseline">Baseline</option>
                  <option value="high_load">High Load</option>
                  <option value="stress_test">Stress Test</option>
                  <option value="spike_test">Spike Test</option>
                  <option value="endurance">Endurance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errors.general && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{errors.general}</p>
            </div>
          )}

          {/* Debug: Version API response */}
          <div className="border border-white/10 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white/5">
              <span className="text-xs font-medium text-white/70">Debug: Version API response</span>
              <select
                value={debugView}
                onChange={(e) => setDebugView(e.target.value as "hide" | "show")}
                className="text-xs px-2 py-1 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                <option value="hide">Hide</option>
                <option value="show">Show version response</option>
              </select>
            </div>
            {debugView === "show" && (
              <div className="p-3 border-t border-white/10 bg-black/20 max-h-64 overflow-auto">
                {versionDetailLoading ? (
                  <p className="text-xs text-white/50">Loading…</p>
                ) : versionDetailResponse === null ? (
                  <p className="text-xs text-white/50">
                    Select a diagram version to load response.
                  </p>
                ) : (
                  <pre className="text-[11px] font-mono text-white/80 whitespace-pre-wrap break-all">
                    {JSON.stringify(versionDetailResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <Link
              href="/simulator"
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Simulation
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

