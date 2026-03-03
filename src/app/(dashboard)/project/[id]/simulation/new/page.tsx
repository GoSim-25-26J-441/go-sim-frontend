"use client";

import { useMemo, useState } from "react";
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

function scenarioToYaml(scenario: ScenarioState): string {
  const lines: string[] = [];

  // hosts
  lines.push("hosts:");
  if (scenario.hosts.length === 0) {
    lines.push("  []");
  } else {
    for (const host of scenario.hosts) {
      lines.push(`  - id: ${host.id || "host-1"}`);
      lines.push(`    cores: ${host.cores || 1}`);
    }
  }

  // services
  lines.push("", "services:");
  if (scenario.services.length === 0) {
    lines.push("  []");
  } else {
    for (const svc of scenario.services) {
      lines.push(`  - id: ${svc.id || "svc1"}`);
      lines.push(`    replicas: ${svc.replicas || 1}`);
      lines.push(`    model: ${svc.model || "cpu"}`);

      const cpuCores = svc.cpu_cores && svc.cpu_cores > 0 ? svc.cpu_cores : 1.0;
      const memoryMb = svc.memory_mb && svc.memory_mb > 0 ? svc.memory_mb : 512.0;
      lines.push(`    cpu_cores: ${cpuCores}`);
      lines.push(`    memory_mb: ${memoryMb}`);

      lines.push("    endpoints:");
      if (svc.endpoints.length === 0) {
        lines.push("      []");
      } else {
        for (const ep of svc.endpoints) {
          lines.push(`      - path: ${ep.path}`);
          lines.push(`        mean_cpu_ms: ${ep.mean_cpu_ms}`);
          lines.push(`        cpu_sigma_ms: ${ep.cpu_sigma_ms}`);
          const defaultMem = ep.default_memory_mb && ep.default_memory_mb > 0 ? ep.default_memory_mb : 10.0;
          lines.push(`        default_memory_mb: ${defaultMem}`);

          // downstream
          lines.push("        downstream:");
          if (!ep.downstream || ep.downstream.length === 0) {
            lines.push("          []");
          } else {
            for (const d of ep.downstream) {
              lines.push(`          - to: ${d.to}`);
              lines.push(`            call_count_mean: ${d.call_count_mean}`);
              lines.push("            call_latency_ms:");
              lines.push(`              mean: ${d.call_latency_ms.mean}`);
              lines.push(`              sigma: ${d.call_latency_ms.sigma}`);
              lines.push(`            downstream_fraction_cpu: ${d.downstream_fraction_cpu}`);
            }
          }

          // net latency
          lines.push("        net_latency_ms:");
          lines.push(`          mean: ${ep.net_latency_ms.mean}`);
          lines.push(`          sigma: ${ep.net_latency_ms.sigma}`);
        }
      }
    }
  }

  // workload
  lines.push("", "workload:");
  if (scenario.workload.length === 0) {
    lines.push("  []");
  } else {
    for (const w of scenario.workload) {
      lines.push(`  - from: ${w.from || "client"}`);
      lines.push(`    to: ${w.to || "svc1:/test"}`);
      lines.push("    arrival:");
      lines.push(`      type: ${w.arrival.type}`);
      lines.push(`      rate_rps: ${w.arrival.rate_rps ?? 0}`);

      if (w.arrival.type === "normal") {
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
      } else if (w.arrival.type === "bursty") {
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(
          `      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`
        );
        lines.push(
          `      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`
        );
      } else {
        // keep optional fields present with safe defaults so the engine has everything it expects
        lines.push(`      stddev_rps: ${w.arrival.stddev_rps ?? 0}`);
        lines.push(`      burst_rate_rps: ${w.arrival.burst_rate_rps ?? 0}`);
        lines.push(
          `      burst_duration_seconds: ${w.arrival.burst_duration_seconds ?? 0}`
        );
        lines.push(
          `      quiet_duration_seconds: ${w.arrival.quiet_duration_seconds ?? 0}`
        );
      }
    }
  }

  // policies (optional, passed through)
  lines.push("", "policies:");
  if (!scenario.policies || Object.keys(scenario.policies).length === 0) {
    lines.push("  {}");
  } else {
    // For now, keep this minimal – backend treats it as pass-through.
    lines.push("  # policies editing not yet implemented");
  }

  return lines.join("\n");
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

  const arrivalTypes: ArrivalType[] = ["poisson", "uniform", "normal", "bursty", "constant"];

  const scenarioYaml = useMemo(
    () => (isSampleScenario ? SAMPLE_SCENARIO_YAML : scenarioToYaml(scenario)),
    [isSampleScenario, scenario]
  );

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
          // In sample mode, send the hardcoded sample YAML; otherwise keep using
          // the legacy scenario selector string for now.
          scenario: isSampleScenario ? SAMPLE_SCENARIO_YAML : formData.scenario,
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
              />
              <InputField
                name="vcpu_per_node"
                type="number"
                label="vCPU per Node"
                value={formData.vcpu_per_node.toString()}
                onChange={handleChange}
                error={errors.vcpu_per_node}
                required
              />
              <InputField
                name="memory_gb_per_node"
                type="number"
                label="Memory (GB) per Node"
                value={formData.memory_gb_per_node.toString()}
                onChange={handleChange}
                error={errors.memory_gb_per_node}
                required
              />
            </div>
          </div>

          {/* Hosts (from scenario YAML) */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Hosts</h2>
            <div className="space-y-3">
              {scenario.hosts.map((host, index) => (
                <div
                  key={host.id || index}
                  className="flex flex-col md:flex-row md:items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3"
                >
                  <div className="flex-1 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        Host ID
                      </label>
                      <input
                        type="text"
                        value={host.id}
                        onChange={(e) =>
                          setScenario((prev) => {
                            const next = { ...prev, hosts: [...prev.hosts] };
                            next.hosts[index] = { ...next.hosts[index], id: e.target.value };
                            return next;
                          })
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        CPU cores
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={host.cores}
                        onChange={(e) =>
                          setScenario((prev) => {
                            const cores = Number(e.target.value) || 1;
                            const next = { ...prev, hosts: [...prev.hosts] };
                            next.hosts[index] = { ...next.hosts[index], cores };
                            return next;
                          })
                        }
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={scenario.hosts.length === 1}
                    onClick={() =>
                      setScenario((prev) => ({
                        ...prev,
                        hosts: prev.hosts.filter((_, i) => i !== index),
                      }))
                    }
                    className="self-start px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setScenario((prev) => ({
                    ...prev,
                    hosts: [
                      ...prev.hosts,
                      { id: `host-${prev.hosts.length + 1}`, cores: 4 },
                    ],
                  }))
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
              >
                Add host
              </button>
            </div>
          </div>

          {/* Services (from scenario YAML) */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Services & Endpoints</h2>
            <div className="space-y-4">
              {scenario.services.map((svc, svcIndex) => (
                <div
                  key={svc.id || svcIndex}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Service ID
                        </label>
                        <input
                          type="text"
                          value={svc.id}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = { ...services[svcIndex], id: e.target.value };
                              return { ...prev, services };
                            })
                          }
                          className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Replicas
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={svc.replicas}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                replicas: Number(e.target.value) || 1,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-20 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Model
                        </label>
                        <select
                          value={svc.model}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = { ...services[svcIndex], model: e.target.value };
                              return { ...prev, services };
                            })
                          }
                          className="px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          <option value="cpu">cpu</option>
                          <option value="mixed">mixed</option>
                          <option value="db_latency">db_latency</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          CPU cores
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={svc.cpu_cores ?? 1}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                cpu_cores: Number(e.target.value) || 0,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-24 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Memory (MB)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={svc.memory_mb ?? 512}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const services = [...prev.services];
                              services[svcIndex] = {
                                ...services[svcIndex],
                                memory_mb: Number(e.target.value) || 0,
                              };
                              return { ...prev, services };
                            })
                          }
                          className="w-28 px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={scenario.services.length === 1}
                      onClick={() =>
                        setScenario((prev) => ({
                          ...prev,
                          services: prev.services.filter((_, i) => i !== svcIndex),
                        }))
                      }
                      className="self-start px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove service
                    </button>
                  </div>

                  {/* Endpoints (read-only/minimal editing) */}
                  <div className="mt-3 border-t border-white/10 pt-3 space-y-2">
                    <p className="text-xs font-medium text-white/70">Endpoints</p>
                    {svc.endpoints.map((ep, epIndex) => (
                      <div
                        key={`${svc.id}-${ep.path}-${epIndex}`}
                        className="flex flex-col md:flex-row md:items-center gap-3 bg-black/40 border border-white/10 rounded px-3 py-2"
                      >
                        <div className="flex-1">
                          <span className="text-xs text-white/50">Path</span>
                          <span className="ml-2 text-sm text-white font-mono">{ep.path}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/50">Mean CPU</span>
                          <span className="text-sm text-white">
                            {ep.mean_cpu_ms}
                            <span className="text-xs text-white/50 ml-1">ms</span>
                          </span>
                        </div>
                      </div>
                    ))}
                    {svc.endpoints.length === 0 && (
                      <p className="text-xs text-white/40">
                        Endpoints are defined in the scenario file and will be populated from it.
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setScenario((prev) => ({
                    ...prev,
                    services: [
                      ...prev.services,
                      {
                        id: `svc${prev.services.length + 1}`,
                        replicas: 1,
                        model: "cpu",
                        cpu_cores: 1,
                        memory_mb: 512,
                        endpoints: [],
                      },
                    ],
                  }))
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg-white/20"
              >
                Add service
              </button>
            </div>
          </div>

          {/* Scenario Workload Editor */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Workload Patterns</h2>
            <p className="text-xs text-white/60 mb-3">
              Define how traffic flows from clients to service endpoints. Services and endpoints come
              from the upstream scenario file; here you configure arrival patterns (RPS, bursts, etc.).
            </p>
            <div className="space-y-4">
              {scenario.workload.map((pattern, index) => {
                const endpointOptions =
                  scenario.services.flatMap((svc) =>
                    svc.endpoints.map((ep) => ({
                      value: `${svc.id}:${ep.path}`,
                      label: `${svc.id}${ep.path}`,
                    }))
                  ) ?? [];

                return (
                  <div
                    key={index}
                    className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        Pattern {index + 1}
                      </p>
                      <button
                        type="button"
                        disabled={scenario.workload.length === 1}
                        onClick={() =>
                          setScenario((prev) => ({
                            ...prev,
                            workload: prev.workload.filter((_, i) => i !== index),
                          }))
                        }
                        className="px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Remove pattern
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          From
                        </label>
                        <input
                          type="text"
                          value={pattern.from}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              workload[index] = { ...workload[index], from: e.target.value };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          placeholder="e.g. client"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          To (service:endpoint)
                        </label>
                        <select
                          value={pattern.to}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              workload[index] = { ...workload[index], to: e.target.value };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          {endpointOptions.length === 0 && (
                            <option value={pattern.to || ""}>
                              {pattern.to || "No endpoints available"}
                            </option>
                          )}
                          {endpointOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Arrival type
                        </label>
                        <select
                          value={pattern.arrival.type}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              const current = workload[index];
                              workload[index] = {
                                ...current,
                                arrival: {
                                  ...current.arrival,
                                  type: e.target.value as ArrivalType,
                                },
                              };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        >
                          {arrivalTypes.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Base rate (RPS)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={pattern.arrival.rate_rps}
                          onChange={(e) =>
                            setScenario((prev) => {
                              const workload = [...prev.workload];
                              const current = workload[index];
                              workload[index] = {
                                ...current,
                                arrival: {
                                  ...current.arrival,
                                  rate_rps: Number(e.target.value) || 0,
                                },
                              };
                              return { ...prev, workload };
                            })
                          }
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                      </div>

                      {pattern.arrival.type === "normal" && (
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">
                            Std dev (RPS)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={pattern.arrival.stddev_rps ?? 0}
                            onChange={(e) =>
                              setScenario((prev) => {
                                const workload = [...prev.workload];
                                const current = workload[index];
                                workload[index] = {
                                  ...current,
                                  arrival: {
                                    ...current.arrival,
                                    stddev_rps: Number(e.target.value) || 0,
                                  },
                                };
                                return { ...prev, workload };
                              })
                            }
                            className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                      )}

                      {pattern.arrival.type === "bursty" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Burst rate (RPS)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.burst_rate_rps ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      burst_rate_rps: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Burst duration (s)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.burst_duration_seconds ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      burst_duration_seconds: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/70 mb-1">
                              Quiet duration (s)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={pattern.arrival.quiet_duration_seconds ?? 0}
                              onChange={(e) =>
                                setScenario((prev) => {
                                  const workload = [...prev.workload];
                                  const current = workload[index];
                                  workload[index] = {
                                    ...current,
                                    arrival: {
                                      ...current.arrival,
                                      quiet_duration_seconds: Number(e.target.value) || 0,
                                    },
                                  };
                                  return { ...prev, workload };
                                })
                              }
                              className="w-full px-3 py-1.5 bg-black/40 border border-white/20 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setScenario((prev) => {
                    const defaultTo =
                      prev.services[0]?.endpoints[0]
                        ? `${prev.services[0].id}:${prev.services[0].endpoints[0].path}`
                        : "svc1:/test";
                    return {
                      ...prev,
                      workload: [
                        ...prev.workload,
                        {
                          from: "client",
                          to: defaultTo,
                          arrival: {
                            type: "poisson",
                            rate_rps: 10,
                          },
                        },
                      ],
                    };
                  })
                }
                className="px-3 py-1.5 text-xs rounded bg-white/10 text-white hover:bg:white/20"
              >
                Add workload pattern
              </button>
            </div>
          </div>

          {/* Legacy high-level workload knobs (still used by current create API) */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Overall Workload (legacy)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                name="concurrent_users"
                type="number"
                label="Concurrent Users"
                value={formData.concurrent_users.toString()}
                onChange={handleChange}
                error={errors.concurrent_users}
                required
              />
              <InputField
                name="rps_target"
                type="number"
                label="Target RPS (Requests Per Second)"
                value={formData.rps_target.toString()}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {/* Scenario YAML preview (based on editor) */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Scenario YAML (preview)</h2>
            <p className="text-xs text-white/60 mb-2">
              This is the YAML that will be generated from the editor and sent to the simulation
              engine in the new flow. In sample mode it should mirror the predefined scenario file.
            </p>
            <textarea
              readOnly
              value={scenarioYaml}
              className="w-full h-56 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-white p-3 resize-y"
            />
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
              />
              <InputField
                name="ramp_up_seconds"
                type="number"
                label="Ramp Up (seconds)"
                value={formData.ramp_up_seconds.toString()}
                onChange={handleChange}
                required
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

