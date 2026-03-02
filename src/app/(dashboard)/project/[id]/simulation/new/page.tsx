"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { InputField, TextAreaField } from "@/components/common/inputFeild/page";
import { createSimulationRun } from "@/lib/api-client/simulation";

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

export default function ProjectNewSimulationPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const isNumber = type === "number";
    setFormData((prev) => ({
      ...prev,
      [name]: isNumber ? Number(value) || 0 : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (formData.nodes < 1) newErrors.nodes = "At least 1 node is required";
    if (formData.vcpu_per_node < 1) newErrors.vcpu_per_node = "At least 1 vCPU is required";
    if (formData.memory_gb_per_node < 1) newErrors.memory_gb_per_node = "At least 1 GB memory is required";
    if (formData.concurrent_users < 1) newErrors.concurrent_users = "At least 1 concurrent user is required";
    if (formData.duration_seconds < 60) newErrors.duration_seconds = "Duration must be at least 60 seconds";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !projectId) return;
    setIsSubmitting(true);
    try {
      const simulationRun = await createSimulationRun(projectId, {
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
      router.push(`/project/${projectId}/simulation/${simulationRun.id}`);
    } catch (error) {
      console.error("Error creating simulation:", error);
      setErrors({
        general:
          error instanceof Error ? error.message : "Failed to create simulation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-white/60">Project not found.</p>
        <Link href="/dashboard" className="text-white hover:underline mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/project/${projectId}/simulation`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New simulation</h1>
          <p className="text-sm text-white/60 mt-1">Configure and start a new simulation run for this project</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-lg p-6 border border-border space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Basic information</h2>
            <div className="space-y-4">
              <InputField
                name="name"
                type="text"
                label="Simulation name"
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

          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Infrastructure</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                name="nodes"
                type="number"
                label="Number of nodes"
                value={formData.nodes.toString()}
                onChange={handleChange}
                error={errors.nodes}
                required
              />
              <InputField
                name="vcpu_per_node"
                type="number"
                label="vCPU per node"
                value={formData.vcpu_per_node.toString()}
                onChange={handleChange}
                error={errors.vcpu_per_node}
                required
              />
              <InputField
                name="memory_gb_per_node"
                type="number"
                label="Memory (GB) per node"
                value={formData.memory_gb_per_node.toString()}
                onChange={handleChange}
                error={errors.memory_gb_per_node}
                required
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Workload</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                name="concurrent_users"
                type="number"
                label="Concurrent users"
                value={formData.concurrent_users.toString()}
                onChange={handleChange}
                error={errors.concurrent_users}
                required
              />
              <InputField
                name="rps_target"
                type="number"
                label="Target RPS (requests per second)"
                value={formData.rps_target.toString()}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Simulation settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                name="duration_seconds"
                type="number"
                label="Duration (seconds)"
                value={formData.duration_seconds.toString()}
                onChange={handleChange}
                error={errors.duration_seconds}
                required
              />
              <InputField
                name="ramp_up_seconds"
                type="number"
                label="Ramp up (seconds)"
                value={formData.ramp_up_seconds.toString()}
                onChange={handleChange}
                required
              />
              <div>
                <label className="block text-sm font-medium text-white mb-2">Scenario</label>
                <select
                  name="scenario"
                  value={formData.scenario}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="baseline">Baseline</option>
                  <option value="high_load">High load</option>
                  <option value="stress_test">Stress test</option>
                  <option value="spike_test">Spike test</option>
                  <option value="endurance">Endurance</option>
                </select>
              </div>
            </div>
          </div>

          {errors.general && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{errors.general}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <Link
              href={`/project/${projectId}/simulation`}
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
                  Start simulation
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
