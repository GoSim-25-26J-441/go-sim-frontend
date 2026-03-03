"use client";

import { useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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

// Scenario editor state mirroring simulation-core YAML schema
interface ScenarioHost {
  id: string;
  cores: number;
}

interface ScenarioDownstreamCallLatency {
  mean: number;
  sigma: number;
}

interface ScenarioDownstreamCall {
  to: string;
  call_count_mean: number;
  call_latency_ms: ScenarioDownstreamCallLatency;
  downstream_fraction_cpu: number;
}

interface ScenarioNetLatency {
  mean: number;
  sigma: number;
}

interface ScenarioEndpoint {
  path: string;
  mean_cpu_ms: number;
  cpu_sigma_ms: number;
  default_memory_mb?: number;
  downstream: ScenarioDownstreamCall[];
  net_latency_ms: ScenarioNetLatency;
}

interface ScenarioService {
  id: string;
  replicas: number;
  model: string;
  cpu_cores?: number;
  memory_mb?: number;
  endpoints: ScenarioEndpoint[];
}

type ArrivalType = "poisson" | "uniform" | "normal" | "bursty" | "constant";

interface ScenarioArrival {
  type: ArrivalType;
  rate_rps: number;
  stddev_rps?: number;
  burst_rate_rps?: number;
  burst_duration_seconds?: number;
  quiet_duration_seconds?: number;
}

interface ScenarioWorkloadPattern {
  from: string;
  to: string;
  arrival: ScenarioArrival;
}

interface ScenarioPolicies {
  // Passed through to simulation-core; keep as unknown for now
  [key: string]: unknown;
}

interface ScenarioState {
  hosts: ScenarioHost[];
  services: ScenarioService[];
  workload: ScenarioWorkloadPattern[];
  policies?: ScenarioPolicies;
}

export default function ProjectNewSimulationPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const searchParams = useSearchParams();
  const version = searchParams.get("version");
  const isSampleScenario = version === "sample";

  const SAMPLE_SCENARIO_YAML = `hosts:
  - id: host-1
    cores: 4

services:
  - id: users
    replicas: 2
    model: cpu
    cpu_cores: 1.0
    memory_mb: 512
    endpoints:
      - path: /login
        mean_cpu_ms: 10
        cpu_sigma_ms: 2
        default_memory_mb: 16
        downstream: []
        net_latency_ms:
          mean: 5
          sigma: 1

workload:
  - from: client
    to: users:/login
    arrival:
      type: poisson
      rate_rps: 10
      stddev_rps: 0
      burst_rate_rps: 0
      burst_duration_seconds: 0
      quiet_duration_seconds: 0
`;

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
  const [scenario, setScenario] = useState<ScenarioState>({
    hosts: [{ id: "host-1", cores: 4 }],
    services: [
      {
        id: "svc1",
        replicas: 1,
        model: "cpu",
        cpu_cores: 1,
        memory_mb: 512,
        endpoints: [
          {
            path: "/test",
            mean_cpu_ms: 10,
            cpu_sigma_ms: 2,
            default_memory_mb: 16,
            downstream: [],
            net_latency_ms: { mean: 5, sigma: 1 },
          },
        ],
      },
    ],
    workload: [
      {
        from: "client",
        to: "svc1:/test",
        arrival: {
          type: "poisson",
          rate_rps: 10,
        },
      },
    ],
    policies: undefined,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "scenario"
          ? value
          : name === "name" || name === "description"
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

      // Redirect to project simulation list or run detail
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
          href={`/project/${projectId}/simulation`}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Simulation</h1>
          <p className="text-sm text-white/60 mt-1">
            {isSampleScenario
              ? "Sample scenario: create a test simulation using a predefined YAML."
              : "Configure and start a new simulation run for this project"}
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

          {/* Submit Button */}
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
              className="flex items-center gap-2 px-6 py-2 bg.white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
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

